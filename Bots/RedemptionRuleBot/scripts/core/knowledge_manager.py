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
        
        # Load Card Data
        card_path = os.path.join(self.data_dir, "carddata.json")
        if os.path.exists(card_path):
            with open(card_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Group by base name to identify reprints
                # Example: "Promised Land [II]" -> base name "Promised Land"
                for card in data.get("cards", []):
                    full_name = card.get("Name", "").strip()
                    # Strip suffixes like (Di), [II], [L], etc.
                    base_name = re.sub(r"\s*(\[.*?\]|\(.*?\))\s*$", "", full_name).strip()
                    
                    if base_name not in self.cards_by_name:
                        self.cards_by_name[base_name] = []
                    self.cards_by_name[base_name].append(card)
        
        # Load Rule Documents into memory
        rule_docs = [
            "REG_PDF_11.0.0.txt", 
            "ORDIR_PDF_7.0.0.txt", 
            "5th_Edition_Rulebook.txt"
        ]
        for doc in rule_docs:
            path = os.path.join(self.data_dir, doc)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    self.rule_files[doc] = f.read()

    def find_cards_in_text(self, text: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Scans text for exact card name matches from the card database.
        Returns a mapping of name -> list of card objects (reprints).
        """
        found = {}
        # Iterate over card names to find exact matches in the query
        # We sort by length descending to match longer names first (e.g. "Promised Land [II]" vs "Promised Land")
        all_names = sorted(self.cards_by_name.keys(), key=len, reverse=True)
        
        for name in all_names:
            # Simple exact word boundary check
            # Use re.escape to handle special characters in card names
            pattern = rf"\b{re.escape(name)}\b"
            if re.search(pattern, text, re.IGNORECASE):
                # Ensure we don't match a subset of an already matched longer name
                # (e.g. if "Promised Land [II]" was found, "Promised Land" shouldn't be added separately if it's the same string)
                is_subset = False
                for existing_name in found.keys():
                    if name in existing_name:
                        is_subset = True
                        break
                
                if not is_subset:
                    found[name] = self.cards_by_name[name]
                    
        return found

    def find_rules_by_keyword(self, text: str) -> List[str]:
        """
        Extracts relevant rule definitions from files based on keywords.
        Focuses on high-impact terms like "Take", "Negate", "Banding".
        """
        keywords = ["Take", "Negate", "Banding", "Unity", "Protect", "Search", "Discard"]
        found_rules = []
        
        for kw in keywords:
            if kw.lower() in text.lower():
                # Extract snippets from REG or ORDIR that contain the keyword + "Definition" or "Ruling"
                # This is a simplified regex lookup for local context
                for doc_name, content in self.rule_files.items():
                    # Look for things like "Take: [definition]"
                    # We look for the start of a paragraph or bullet containing the keyword
                    match = re.search(rf"(?m)^.*{re.escape(kw)}.*$", content, re.IGNORECASE)
                    if match:
                        snippet = match.group(0).strip()
                        if len(snippet) > 10:
                            found_rules.append(f"[{doc_name}] {kw}: {snippet}")
        
        return found_rules[:5] # Limit to 5 snippets for context economy

    def format_card_context(self, card_map: Dict[str, List[Dict[str, Any]]]) -> str:
        """
        Formats card data for inclusion in the LLM prompt.
        """
        if not card_map:
            return ""
            
        output = "--- GROUND TRUTH CARD DATA ---\n"
        for name, versions in card_map.items():
            output += f"CARD NAME: {name}\n"
            output += f"Versions found: {len(versions)}\n"
            for i, v in enumerate(versions):
                output += (
                    f"  Version {i+1} ({v.get('OfficialSet', v.get('Set', 'Unknown'))}):\n"
                    f"    Type: {v.get('Type')}\n"
                    f"    Alignment: {v.get('Alignment')}\n"
                    f"    Identifier: {v.get('Identifier', 'None')}\n"
                    f"    Special Ability: {v.get('SpecialAbility', 'None')}\n"
                )
            output += "\n"
        return output
