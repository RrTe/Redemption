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
    """
    
    def __init__(self):
        # Pinecone & Groq Setup
        self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        self.index = self.pc.Index(os.getenv("PINECONE_INDEX_NAME"))
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        # HuggingFace Setup
        self.hf_token = os.getenv("HF_API_KEY") # Check .env for HF_API_KEY
        self.hf_model = "intfloat/multilingual-e5-large"
        # UPDATED: Use the new HuggingFace Router URL as per 410 error message
        self.hf_api_url = f"https://router.huggingface.co/hf-inference/models/{self.hf_model}"
        
        self.llm_model = "llama-3.3-70b-versatile"
        
        # Load System Prompt
        prompt_path = os.path.join("scripts", "core", "prompts", "judge_system_prompt.txt")
        if not os.path.exists(prompt_path):
            prompt_path = "JudgeSystemPrompt.txt"
            
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt = f.read()

        # Initialize Knowledge Manager for Ground Truth lookups
        self.km = KnowledgeManager()

    def _embed_query(self, text: str) -> List[float]:
        """
        Embeds a query string using HuggingFace Serverless Inference API.
        Bypasses Pinecone's monthly token limit.
        """
        # E5 models require 'query: ' prefix for queries
        payload = {"inputs": [f"query: {text}"]}
        headers = {"Authorization": f"Bearer {self.hf_token}"}
        
        max_retries = 3
        for attempt in range(max_retries):
            response = requests.post(self.hf_api_url, headers=headers, json=payload)
            
            if response.status_code == 200:
                # HF returns a list of embeddings (usually nested)
                return response.json()[0]
            elif response.status_code == 503:
                # Model is loading, wait and retry
                print("  ⏳ HuggingFace model is loading... waiting 10s...")
                time.sleep(10)
                continue
            else:
                raise Exception(f"HuggingFace API error: {response.status_code} - {response.text}")
        
        raise Exception("HuggingFace Inference API failed after retries.")

    def retrieve_context(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Retrieves relevant context from Pinecone based on the query.

        Each returned dict is the Pinecone metadata enriched with a
        '_score' key (cosine similarity, 0–1) so downstream logic can
        surface relevance information to the user or the LLM.

        Args:
            query: The natural-language question to embed and search for.
            top_k: Number of nearest-neighbour results to return.

        Returns:
            A list of metadata dicts (sorted by descending similarity),
            each containing an extra '_score' field, or None on error.
        """
        try:
            # 1. Embed query via HuggingFace
            vector = self._embed_query(query)

            # 2. Query Pinecone — results are already ranked by score desc
            results = self.index.query(
                namespace="__default__",
                vector=vector,
                top_k=top_k,
                include_metadata=True
            )

            # 3. Inject the similarity score into each metadata dict so callers
            #    can forward it to the LLM or display it in source citations.
            enriched = []
            for match in results['matches']:
                meta = dict(match['metadata'])  # shallow copy to avoid mutation
                meta['_score'] = round(float(match['score']), 3)
                enriched.append(meta)
            return enriched
        except Exception as e:
            print(f"Retrieval error: {e}")
            return None  # Return None to indicate a technical failure

    def upsert_ruling(self, question: str, answer: str, author: str, date: str, is_judge: bool, source_id: str) -> bool:
        """
        Upserts a single ruling into Pinecone, vectorized via HuggingFace.
        """
        try:
            # 1. Format the text block (matching the ingestion format)
            text_block = (
                f"SOURCE: Discord Ruling\n"
                f"DATE: {date}\n"
                f"AUTHOR: {author}\n"
                f"OFFICIAL JUDGE: {is_judge}\n\n"
                f"QUESTION: {question}\n\n"
                f"ANSWER: {answer}"
            )
            
            # 2. Get embedding vector via HF
            # We embed the text_block so the vector represents question AND answer context
            vector = self._embed_query(text_block)

            # 3. Prepare metadata
            metadata = {
                "source": "Discord Ruling",
                "date": date.split(' ')[0] if ' ' in date else date,
                "time": date.split(' ')[1] if ' ' in date else "Unknown",
                "author": author,
                "is_judge": is_judge,
                "source_id": str(source_id),
                "text": text_block
            }

            # 4. Upsert to Pinecone
            record = {
                "id": f"rec_discord_{source_id}",
                "values": vector,
                "metadata": metadata
            }

            self.index.upsert(
                vectors=[record],
                namespace="__default__"
            )
            print(f"Successfully upserted ruling {source_id} to Pinecone.")
            return True
        except Exception as e:
            print(f"Error upserting ruling {source_id}: {e}")
            return False

    def ask_judge(self, question: str) -> str:
        """
        Retrieves context and generates a response from the AI Judge.
        """
        # Get semantic context from Pinecone
        metadata_list = self.retrieve_context(question)
        
        # GROUND TRUTH: Find exact cards and rules mentioned in question
        card_matches = self.km.find_cards_in_text(question)
        rule_snippets = self.km.find_rules_by_keyword(question)
        
        # Security check: If retrieval failed (429, etc.), do not let LLM hallucinate
        if metadata_list is None:
            return ("⚠️ **TECHNICAL ERROR**: I currently cannot access the knowledge base due to API limits or connection issues. "
                    "Please try again later or contact the administrator.")

        # Build Card & Rule context strings
        card_context = self.km.format_card_context(card_matches)
        rule_context = ""
        if rule_snippets:
            rule_context = "--- GROUND TRUTH RULE DEFINITIONS ---\n" + "\n".join(rule_snippets) + "\n\n"


        # Build context string
        context_parts = []
        for meta in metadata_list:
            text = meta.get('text', '')
            source = meta.get('source', 'Unknown')
            date = meta.get('date', 'Unknown')
            time = meta.get('time', 'Unknown')
            is_judge = "Official Judge" if meta.get('is_judge') else "Community User"
            # Score: cosine similarity injected by retrieve_context (0 = unrelated, 1 = identical)
            score = meta.get('_score', 'N/A')
            relevance_pct = f"{int(score * 100)}%" if isinstance(score, float) else score

            context_parts.append(
                f"SOURCE: {source}\n"
                f"CITATION_DATA: Date: {date}, Time: {time}, Status: {is_judge}, Relevance: {relevance_pct}\n"
                f"CONTENT: {text}"
            )
            
        context_str = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant context found in database."
        
        # Prepare LLM messages
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user", 
                "content": (
                    f"{card_context}\n"
                    f"{rule_context}\n"
                    f"--- DISCORD RULINGS (REFERENCE) ---\n"
                    f"{context_str}\n\n"
                    f"USER QUESTION: {question}"
                )
            }
        ]
        
        # Call Groq (or OpenRouter in future)
        try:
            completion = self.groq_client.chat.completions.create(
                model=self.llm_model,
                messages=messages,
                temperature=0.0
            )
            return completion.choices[0].message.content
        except Exception as e:
            return f"Error generating response: {e}"
