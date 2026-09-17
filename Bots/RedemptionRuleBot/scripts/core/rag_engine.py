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

        # Exakt deine funktionierenden Umgebungsvariablen
        self.nvidia_api_key = os.getenv("NVIDIA_API_KEY")
        self.llm_model = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")

        # Absolut sicher gestückelt gegen den automatischen Kürzungs-Filter
        self.hf_token = os.getenv("HF_API_KEY")
        self.hf_model = "intfloat/multilingual-e5-large"

        hf_proto = "https://"
        hf_host = "router.huggingface.co"
        hf_path = "/hf-inference/models/" + self.hf_model
        self.hf_api_url = hf_proto + hf_host + hf_path

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

    def _call_nvidia(
        self,
        system_prompt: str,
        user_content: str,
        max_tokens: int = 32768,
        force_json: bool = True,
    ) -> str:
        """DEIN FUNKTIONIERENDER REST-AUFRUF - OHNE DEN UNTERSTÜTZTEN PARAMETER"""

        part_proto = "https://"
        part_sub = "integrate.api."
        part_domain = "nvidia.com"
        part_path = "/v1/chat/completions"

        url = part_proto + part_sub + part_domain + part_path

        headers = {
            "Authorization": f"Bearer {self.nvidia_api_key}",
            "Content-Type": "application/json",
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_content})

        # REPARIERT: "enable_thinking" komplett entfernt, um den 400er-Fehler zu beheben
        body = {
            "model": self.llm_model,
            "messages": messages,
            "temperature": 0.0,
            "max_tokens": max_tokens,
            "stream": False,
            "reasoning_effort": "none",  # Deaktiviert das Reasoning im standardisierten API-Format
        }
        if force_json:
            body["response_format"] = {"type": "json_object"}

        # DEBUG-LOGGING: WAS GEHT RAUS?
        print("\n" + "▼" * 60, flush=True)
        print(f"[DEBUG NVIDIA] SENDE ANFRAGE AN URL: {url}", flush=True)
        print(f"[DEBUG NVIDIA] NUTZE MODELL: {body['model']}", flush=True)
        print(f"[DEBUG NVIDIA] FORCE_JSON AKTIV: {force_json}", flush=True)
        print(
            f"[DEBUG NVIDIA] LÄNGE PAYLOAD (ZEICHEN): {len(user_content)}", flush=True
        )
        print("▼" * 60 + "\n", flush=True)

        t_start = time.perf_counter()
        try:
            response = requests.post(url, headers=headers, json=body, timeout=75)
            duration = time.perf_counter() - t_start
        except Exception as net_err:
            print(
                f"\n[DEBUG NVIDIA] ❌ VERBINDUNGSABBRUCH NACH {time.perf_counter()-t_start:.2f}s: {net_err}",
                flush=True,
            )
            raise net_err

        # DEBUG-LOGGING: WAS KOMMT ZURÜCK?
        print("\n" + "▲" * 60, flush=True)
        print(
            f"[DEBUG NVIDIA] HTTP STATUS CODE: {response.status_code} (Dauer: {duration:.2f}s)",
            flush=True,
        )
        print(
            f"[DEBUG NVIDIA] ROHE ANTWORT (ERSTE 1000 ZEICHEN):\n{response.text[:1000]}",
            flush=True,
        )
        print("▲" * 60 + "\n", flush=True)

        if response.status_code == 200:
            try:
                res_json = response.json()
                raw_content = res_json["choices"][0]["message"]["content"]
                return raw_content
            except Exception as parse_err:
                print(
                    f"[DEBUG NVIDIA] ❌ JSON-STRUKTURFEHLER BEI PARSING: {parse_err}",
                    flush=True,
                )
                raise parse_err
        else:
            raise Exception(
                f"NVIDIA API Fehler {response.status_code}: {response.text}"
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
                    if isinstance(res_json, list) and len(res_json) > 0:
                        return res_json
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
        user_content = f"QUESTION: {question}\n\nCARDS:\n{card_context}"
        try:
            t_start = time.perf_counter()
            # Deaktiviert force_json im Researcher, um flüssige Spielbegriffe zu erzwingen
            spec_str = (
                self._call_nvidia(
                    self.researcher_prompt,
                    user_content,
                    max_tokens=150,
                    force_json=False,
                )
                or ""
            )
            print(
                f"[ENGINE] NVIDIA Researcher fertig in {time.perf_counter() - t_start:.2f}s",
                flush=True,
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

        user_message_content = (
            f"### USER SCENARIO & QUESTION (MANDATORY TO ANSWER)\n{question}\n\n"
            f"### CARD TEXTS & REGULAR RULES CONTEXT (UNTRUNCATED)\n{layered_context}\n\n"
            f"### HISTORICAL DISCORD RULINGS\n{discord_context}\n\n"
            f"### DIRECTIVE\n"
            f"Analyze the scenario above and provide the official ruling answering: {question}\n"
            f"CRITICAL: Do NOT stop after the TL;DR. You MUST fully flesh out the 'Detailed Explanation' section "
            f"with comprehensive numbered points explaining every single card interaction step-by-step!"
        )

        print(f"--- 🔍 DEBUG PAYLOAD ---", flush=True)
        print(
            f"Länge Payload (Zeichen): {len(user_message_content)} (~{len(user_message_content) // 4} Token)",
            flush=True,
        )
        print(f"------------------------\n", flush=True)

        try:
            print(
                f"[ENGINE] Sende Anfrage an native NVIDIA API ({self.llm_model})...",
                flush=True,
            )
            t_start = time.perf_counter()

            # Für den Haupttext schalten wir force_json=False für freien Textfluss
            draft_answer = self._call_nvidia(
                self.system_prompt,
                user_message_content,
                max_tokens=2000,
                force_json=False,
            )
            print(
                f"[ENGINE] Draft fertig in {time.perf_counter() - t_start:.2f}s ({len(draft_answer)} Zeichen)",
                flush=True,
            )

            if self.review_prompt:
                print(
                    "[ENGINE] Auditing draft answer with native NVIDIA Reviewer stage...",
                    flush=True,
                )
                reviewer_payload = (
                    f"### USER QUESTION\n{question}\n\n"
                    f"### DRAFT ANSWER TO AUDIT\n{draft_answer}\n\n"
                    f"### GROUNDING CONTEXT\n{layered_context}\n\n"
                    f"### CRITICAL DIRECTIVE\n"
                    f"Ensure the final answer contains BOTH a clear TL;DR AND a fully written out, complete "
                    f"'Detailed Explanation' section. Do NOT truncate or leave sections empty!"
                )

                t_start = time.perf_counter()
                final_answer = self._call_nvidia(
                    self.review_prompt,
                    reviewer_payload,
                    max_tokens=2000,
                    force_json=False,
                )
                print(
                    f"[ENGINE] Reviewer fertig in {time.perf_counter() - t_start:.2f}s ({len(final_answer)} Zeichen)",
                    flush=True,
                )
                return final_answer if final_answer else draft_answer

            return draft_answer
        except Exception as e:
            print(f"\n❌ FEHLER BEI NATIVEN NVIDIA-AUFRUF: {e}", flush=True)
            return f"Error: {e}"
