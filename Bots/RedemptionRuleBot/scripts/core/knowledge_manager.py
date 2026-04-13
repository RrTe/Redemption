import json
import os
import re
from typing import List, Dict, Any, Optional

class KnowledgeManager:
    """
    Handles Ground Truth data extraction from local files:
    1. Card Data (carddata.json)
    2. Rule Documents (Live Index from main.py)
    """

    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.cards_by_name: Dict[str, List[Dict[str, Any]]] = {}
        self.rule_sections: Dict[str, Dict[str, Any]] = {}  # Populated via main.py startup
        self.blacklist = {"Evil", "Good", "Neutral", "Search", "Take", "Draw", "Hand", "Deck", "Play"}
        
        # Load Card Data
        card_path = os.path.join(self.data_dir, "carddata.json")
        if os.path.exists(card_path):
            try:
                with open(card_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for card in data.get("cards", []):
                        full_name = card.get("Name", "").strip()
                        base_name = re.sub(r"\s*(\[.*?\]|\(.*?\))\s*$", "", full_name).strip()
                        if base_name not in self.cards_by_name:
                            self.cards_by_name[base_name] = []
                        
                        essential_data = {
                            "Name": full_name,
                            "OfficialSet": card.get("OfficialSet", card.get("Set", "Unknown")),
                            "Type": card.get("Type"),
                            "Alignment": card.get("Alignment"),
                            "Identifier": card.get("Identifier", "None"),
                            "SpecialAbility": card.get("SpecialAbility", "None")
                        }
                        self.cards_by_name[base_name].append(essential_data)
            except Exception as e:
                print(f"[KM] ERROR loading carddata.json: {e}", flush=True)

    def find_rules_by_keyword(self, text: str, extra_keywords: List[str] = None) -> List[Dict[str, str]]:
        """
        Extracts relevant rule sections based on keywords found in the text or extra_keywords.
        Prioritizes sections that explain mechanics (How to Play / Effects).
        """
        keywords = {"Take", "Negate", "Banding", "Unity", "Protect", "Search", "Discard", "Reserve", "Activate"}
        if extra_keywords:
            keywords.update(extra_keywords)
            
        found_rules = []
        text_lower = text.lower()
        
        for doc_name, sections in self.rule_sections.items():
            for title, section_data in sections.items():
                title_lower = title.lower()
                content_lower = section_data["content"].lower()
                
                # Check for Match
                is_match = False
                if title_lower in text_lower:
                    is_match = True
                else:
                    for kw in keywords:
                        if kw.lower() in title_lower:
                            is_match = True
                            break
                
                if is_match:
                    # Scoring logic: Prioritize "How to Play" and "Effect"
                    score = 10
                    if "how to play" in content_lower or "effect" in content_lower:
                        score += 5
                    if title_lower in [k.lower() for k in keywords]:
                        score += 3 # Exact keyword match in title
                        
                    found_rules.append({
                        "doc": doc_name, 
                        "title": title, 
                        "content": section_data["content"], 
                        "score": score
                    })

        # Sort by score and deduplicate
        found_rules.sort(key=lambda x: x["score"], reverse=True)
        
        seen = set()
        unique_rules = []
        for r in found_rules:
            if r['title'] not in seen:
                unique_rules.append(r)
                seen.add(r['title'])
                
        return unique_rules[:5]

    def find_cards_in_text(self, text: str) -> Dict[str, List[Dict[str, Any]]]:
        found = {}
        query_text = text.lower()
        words = [w.strip("?,.!") for w in query_text.split() if len(w) > 2]
        all_names = sorted(self.cards_by_name.keys(), key=len, reverse=True)
        
        for name in all_names:
            if len(name) < 4 or name in self.blacklist:
                continue
            if name.lower() in query_text:
                if not any(name in existing for existing in found):
                    found[name] = self.cards_by_name[name]
        
        if not found:
            for word in words:
                if word in self.blacklist or len(word) < 4: continue
                for name in all_names:
                    if name.lower().startswith(word):
                        found[name] = self.cards_by_name[name]
                        break
                if found: break
        return found

    def format_card_context(self, card_map: Dict[str, List[Dict[str, Any]]]) -> str:
        if not card_map: return ""
        output = "--- OFFICIAL REDEMPTION CARD DATA ---\n"
        for name, versions in card_map.items():
            output += f"CARD NAME: {name}\n"
            for i, v in enumerate(versions):
                set_name = v.get('OfficialSet', 'Unknown')
                output += (
                    f"  Version {i+1} ({set_name}):\n"
                    f"    Type: {v.get('Type')}, Alignment: {v.get('Alignment')}\n"
                    f"    Special Ability: {v.get('SpecialAbility', 'None')}\n"
                )
        return output

    def contains_unauthorized_cards(self, text: str, authorized_names: List[str]) -> Optional[str]:
        if not authorized_names:
            return None  # No targeted cards, so no filtering
            
        text_lower = text.lower()
        auth_lower = {name.lower() for name in authorized_names}
        
        # If the text contains at least one of the authorized cards, we trust it.
        # This allows for rulings that mention related cards (e.g., Shadrach and Daniel).
        for auth_name in auth_lower:
            if auth_name in text_lower:
                return None
        
        # If NO authorized cards are found, but OTHER cards are, it's likely irrelevant.
        for name in self.cards_by_name.keys():
            if name in self.blacklist or len(name) < 5: continue
            if name.lower() in text_lower:
                return name # Found an unauthorized card and no authorized card
                
        return None
