import os
import requests
import time
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

    def retrieve_context(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        try:
            vector = self._embed_query(query)
            results = self.index.query(namespace="__default__", vector=vector, top_k=top_k, include_metadata=True)
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

    def ask_judge(self, question: str) -> str:
        print(f"\n[ENGINE] Processing question: '{question}'", flush=True)
        metadata_list = self.retrieve_context(question)
        card_matches = self.km.find_cards_in_text(question)
        
        # Determine extra rule keywords
        extra_keywords = []
        question_lower = question.lower()
        phases = ["battle", "preparation", "upkeep", "draw", "discard", "phase"]
        for phase in phases:
            if phase in question_lower:
                extra_keywords.append(phase.capitalize())
                extra_keywords.append("Rulebook")
                extra_keywords.append("Phases")

        mechanical_verbs = [
            "reserve", "negate", "protect", "discard", "draw", "search", 
            "activate", "choose", "reveal", "place", "remove", "add",
            "modifier", "effect", "identifier"
        ]
        
        for name, versions in card_matches.items():
            for v in versions:
                if v.get("Type"):
                    extra_keywords.append(v["Type"])
                ability_lower = v.get("SpecialAbility", "").lower()
                for kw in mechanical_verbs:
                    if kw in ability_lower:
                        extra_keywords.append(kw.capitalize())
        
        distinct_keywords = list(set(extra_keywords))
        rule_snippets = self.km.find_rules_by_keyword(question, extra_keywords=distinct_keywords)
        
        if metadata_list is None:
            return "⚠️ **TECHNICAL ERROR**: Retrieval failed."

        card_context = self.km.format_card_context(card_matches)
        rule_context = ""
        if rule_snippets:
            rule_context = "--- OFFICIAL REDEMPTION RULES ---\n"
            for r in rule_snippets:
                rule_context += f"SECTION: {r.get('title', 'Unknown')}\nSOURCE: {r.get('doc', 'Unknown')}\nCONTENT: {r.get('content', 'No content available')}\n\n"
        
        context_parts = []
        identified_card_names = list(card_matches.keys())
        for meta in metadata_list:
            text = meta.get('text', '')
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
            
        context_str = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant Discord rulings found."
        
        # --- STAGE 1: Generate Draft ---
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user", 
                "content": f"{card_context}\n{rule_context}\n--- DISCORD RULINGS ---\n{context_str}\n\nUSER QUESTION: {question}"
            }
        ]
        
        try:
            draft_completion = self.groq_client.chat.completions.create(model=self.llm_model, messages=messages, temperature=0.0)
            draft_answer = draft_completion.choices[0].message.content
            
            # --- STAGE 2: Review & Edit ---
            if self.review_prompt:
                print(f"[ENGINE] Auditing draft answer...", flush=True)
                reviewer_input = (
                    f"DRAFT_ANSWER: {draft_answer}\n"
                    f"USER_QUESTION: {question}\n"
                    f"CARD_TEXT: {card_context}\n"
                    f"RULINGS: {rule_context}\n{context_str}"
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
