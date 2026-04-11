import json
import os
import re
from typing import List, Dict, Any, Optional

class KnowledgeManager:
    """
    Handles Ground Truth data extraction from local files:
    1. Card Data (carddata.json)
    2. Rule Documents (Rulebooks, REG, ORDIR)
    """

    def __init__(self, data_dir: str = "ragdata"):
        self.data_dir = data_dir
        self.cards_by_name: Dict[str, List[Dict[str, Any]]] = {}
        self.rule_files: Dict[str, str] = {}
        self.blacklist = {"Evil", "Good", "Neutral", "Search", "Take", "Draw", "Hand", "Deck", "Play"}
        
        # Load Card Data
        card_path = os.path.join(self.data_dir, "carddata.json")
        if os.path.exists(card_path):
            print(f"[KM] Loading card data from {card_path}...", flush=True)
            try:
                with open(card_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Group by base name to identify reprints
                    for card in data.get("cards", []):
                        full_name = card.get("Name", "").strip()
                        # Strip suffixes
                        base_name = re.sub(r"\s*(\[.*?\]|\(.*?\))\s*$", "", full_name).strip()
                        
                        if base_name not in self.cards_by_name:
                            self.cards_by_name[base_name] = []
                        
                        # MEMORY OPTIMIZATION: Only store essential fields
                        essential_data = {
                            "Name": full_name,
                            "OfficialSet": card.get("OfficialSet", card.get("Set", "Unknown")),
                            "Type": card.get("Type"),
                            "Alignment": card.get("Alignment"),
                            "Identifier": card.get("Identifier", "None"),
                            "SpecialAbility": card.get("SpecialAbility", "None")
                        }
                        self.cards_by_name[base_name].append(essential_data)
                    
                    # Free memory from the temporary raw JSON structure
                    del data
                    print(f"[KM] Memory optimized: Loaded {len(self.cards_by_name)} base names.", flush=True)
            except Exception as e:
                print(f"[KM] ERROR loading carddata.json: {e}", flush=True)
        
        # Load Rule Documents into memory
        rule_docs = ["REG_PDF_11.0.0.txt", "ORDIR_PDF_7.0.0.txt", "5th_Edition_Rulebook.txt"]
        for doc in rule_docs:
            path = os.path.join(self.data_dir, doc)
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        self.rule_files[doc] = f.read()
                except Exception as e:
                    print(f"[KM] ERROR loading rule doc {doc}: {e}", flush=True)

    def find_cards_in_text(self, text: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Scans text for exact card name matches from the card database.
        """
        found = {}
        query_text = text.lower()
        
        # Performance: Use pre-sorted names
        all_names = sorted(self.cards_by_name.keys(), key=len, reverse=True)
        
        for name in all_names:
            # Skip very common or short words to avoid noise and slow-down
            if len(name) < 4 or name in self.blacklist:
                continue
                
            # Check for name in lower-case query text (fast check)
            if name.lower() in query_text:
                # Then do the more precise regex word-boundary check
                pattern = rf"\b{re.escape(name)}\b"
                if re.search(pattern, text, re.IGNORECASE):
                    # Subset check
                    is_subset = False
                    for existing_name in found.keys():
                        if name in existing_name:
                            is_subset = True
                            break
                    
                    if not is_subset:
                        found[name] = self.cards_by_name[name]
        return found

    def find_rules_by_keyword(self, text: str) -> List[Dict[str, str]]:
        """
        Extracts relevant rule definitions.
        """
        keywords = ["Take", "Negate", "Banding", "Unity", "Protect", "Search", "Discard"]
        found_rules = []
        text_lower = text.lower()
        
        for kw in keywords:
            if kw.lower() in text_lower:
                for doc_name, content in self.rule_files.items():
                    match = re.search(rf"(?m)^.*{re.escape(kw)}.*$", content, re.IGNORECASE)
                    if match:
                        snippet = match.group(0).strip()
                        if len(snippet) > 10:
                            display_name = doc_name.replace("_PDF_", " ").replace(".txt", "").replace(".pdf", "")
                            found_rules.append({"doc": display_name, "keyword": kw, "snippet": snippet})
        return found_rules[:5]

    def contains_unauthorized_cards(self, text: str, authorized_names: List[str]) -> Optional[str]:
        """
        Checks if the text contains any card names NOT in authorized_names.
        """
        text_lower = text.lower()
        auth_lower = {name.lower() for name in authorized_names}
        
        for name in self.cards_by_name.keys():
            if name in self.blacklist or len(name) < 5:
                continue
            
            # Fast check first
            name_lower = name.lower()
            if name_lower in text_lower:
                if name_lower not in auth_lower:
                    return name
        return None

    def format_card_context(self, card_map: Dict[str, List[Dict[str, Any]]]) -> str:
        """
        Formats card data for inclusion in the LLM prompt.
        """
        if not card_map:
            return ""
            
        output = "--- OFFICIAL REDEMPTION CARD DATA ---\n"
        for name, versions in card_map.items():
            output += f"CARD NAME: {name}\n"
            output += f"Versions found: {len(versions)}\n"
            for i, v in enumerate(versions):
                set_name = v.get('OfficialSet', v.get('Set', 'Unknown'))
                output += (
                    f"  Version {i+1} (Source: {set_name} Set):\n"
                    f"    Type: {v.get('Type')}\n"
                    f"    Alignment: {v.get('Alignment')}\n"
                    f"    Identifier: {v.get('Identifier', 'None')}\n"
                    f"    Special Ability: {v.get('SpecialAbility', 'None')}\n"
                )
            output += "\n"
        return output
