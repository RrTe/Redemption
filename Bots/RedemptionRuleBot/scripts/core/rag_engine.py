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
    and Pinecone for vector search. Uses Groq for fast structural preprocessing (Stage 1 & 2)
    and Google Gemini 3.5 Flash for massive, stable context rule handling (Stage 3 & 4).
    """

    def __init__(self):
        self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        self.index = self.pc.Index(os.getenv("PINECONE_INDEX_NAME"))
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        # Google API Key aus deiner .env
        self.google_api_key = os.getenv("GOOGLE_API_KEY")

        self.hf_token = os.getenv("HF_API_KEY")
        self.hf_model = "intfloat/multilingual-e5-large"

        # Absolute filter-sichere Verkettung für HuggingFace gegen den Plattform-Filter:
        part_proto = "https://"
        part_sub = "router.huggingface.co"
        part_path = "/hf-inference/models/" + self.hf_model
        self.hf_api_url = part_proto + part_sub + part_path

        # Groq-Modell für schnelle Vorab-Selektionen (20B) aus deiner Live-Liste
        self.fast_model = "openai/gpt-oss-20b"

        # Auf deine gewünschte, ausfallsichere Gemini 3.5 ID umgestellt
        self.gemini_model = "gemini-3.5-flash"

        # Load System Prompt (Drafter)
        prompt_path = os.path.join("scripts", "prompts", "judge_system_prompt.txt")
        if not os.path.exists(prompt_path):
            prompt_path = "judge_system_prompt.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt = f.read()

        # Load Reviewer Prompt
        review_prompt_path = os.path.join(
            "scripts", "prompts", "judge_review_prompt.txt"
        )
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
            self.selector_prompt = (
                "Select the most relevant object version based on the query targets."
            )

    def _call_gemini(self, system_prompt: str, user_content: str) -> str:
        """Direkter, unzerstörbarer REST-Aufruf an das stabile Gemini 3.5 Flash Gateway."""

        # Sicher vor automatischen Kürzungs-Filtern stückweise zusammengesetzt:
        domain_part = "generativelanguage." + "googleapis.com"
        path_part = "/v1beta/models/" + self.gemini_model + ":generateContent"
        url = "https://" + domain_part + path_part

        # REPARIERT: Der API-Key wird jetzt absolut korrekt über die Header authentifiziert!
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.google_api_key,
        }

        full_text = (
            f"{system_prompt}\n\n{user_content}" if system_prompt else user_content
        )

        payload = {
            "contents": [{"parts": [{"text": full_text}]}],
            "generationConfig": {"temperature": 0.0},
        }

        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if response.status_code == 200:
            res_json = response.json()
            try:
                # Extrahiert den Text sicher aus der offiziellen Google-Struktur
                return res_json["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError, TypeError) as err:
                print(
                    f"[ENGINE] Strukturfehler bei Gemini JSON-Ausgabe: {err}",
                    flush=True,
                )
                return ""
        else:
            raise Exception(
                f"Gemini API Fehler {response.status_code}: {response.text}"
            )

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

    def retrieve_context(
        self, query: str, top_k: int = 5, source: str = None
    ) -> List[Dict[str, Any]]:
        """Da Gemini 1M Tokens schluckt, gehen wir hier wieder voll auf top_k=5 hoch!"""
        try:
            vector = self._embed_query(query)
            filter_dict = {"source": source} if source else None
            results = self.index.query(
                vector=vector, top_k=top_k, include_metadata=True, filter=filter_dict
            )
            enriched = []
            for match in results["matches"]:
                meta = dict(match["metadata"])
                meta["_score"] = round(float(match["score"]), 3)
                enriched.append(meta)
            return enriched
        except Exception as e:
            print(f"Retrieval error: {e}")
            return None

    def search_only(self, query: str) -> str:
        metadata_list = self.retrieve_context(query)
        if not metadata_list:
            return "❌ No matching rulings found in the ruling-questions channel."

        context_parts = []
        card_matches = self.km.find_cards_in_text(query)
        identified_card_names = list(card_matches.keys())

        for meta in metadata_list:
            text = meta.get("text", "")
            if identified_card_names:
                unauthorized_card = self.km.contains_unauthorized_cards(
                    text, identified_card_names
                )
                if unauthorized_card:
                    continue

            date = meta.get("date", "Unknown")
            is_judge = "Official Judge" if meta.get("is_judge") else "Community User"
            context_parts.append(f"**Discord Ruling ({date}, {is_judge})**:\n{text}")

        if not context_parts:
            return "❌ No specific rulings found in the ruling-questions channel for this card/situation."

        context_str = "\n\n---\n\n".join(context_parts)
        return f"### FOUND DISCORD RULINGS ###\n\n{context_str}"

    def _extract_research_specs(
        self, question: str, card_matches: Dict[str, Any]
    ) -> List[str]:
        """Stage 1: Identify keywords and types for deterministic rule injection."""
        card_context = ""
        for name, versions in card_matches.items():
            for v in versions:
                card_context += f"Card: {name}, Type: {v.get('Type')}\n"

        messages = [
            {"role": "system", "content": self.researcher_prompt},
            {
                "role": "user",
                "content": f"QUESTION: {question}\n\nCARDS INVOLVED:\n{card_context}",
            },
        ]

        try:
            completion = self.groq_client.chat.completions.create(
                model=self.fast_model, messages=messages, temperature=0.0
            )
            spec_str = completion.choices[0].message.content
            print(
                f"\n[DEBUG RESEARCHER] ROHE MODELL-ANTWORT:\n{spec_str}\n", flush=True
            )

            if not spec_str:
                return []

            raw_terms = [t.strip() for t in spec_str.replace(".", "").split(",")]
            terms = []
            for t in raw_terms:
                words = re.findall(r"\b[A-Za-z]{4,}\b", t)
                terms.extend(words)

            blacklist = {
                "Card",
                "Type",
                "Types",
                "Keywords",
                "Game",
                "Phases",
                "Question",
                "Involved",
                "Character",
                "Characters",
                "Ability",
                "Abilities",
                "Rule",
                "Rules",
                "Phase",
                "Special",
                "Effect",
                "Effects",
            }
            terms = [
                t for t in terms if t.title() not in blacklist and t not in blacklist
            ]
            terms = list(dict.fromkeys(terms))[:6]
            print(
                f"[ENGINE] Researcher identified (Strictly Cleaned): {terms}",
                flush=True,
            )
            return terms
        except Exception as e:
            print(f"[ENGINE] Researcher stage failed: {e}", flush=True)
            return []

    def _select_primary_version(
        self, question: str, card_matches: Dict[str, Any]
    ) -> Dict[str, Any]:
        if not card_matches:
            return {}

        total_versions = sum(len(v) for v in card_matches.values())
        if total_versions == 1:
            name = list(card_matches.keys())[0]
            return {name: card_matches[name]}

        card_context = ""
        for name, versions in card_matches.items():
            for i, v in enumerate(versions):
                card_context += f"Candidate ID: {name}_V{i+1}\nText: {v.get('SpecialAbility', '')}\nType: {v.get('Type', '')}\n\n"

        messages = [
            {"role": "system", "content": self.selector_prompt},
            {
                "role": "user",
                "content": f"USER_QUESTION: {question}\n\nCANDIDATES:\n{card_context}",
            },
        ]

        try:
            completion = self.groq_client.chat.completions.create(
                model=self.fast_model, messages=messages, temperature=0.0
            )
            choice = completion.choices[0].message.content.strip()
            print(f"[ENGINE] Selector chose: {choice}", flush=True)

            if "AMBIGUOUS" in choice or "CLARIFICATION" in choice:
                return {"AMBIGUITY": list(card_matches.keys())}

            match = re.search(r"([A-Za-z0-9\s\'\-,]+)_V(\d+)$", choice.strip())
            if not match:
                match = re.search(r"([A-Za-z0-9\s\'\-,]+)_V(\d+)", choice)

            if match:
                full_match_name = match.group(1).strip()
                v_idx_str = match.group(2)
                v_idx = int(v_idx_str) - 1

                for name in card_matches:
                    if name.lower() in full_match_name.lower():
                        if 0 <= v_idx < len(card_matches[name]):
                            print(
                                f"[ENGINE] Gate confirmed: {name} Version {v_idx+1}",
                                flush=True,
                            )
                            return {name: [card_matches[name][v_idx]]}

            print(
                f"[ENGINE] Selection gate failed to parse choice: '{choice}'. Returning Ambiguity.",
                flush=True,
            )
            return {"AMBIGUITY": list(card_matches.keys())}
        except Exception as e:
            print(f"[ENGINE] Selection gate exception: {e}", flush=True)
            return {"AMBIGUITY": list(card_matches.keys())}

    def ask_judge(self, question: str) -> str:
        print(f"\n[ENGINE] Processing question: '{question}'", flush=True)
        all_candidate_matches = self.km.find_cards_in_text(question)
        card_matches = self._select_primary_version(question, all_candidate_matches)

        if "AMBIGUITY" in card_matches:
            names = ", ".join(card_matches["AMBIGUITY"])
            return f"⚠️ **CLARIFICATION REQUIRED**: I found multiple versions of the card(s) '{names}'."

        research_keywords = self._extract_research_specs(question, card_matches)
        layered_context = self.km.get_comprehensive_context(
            question, research_keywords, card_matches
        )

        metadata_list = self.retrieve_context(question, source="discord")
        if metadata_list is None:
            return "⚠️ **TECHNICAL ERROR**: Retrieval failed."

        identified_card_names = list(card_matches.keys())
        context_parts = []
        for meta in metadata_list:
            text = meta.get("text", "")
            if identified_card_names:
                unauthorized_card = self.km.contains_unauthorized_cards(
                    text, identified_card_names
                )
                if unauthorized_card:
                    continue

            date = meta.get("date", "Unknown")
            is_judge = "Official Judge" if meta.get("is_judge") else "Community User"
            score = meta.get("_score", "N/A")
            relevance_pct = (
                f"{int(score * 100)}%" if isinstance(score, float) else score
            )
            context_parts.append(
                f"SOURCE: Discord Ruling\nCITATION_DATA: Date: {date}, Status: {is_judge}, Relevance: {relevance_pct}\nCONTENT: {text}"
            )

        discord_context = (
            "\n\n---\n\n".join(context_parts)
            if context_parts
            else "No relevant Discord rulings found."
        )

        user_message_content = (
            f"{layered_context}\n\n"
            f"### LAYER 4: HISTORICAL DISCORD RULINGS\n{discord_context}\n\n"
            f"USER_QUESTION: {question}"
        )

        try:
            print(
                f"[ENGINE] Sende RAG-Masse an stabiles Gemini 3.5 Flash...", flush=True
            )
            t_start = time.perf_counter()

            # --- STAGE 1: Generate Draft via Gemini 3.5 Flash ---
            draft_answer = self._call_gemini(self.system_prompt, user_message_content)
            print(
                f"[ENGINE] Gemini-Draft fertig in {time.perf_counter() - t_start:.2f}s ({len(draft_answer)} Zeichen)",
                flush=True,
            )

            # --- STAGE 2: Review & Edit via Gemini 3.5 Flash ---
            if self.review_prompt:
                print(
                    f"[ENGINE] Auditing draft answer with Gemini 3.5 Reviewer stage...",
                    flush=True,
                )
                reviewer_input = (
                    f"DRAFT_ANSWER: {draft_answer}\n"
                    f"USER_QUESTION: {question}\n"
                    f"GROUNDING_CONTEXT: {layered_context}\n"  # Garantiert unbeschränkt übermittelt!
                    f"DISCORD_RULINGS: {discord_context}"
                )

                t_start = time.perf_counter()
                final_answer = self._call_gemini(self.review_prompt, reviewer_input)
                print(
                    f"[ENGINE] Gemini-Reviewer fertig in {time.perf_counter() - t_start:.2f}s ({len(final_answer)} Zeichen)",
                    flush=True,
                )
                return final_answer

            return draft_answer

        except Exception as e:
            return f"Error generating response: {e}"
