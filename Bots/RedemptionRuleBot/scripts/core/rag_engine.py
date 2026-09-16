import os
import requests
import time
import re
from typing import List, Dict, Any
from pinecone import Pinecone
from dotenv import load_dotenv
from scripts.core.knowledge_manager import KnowledgeManager

load_dotenv()


class RAGEngine:
    def __init__(self):
        self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        self.index = self.pc.Index(os.getenv("PINECONE_INDEX_NAME"))

        self.google_api_key = os.getenv("GOOGLE_API_KEY")

        # EXAKT DEINE FUNKTIONIERENDE HUGGINGFACE-ROUTER-URL:
        self.hf_token = os.getenv("HF_API_KEY")
        self.hf_model = "intfloat/multilingual-e5-large"
        self.hf_api_url = (
            f"https://router.huggingface.co/hf-inference/models/{self.hf_model}"
        )

        # Die stärksten kostenlosen Modelle laut aktueller Google-Spezifikation:
        self.researcher_model = "gemini-3.6-flash"
        self.llm_model = "gemini-3.8-flash"
        self.reviewer_model = "gemini-3.8-flash"

        with open(
            os.path.join("scripts", "prompts", "judge_system_prompt.txt"),
            "r",
            encoding="utf-8",
        ) as f:
            self.system_prompt = f.read()
        if os.path.exists(
            os.path.join("scripts", "prompts", "judge_review_prompt.txt")
        ):
            with open(
                os.path.join("scripts", "prompts", "judge_review_prompt.txt"),
                "r",
                encoding="utf-8",
            ) as f:
                self.review_prompt = f.read()
        else:
            self.review_prompt = None

        self.km = KnowledgeManager()

        with open(
            os.path.join("scripts", "prompts", "researcher_prompt.txt"),
            "r",
            encoding="utf-8",
        ) as f:
            self.researcher_prompt = f.read()
        with open(
            os.path.join("scripts", "prompts", "selector_prompt.txt"),
            "r",
            encoding="utf-8",
        ) as f:
            self.selector_prompt = f.read()

    def _call_gemini(
        self,
        system_instruction: str,
        user_content: str,
        max_tokens: int = None,
        model_override: str = None,
    ) -> str:
        import time
        from datetime import datetime

        primary_model = model_override or self.llm_model

        # Startet mit deinem Wunschmodell, nutzt bei Ausfall 3.7 und 3.6 als Auffangnetz:
        models_to_try = [primary_model]
        if "gemini-3.7-flash" not in models_to_try:
            models_to_try.append("gemini-3.7-flash")
        if "gemini-3.6-flash" not in models_to_try:
            models_to_try.append("gemini-3.6-flash")

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.google_api_key,
        }

        # Baut die GenerationConfig dynamisch auf, falls max_tokens übergeben wurde:
        gen_config = {"temperature": 0.0}
        if max_tokens is not None:
            gen_config["maxOutputTokens"] = max_tokens

        payload: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": user_content}]}],
            "generationConfig": gen_config,
        }

        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        last_error = None
        for target_model in models_to_try:
            domain_part = "generativelanguage." + "googleapis.com"
            path_part = "/v1beta/models/" + target_model + ":generateContent"
            url = "https://" + domain_part + path_part

            now_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            print("\n" + "=" * 50, flush=True)
            print(f"[{now_str}] [DEBUG GEMINI] Starte Anfrage...", flush=True)
            print(f"[DEBUG GEMINI] MODELL: {target_model}", flush=True)
            print("=" * 50 + "\n", flush=True)

            t_start = time.perf_counter()

            try:
                response = requests.post(
                    url, headers=headers, json=payload, timeout=25.0
                )
                duration = time.perf_counter() - t_start

                print(
                    f"[DEBUG GEMINI] HTTP STATUS CODE: {response.status_code} (Dauer: {duration:.2f}s)",
                    flush=True,
                )

                if response.status_code == 200:
                    res_json = response.json()
                    candidates = res_json.get("candidates", [])
                    if (
                        candidates
                        and isinstance(candidates, list)
                        and len(candidates) > 0
                    ):
                        first_candidate = candidates[0]
                        content_obj = first_candidate.get("content", {})
                        parts = content_obj.get("parts", [])
                        if parts and isinstance(parts, list) and len(parts) > 0:
                            text_output = parts[0].get("text", "")
                            print(
                                f"[DEBUG GEMINI] ERFOLG - ANTWORT ERHALTEN ({len(text_output)} Zeichen in {duration:.2f}s)",
                                flush=True,
                            )
                            return text_output
                    print(
                        f"[DEBUG GEMINI] WARNUNG: Keine Text-Parts in der Antwort gefunden.",
                        flush=True,
                    )
                    return ""

                elif response.status_code in (503, 429):
                    print(
                        f"[DEBUG GEMINI] Modell {target_model} überlastet ({response.status_code}) nach {duration:.2f}s. Springe zu Fallback...",
                        flush=True,
                    )
                    last_error = f"Status {response.status_code}: {response.text}"
                    continue
                else:
                    raise Exception(
                        f"Gemini API Fehler {response.status_code}: {response.text}"
                    )

            except requests.exceptions.Timeout:
                duration = time.perf_counter() - t_start
                print(
                    f"[DEBUG GEMINI] Timeout nach {duration:.2f}s bei {target_model}! Breche ab und springe zu Fallback...",
                    flush=True,
                )
                last_error = f"Timeout bei {target_model}"
                continue
            except requests.exceptions.RequestException as req_err:
                duration = time.perf_counter() - t_start
                print(
                    f"[DEBUG GEMINI] Netzwerkfehler bei {target_model} nach {duration:.2f}s: {req_err}",
                    flush=True,
                )
                last_error = str(req_err)
                continue

        raise Exception(
            f"Alle Gemini-Modelle fehlgeschlagen. Letzter Fehler: {last_error}"
        )

    def _embed_query(self, text: str) -> List[float]:
        payload = {"inputs": [f"query: {text}"]}
        headers = {
            "Authorization": f"Bearer {self.hf_token}",
            "User-Agent": "DiscordBot/1.0",
        }

        print(f"\n--- 🔍 DEBUG EMBEDDING ---", flush=True)
        print(f"Ziel-URL: '{self.hf_api_url}'", flush=True)

        for attempt in range(3):
            try:
                response = requests.post(self.hf_api_url, headers=headers, json=payload)
                print(
                    f"Versuch {attempt+1} - Status Code: {response.status_code}",
                    flush=True,
                )
                if response.status_code == 200:
                    res_json = response.json()
                    if (
                        isinstance(res_json, list)
                        and len(res_json) > 0
                        and isinstance(res_json[0], list)
                    ):
                        return res_json[0]
                    return res_json if isinstance(res_json, list) else res_json
                else:
                    print(f"Rohe HF-Fehlermeldung: {response.text}", flush=True)
            except Exception as e:
                print(f"Verbindungsfehler bei HF-Aufruf: {e}", flush=True)
            time.sleep(2)
        raise Exception("HuggingFace failed.")

    def retrieve_context(
        self, query: str, top_k: int = 5, source: str = None
    ) -> List[Dict[str, Any]]:
        try:
            vector = self._embed_query(query)
            filter_dict = {"source": source} if source else None
            results = self.index.query(
                vector=vector, top_k=top_k, include_metadata=True, filter=filter_dict
            )
            return [
                dict(match["metadata"], _score=round(float(match["score"]), 3))
                for match in results["matches"]
            ]
        except Exception as e:
            print(f"❌ Retrieval Fehler abgefangen: {e}", flush=True)
            return None

    def search_only(self, query: str) -> str:
        metadata_list = self.retrieve_context(query)
        if not metadata_list:
            return "❌ No matching rulings found."
        context_parts = []
        card_matches = self.km.find_cards_in_text(query)
        for meta in metadata_list:
            text = meta.get("text", "")
            if list(card_matches.keys()) and self.km.contains_unauthorized_cards(
                text, list(card_matches.keys())
            ):
                continue
            context_parts.append(
                f"**Discord Ruling ({meta.get('date', 'Unknown')})**:\n{text}"
            )
        return f"### FOUND DISCORD RULINGS ###\n\n" + "\n\n---\n\n".join(context_parts)

    def _extract_research_specs(
        self, question: str, card_matches: Dict[str, Any]
    ) -> List[str]:
        card_context_lines = []
        for name, versions in card_matches.items():
            version_list = versions if isinstance(versions, list) else [versions]
            for v in version_list:
                c_type = v.get("Type", "Unknown") if isinstance(v, dict) else "Unknown"
                card_context_lines.append(f"Card: {name}, Type: {c_type}\n")

        card_context = "".join(card_context_lines)
        user_prompt = f"QUESTION: {question}\n\nCARDS:\n{card_context}"
        try:
            spec_str = (
                self._call_gemini(
                    self.researcher_prompt,
                    user_prompt,
                    max_tokens=200,
                    model_override=self.researcher_model,
                )
                or ""
            )

            terms = [
                w
                for t in spec_str.replace(".", "").split(",")
                for w in re.findall(r"\b[A-Za-z]{4,}\b", t)
            ]
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
            cleaned = list(
                dict.fromkeys(
                    [
                        t
                        for t in terms
                        if t.title() not in blacklist and t not in blacklist
                    ]
                )
            )[:6]
            print(f"[ENGINE] Researcher identified: {cleaned}", flush=True)
            return cleaned
        except Exception as e:
            print(f"WARN: Researcher extraction failed: {e}", flush=True)
            return []

    def _select_primary_version(
        self, question: str, card_matches: Dict[str, Any]
    ) -> Dict[str, Any]:
        print("\n=== 🔍 GEFUNDENE KARTEN & VERSIONEN AUS DER DB ===", flush=True)
        if not card_matches:
            print("❌ Keine Karten in der Datenbank erkannt.", flush=True)
            return {}

        confirmed_matches = {}
        for name, versions in card_matches.items():
            print(
                f"📌 Karte: '{name}' | Versionen im System: {len(versions)}", flush=True
            )
            for idx, ver in enumerate(versions):
                c_type = ver.get("Type", "Unbekannt")
                c_ability = ver.get("SpecialAbility", "")
                preview = (
                    (c_ability[:90] + "...")
                    if len(c_ability) > 90
                    else (c_ability or "Keine Fähigkeit")
                )
                print(f"   └─ [V{idx+1}] Typ: {c_type} | Text: {preview}", flush=True)
            confirmed_matches[name] = versions

        print("=== ✅ ALLE GEFUNDENEN KARTEN AN DAS MODELL ÜBERGEBEN ===\n", flush=True)
        return confirmed_matches

    def ask_judge(self, question: str) -> str:
        print(f"\n[ENGINE] Processing question: '{question}'", flush=True)
        all_candidate_matches = self.km.find_cards_in_text(question)
        card_matches = self._select_primary_version(question, all_candidate_matches)

        research_keywords = self._extract_research_specs(question, card_matches)
        layered_context = self.km.get_comprehensive_context(
            question, research_keywords, card_matches
        )

        metadata_list = self.retrieve_context(question, top_k=2, source="discord") or []
        context_parts = []
        for meta in metadata_list:
            text = meta.get("text", "")
            if list(card_matches.keys()) and self.km.contains_unauthorized_cards(
                text, list(card_matches.keys())
            ):
                continue
            context_parts.append(f"SOURCE: Discord Ruling\nCONTENT: {text}")
        discord_context = (
            "\n\n---\n\n".join(context_parts)
            if context_parts
            else "No specific Discord rulings."
        )

        # Ungekürzter Kontext dank des 1-Million-Token-Fensters von Gemini
        user_message_content = (
            f"### USER SCENARIO & QUESTION (MANDATORY TO ANSWER)\n{question}\n\n"
            f"### CARD TEXTS & REGULAR RULES CONTEXT (UNTRUNCATED)\n{layered_context}\n\n"
            f"### HISTORICAL DISCORD RULINGS\n{discord_context}\n\n"
            f"### DIRECTIVE\nAnalyze the scenario above and provide the official ruling answering: {question}"
        )

        print(f"--- 🔍 DEBUG PAYLOAD ---", flush=True)
        print(
            f"Länge Payload (Zeichen): {len(user_message_content)} (~{len(user_message_content) // 4} Token)",
            flush=True,
        )
        print(f"------------------------\n", flush=True)

        try:
            print("[ENGINE] Sende Anfrage an Gemini 2.0 Flash...", flush=True)
            draft_answer = self._call_gemini(
                self.system_prompt, user_message_content, max_tokens=2500
            )
            print(
                f"[ENGINE] Draft Antwort generiert ({len(draft_answer)} Zeichen)",
                flush=True,
            )

            if self.review_prompt:
                print(
                    f"[ENGINE] Auditing draft answer with Reviewer stage...", flush=True
                )
                reviewer_payload = (
                    f"### USER QUESTION\n{question}\n\n"
                    f"### DRAFT ANSWER TO AUDIT\n{draft_answer}\n\n"
                    f"### GROUNDING CONTEXT\n{layered_context}"
                )
                final_answer = self._call_gemini(
                    self.review_prompt, reviewer_payload, max_tokens=2500
                )
                print(
                    f"[ENGINE] Reviewer Antwort generiert ({len(final_answer)} Zeichen)",
                    flush=True,
                )
                return final_answer if final_answer else draft_answer

            return draft_answer
        except Exception as e:
            print(f"\n❌ FEHLER BEI GEMINI: {e}", flush=True)
            return f"Error: {e}"
