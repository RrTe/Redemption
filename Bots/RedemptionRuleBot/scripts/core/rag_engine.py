import os
import requests
import time
import re
from typing import List, Dict, Any
from pinecone import Pinecone
from groq import Groq
from dotenv import load_dotenv
from scripts.core.knowledge_manager import KnowledgeManager

load_dotenv()

class RAGEngine:
    """
    Handles Retrieval-Augmented Generation using HuggingFace for local embeddings
    and Pinecone for vector search, with Groq for response generation.
    Supports a Draft -> Review self-correction loop.
    """
    
    def __init__(self):
        self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        self.index = self.pc.Index(os.getenv("PINECONE_INDEX_NAME"))
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        self.hf_token = os.getenv("HF_API_KEY")
        self.hf_model = "intfloat/multilingual-e5-large"
        self.hf_api_url = f"https://router.huggingface.co/hf-inference/models/{self.hf_model}"
        
        self.llm_model = "llama-3.3-70b-versatile"
        self.reviewer_model = "openai/gpt-oss-120b"
        
        # Load System Prompt (Drafter)
        prompt_path = os.path.join("scripts", "prompts", "judge_system_prompt.txt")
        if not os.path.exists(prompt_path):
            prompt_path = "judge_system_prompt.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt = f.read()

        # Load Reviewer Prompt
        review_prompt_path = os.path.join("scripts", "prompts", "judge_review_prompt.txt")
        if os.path.exists(review_prompt_path):
            with open(review_prompt_path, "r", encoding="utf-8") as f:
                self.review_prompt = f.read()
        else:
            self.review_prompt = None

        self.km = KnowledgeManager()
        
        # Researcher instructions (Step 1 & 4)
        researcher_path = os.path.join("scripts", "prompts", "researcher_prompt.txt")
        if os.path.exists(researcher_path):
            with open(researcher_path, "r", encoding="utf-8") as f:
                self.researcher_prompt = f.read()
        else:
            self.researcher_prompt = "Identify technical concepts, phases, and verbs in the query. List as comma-separated terms."

        # Selector instructions (Stage 2 Gate)
        selector_path = os.path.join("scripts", "prompts", "selector_prompt.txt")
        if os.path.exists(selector_path):
            with open(selector_path, "r", encoding="utf-8") as f:
                self.selector_prompt = f.read()
        else:
            self.selector_prompt = "Select the most relevant object version based on the query targets."

    def _embed_query(self, text: str) -> List[float]:
        payload = {"inputs": [f"query: {text}"]}
        headers = {"Authorization": f"Bearer {self.hf_token}"}
        
        max_retries = 3
        for attempt in range(max_retries):
            response = requests.post(self.hf_api_url, headers=headers, json=payload)
            if response.status_code == 200:
                return response.json()[0]
            elif response.status_code == 503:
                time.sleep(10)
                continue
            else:
                raise Exception(f"HuggingFace API error: {response.status_code}")
        
        raise Exception("HuggingFace Inference API failed.")

    def retrieve_context(self, query: str, top_k: int = 5, source: str = None) -> List[Dict[str, Any]]:
        try:
            vector = self._embed_query(query)
            filter_dict = {"source": source} if source else None
            results = self.index.query(vector=vector, top_k=top_k, include_metadata=True, filter=filter_dict)
            enriched = []
            for match in results['matches']:
                meta = dict(match['metadata'])
                meta['_score'] = round(float(match['score']), 3)
                enriched.append(meta)
            return enriched
        except Exception as e:
            print(f"Retrieval error: {e}")
            return None

    def search_only(self, query: str) -> str:
        """
        Performs a pure RAG search ONLY for Discord rulings.
        No LLM synthesis, no card data, no rulebook snippets.
        """
        metadata_list = self.retrieve_context(query)
        
        if not metadata_list:
            return "❌ No matching rulings found in the ruling-questions channel."
            
        context_parts = []
        # Get card names in the query to potentially filter irrelevant results
        card_matches = self.km.find_cards_in_text(query)
        identified_card_names = list(card_matches.keys())
        
        for meta in metadata_list:
            text = meta.get('text', '')
            # Optional check to keep it relevant to the cards in the query
            if identified_card_names:
                unauthorized_card = self.km.contains_unauthorized_cards(text, identified_card_names)
                if unauthorized_card: continue

            date = meta.get('date', 'Unknown')
            is_judge = "Official Judge" if meta.get('is_judge') else "Community User"
            context_parts.append(f"**Discord Ruling ({date}, {is_judge})**:\n{text}")
            
        if not context_parts:
            return "❌ No specific rulings found in the ruling-questions channel for this card/situation."
            
        context_str = "\n\n---\n\n".join(context_parts)
        return f"### FOUND DISCORD RULINGS ###\n\n{context_str}"

    def _extract_research_specs(self, question: str, card_matches: Dict[str, Any]) -> List[str]:
        """Stage 1: Identify keywords and types for deterministic rule injection."""
        card_context = ""
        for name, versions in card_matches.items():
            for v in versions:
                card_context += f"Card: {name}, Type: {v.get('Type')}\n"
        
        messages = [
            {"role": "system", "content": self.researcher_prompt},
            {"role": "user", "content": f"QUESTION: {question}\n\nCARDS INVOLVED:\n{card_context}"}
        ]
        
        try:
            # Use a fast model for the researcher stage
            completion = self.groq_client.chat.completions.create(model="llama-3.1-8b-instant", messages=messages, temperature=0.0)
            spec_str = completion.choices[0].message.content
            # Clean and split (Handle potential LLM formatting noise)
            raw_terms = [t.strip() for t in spec_str.replace(".", "").split(",")]
            terms = []
            for t in raw_terms:
                # Extract clean words from potential "1. Type: X" noise
                words = re.findall(r'\b[A-Za-z]{4,}\b', t) # 4+ letters
                terms.extend(words)
            
            # Remove generic words that cause bloat
            blacklist = {
                "Card", "Type", "Types", "Keywords", "Game", "Phases", "Question", 
                "Involved", "Character", "Characters", "Ability", "Abilities",
                "Rule", "Rules", "Phase", "Special", "Effect", "Effects"
            }
            terms = [t for t in terms if t.title() not in blacklist and t not in blacklist]
            
            # Limit to top 6 most specific keywords
            terms = list(dict.fromkeys(terms))[:6]
            
            print(f"[ENGINE] Researcher identified (Strictly Cleaned): {terms}", flush=True)
            return terms
        except Exception as e:
            print(f"[ENGINE] Researcher stage failed: {e}", flush=True)
            return []

    def _select_primary_version(self, question: str, card_matches: Dict[str, Any]) -> Dict[str, Any]:
        """Stage 2 Gate: Decide which card version is the primary subject to avoid pollution."""
        if not card_matches:
            return {}
            
        # If only one card version total, return it
        total_versions = sum(len(v) for v in card_matches.values())
        if total_versions == 1:
            name = list(card_matches.keys())[0]
            return {name: card_matches[name]}

        # If too many versions (> 3), and not obviously distinguishable, return empty (for clarification)
        if total_versions > 3:
             # Basic check: is there a version that matches a technical target from the question?
             pass # Will be handled by the selector LLM logic below

        card_context = ""
        for name, versions in card_matches.items():
            for i, v in enumerate(versions):
                card_context += f"Candidate ID: {name}_V{i+1}\nText: {v.get('SpecialAbility', '')}\nType: {v.get('Type', '')}\n\n"

        messages = [
            {"role": "system", "content": self.selector_prompt},
            {"role": "user", "content": f"USER_QUESTION: {question}\n\nCANDIDATES:\n{card_context}"}
        ]
        
        try:
            # Use a fast model for selection
            completion = self.groq_client.chat.completions.create(model="llama-3.1-8b-instant", messages=messages, temperature=0.0)
            choice = completion.choices[0].message.content.strip()
            
            print(f"[ENGINE] Selector chose: {choice}", flush=True)
            
            if "AMBIGUOUS" in choice or "CLARIFICATION" in choice:
                return {"AMBIGUITY": list(card_matches.keys())}
                
            # Parse the ID (Pattern: Name_VX) - Look for the ID specifically at the end
            match = re.search(r'([A-Za-z0-9\s\'\-,]+)_V(\d+)$', choice.strip())
            if not match:
                # Try middle of text match if LLM added chatter
                match = re.search(r'([A-Za-z0-9\s\'\-,]+)_V(\d+)', choice)

            if match:
                full_match_name = match.group(1).strip()
                v_idx_str = match.group(2)
                v_idx = int(v_idx_str) - 1
                
                # Check for exact name match in the parsed name
                for name in card_matches:
                    if name.lower() in full_match_name.lower():
                        if 0 <= v_idx < len(card_matches[name]):
                            print(f"[ENGINE] Gate confirmed: {name} Version {v_idx+1}", flush=True)
                            return {name: [card_matches[name][v_idx]]}
            
            # If selection fails to find a valid index, we must return ambiguity rather than fallback to V1
            print(f"[ENGINE] Selection gate failed to parse choice: '{choice}'. Returning Ambiguity.", flush=True)
            return {"AMBIGUITY": list(card_matches.keys())}
        except Exception as e:
            print(f"[ENGINE] Selection gate exception: {e}", flush=True)
            return {"AMBIGUITY": list(card_matches.keys())}

    def ask_judge(self, question: str) -> str:
        print(f"\n[ENGINE] Processing question: '{question}'", flush=True)
        
        # 1. IDENTIFY CARDS FIRST
        all_candidate_matches = self.km.find_cards_in_text(question)
        
        # 2. SELECTION GATE (Stage 2)
        card_matches = self._select_primary_version(question, all_candidate_matches)
        
        # Handle clarification request
        if "AMBIGUITY" in card_matches:
            names = ", ".join(card_matches["AMBIGUITY"])
            return f"⚠️ **CLARIFICATION REQUIRED**: I found multiple versions of the card(s) '{names}'. To give you a precise ruling, please specify which version or capability you are referring to (e.g., target or card type)."

        # 3. STAGE 1: RESEARCHER EXTRACTION
        research_keywords = self._extract_research_specs(question, card_matches)
        
        # 4. GET LAYERED CONTEXT (Deterministic injection based on ONLY the selected version)
        layered_context = self.km.get_comprehensive_context(question, research_keywords, card_matches)
        
        # Token Estimation Logic
        def estimate_tokens(text: str) -> int:
            return len(text) // 4
        
        ctx_tokens = estimate_tokens(layered_context)
        print(f"[ENGINE] Base Context: ~{ctx_tokens} tokens", flush=True)
        
        # 5. GET LAYER 4: SPECIFIC DISCORD RULINGS (RAG)
        # Use metadata filter to get ONLY discord rulings (Step 6)
        metadata_list = self.retrieve_context(question, source="discord")
        if metadata_list is None:
            return "⚠️ **TECHNICAL ERROR**: Retrieval failed."
            
        # Filter Discord rulings by cards identified in the query
        identified_card_names = list(card_matches.keys())
        
        context_parts = []
        for meta in metadata_list:
            text = meta.get('text', '')
            # Only filter if we actually identified cards in the user query
            if identified_card_names:
                unauthorized_card = self.km.contains_unauthorized_cards(text, identified_card_names)
                if unauthorized_card:
                    continue
            
            date = meta.get('date', 'Unknown')
            is_judge = "Official Judge" if meta.get('is_judge') else "Community User"
            score = meta.get('_score', 'N/A')
            relevance_pct = f"{int(score * 100)}%" if isinstance(score, float) else score
            context_parts.append(
                f"SOURCE: Discord Ruling\n"
                f"CITATION_DATA: Date: {date}, Status: {is_judge}, Relevance: {relevance_pct}\n"
                f"CONTENT: {text}"
            )
            
        discord_context = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant Discord rulings found."
        
        full_payload_text = self.system_prompt + layered_context + discord_context + question
        total_est_tokens = estimate_tokens(full_payload_text)
        print(f"[ENGINE] Full Payload: ~{total_est_tokens} estimated tokens", flush=True)
        
        if total_est_tokens > 8000:
            print(f"WARN: High Token usage: {total_est_tokens} tokens!", flush=True)
        
        # --- STAGE 1: Generate Draft ---
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user", 
                "content": f"{layered_context}\n\n### LAYER 4: HISTORICAL DISCORD RULINGS\n{discord_context}\n\nUSER QUESTION: {question}"
            }
        ]
        
        try:
            draft_completion = self.groq_client.chat.completions.create(model=self.llm_model, messages=messages, temperature=0.0)
            draft_answer = draft_completion.choices[0].message.content
            
            # --- STAGE 2: Review & Edit (Reactivated for V5 logic verification) ---
            if self.review_prompt:
                print(f"[ENGINE] Auditing draft answer with Reviewer stage...", flush=True)
                reviewer_input = (
                    f"DRAFT_ANSWER: {draft_answer}\n"
                    f"USER_QUESTION: {question}\n"
                    f"GROUNDING_CONTEXT: {layered_context}\n"
                    f"DISCORD_RULINGS: {discord_context}"
                )
                
                review_messages = [
                    {"role": "system", "content": self.review_prompt},
                    {"role": "user", "content": reviewer_input}
                ]
                
                final_completion = self.groq_client.chat.completions.create(model=self.llm_model, messages=review_messages, temperature=0.0)
                return final_completion.choices[0].message.content
            
            return draft_answer
            
        except Exception as e:
            return f"Error generating response: {e}"
