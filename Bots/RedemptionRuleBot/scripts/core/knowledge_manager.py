import json
import os
import re
from typing import List, Dict, Any, Optional, Set
import glob
import logging

try:
    import fitz
except ImportError:
    fitz = None

logger = logging.getLogger(__name__)

class KnowledgeManager:
    """
    Handles Ground Truth data extraction from local files:
    1. Card Data (carddata.json)
    2. Rule Documents (Parsed via PdfRuleParser)
    """

    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.cards_by_name: Dict[str, List[Dict[str, Any]]] = {}
        self.rule_sections: Dict[str, Dict[str, Any]] = {}
        
        # Load Config (Agnostic Design)
        self.config = {"alias_blacklist": [], "mandatory_sections": []}
        config_path = os.path.join(self.data_dir, "engine_config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    self.config = json.load(f)
            except Exception as e:
                logger.error(f"[KM] Error loading engine_config.json: {e}")
        
        self.blacklist = set(self.config.get("alias_blacklist", []))
        
        # Load Card Data
        card_path = os.path.join(self.data_dir, "carddata.json")
        self.alias_map: Dict[str, str] = {} # lower_alias -> base_name
        
        if os.path.exists(card_path):
            try:
                with open(card_path, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    # Correct structure: carddata.json has a "cards" key
                    cards_list = raw_data.get("cards", [])
                    for card in cards_list:
                        full_name = card.get("Name", "").strip()
                        if not full_name: continue
                        
                        # Normalize base name (remove (RoA), [Promo] etc)
                        base_name = re.sub(r"\s*(\[.*?\]|\(.*?\))\s*$", "", full_name).strip()
                        
                        if base_name not in self.cards_by_name:
                            self.cards_by_name[base_name] = []
                            # Register Aliases for this base name
                            self._register_aliases(base_name)
                        
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
                logger.error(f"[KM] ERROR loading carddata.json: {e}")

        # Initialize and load PDF Rule Parser
        self.pdf_parser = PdfRuleParser(self.data_dir)
        self.pdf_parser.load_all_rules()
        self.rule_sections = self.pdf_parser.all_sections

    def get_technical_keywords(self, text: str) -> Set[str]:
        """
        Step 1 & 4: Deterministic identification of rule-book concepts using headers as the ground truth index.
        Scans text for stems of all existing rule headers.
        """
        text_lower = text.lower()
        found = set()
        
        # Build dictionary of terms from headers
        for doc_name, sections in self.rule_sections.items():
            for title in sections.keys():
                title_l = title.lower()
                # Clean title
                base_title = re.sub(r'[\(\):].*$', '', title_l).strip()
                
                # Check for direct multi-word match (e.g. "Battle Phase")
                if base_title in text_lower and len(base_title) > 3:
                    found.add(base_title.title())
                
                # Check individual significant words
                words = [w for w in re.split(r'\W+', base_title) if len(w) > 4]
                for w in words:
                    if w in self.blacklist: continue
                    if re.search(r'\b' + re.escape(w) + r'\b', text_lower):
                        found.add(w.title())
        
        return found

    def _register_aliases(self, base_name: str):
        """Generates acronyms and unique prefixes for a card name."""
        name_l = base_name.lower()
        self.alias_map[name_l] = base_name
        
        # 1. Acronym (e.g. Angel of the Lord -> AotL)
        words = base_name.split()
        if len(words) >= 2:
            acronym = "".join([w[0] for w in words]).lower()
            if len(acronym) >= 3 and acronym not in self.alias_map:
                self.alias_map[acronym] = base_name
        
        # 2. Prefixes (e.g. Abomination -> Abom)
        if len(base_name) >= 7:
            prefix = base_name[:4].lower()
            if prefix not in self.alias_map and prefix not in self.blacklist:
                self.alias_map[prefix] = base_name

    def find_cards_in_text(self, text: str) -> Dict[str, List[Dict[str, Any]]]:
        found = {}
        # Simple tokenization by word boundaries
        words = re.findall(r'\b\w+\b', text.lower())
        
        # First pass: Check for direct alias matches (fast)
        for word in words:
            if word in self.alias_map:
                base_name = self.alias_map[word]
                if base_name not in found:
                    found[base_name] = self.cards_by_name[base_name]
        
        # Second pass: Check for full name substrings (for multi-word names in query)
        query_text = text.lower()
        all_names = sorted(self.cards_by_name.keys(), key=len, reverse=True)
        for name in all_names:
            if len(name) < 4 or name in self.blacklist:
                continue
            
            pattern = r'\b' + re.escape(name.lower()) + r'\b'
            if re.search(pattern, query_text):
                if name not in found:
                    found[name] = self.cards_by_name[name]
                    
        return found

    def format_card_context(self, card_map: Dict[str, List[Dict[str, Any]]], selected_cards: Dict[str, List[Dict[str, Any]]] = None) -> str:
        if not card_map: return ""
        output = "--- OFFICIAL REDEMPTION CARD DATA ---\n"
        for name, versions in card_map.items():
            output += f"CARD NAME: {name}\n"
            for i, v in enumerate(versions):
                set_name = v.get('OfficialSet', 'Unknown')
                is_selected = False
                if selected_cards and name in selected_cards:
                    if v in selected_cards[name]:
                        is_selected = True
                
                prefix = "[SELECTED TARGET FOR ANALYSIS] " if is_selected else ""
                output += (
                    f"  {prefix}Version {i+1} ({set_name}):\n"
                    f"    Type: {v.get('Type')}, Alignment: {v.get('Alignment')}\n"
                    f"    Special Ability: {v.get('SpecialAbility', 'None')}\n"
                )
        return output

    def contains_unauthorized_cards(self, text: str, authorized_names: List[str]) -> Optional[str]:
        if not authorized_names: return None
        text_lower = text.lower()
        auth_lower = {name.lower() for name in authorized_names}
        for auth_name in auth_lower:
            if auth_name in text_lower: return None
        for name in self.cards_by_name.keys():
            if name in self.blacklist or len(name) < 5: continue
            if name.lower() in text_lower: return name
        return None

    def get_comprehensive_context(self, question: str, researcher_specs: List[str] = None, 
                                  selected_cards: Dict[str, Any] = None, 
                                  all_candidates: Dict[str, Any] = None,
                                  pinned_rules: List[str] = None) -> str:
        """
        Assembles all 3 layers of deterministic context.
        Step 5: Prioritized Context Assembly.
        """
        # 1. Subject Identification (Steps 2 & 3 - Modified for V5.3 Gate)
        # If the RagEngine already performed selection, we use those cards.
        primary_cards = selected_cards if selected_cards else self.find_cards_in_text(question)
        
        # Format ALL candidates for the LLM to see, but explicitly mark the selected target
        context_cards = all_candidates if all_candidates else primary_cards
        card_context = self.format_card_context(context_cards, selected_cards)
        
        # 2. Extract technical keywords (Steps 1 & 4)
        # Use ONLY the question and the SELECTED subjects
        search_base = question
        primary_types = set()
        for name, versions in primary_cards.items():
            for v in versions:
                search_base += " " + v.get('SpecialAbility', '')
                if v.get('Type'):
                    t = v.get('Type')
                    search_base += " " + t
                    primary_types.add(t.split()[0].lower()) # Store base type (e.g. "Artifact")
        
        technical_keywords = self.get_technical_keywords(search_base)
        if researcher_specs:
            technical_keywords.update(researcher_specs)

        # 3. Pull Rule Sections (Step 5) with Type-Prioritization
        dynamic_rules = self.get_verb_definitions(
            search_base, 
            list(technical_keywords), 
            question, 
            list(primary_types),
            pinned_rules=pinned_rules
        )
        
        # 4. Mandatory Core (Agnostic: defined in engine_config.json)
        # Deduplication: Only add if not already in dynamic_rules
        reg_sections = self.rule_sections.get("REG", {})
        core_parts = []
        for section_title in self.config.get("mandatory_sections", []):
            if section_title in reg_sections:
                # Check if this section header is already present in dynamic_rules (V5.8 Robust check)
                header_prefix = f"#### [TERM] {section_title}"
                if header_prefix not in dynamic_rules:
                    core_parts.append(f"#### [CORE RULE] {section_title}\n{reg_sections[section_title]['content']}")

        core_context = "\n\n".join(core_parts)

        return (
            f"### LAYER 1: PERMANENT CORE MECHANICS\n{core_context}\n\n"
            f"### LAYER 2: TECHNICAL DEFINITIONS & TYPE RULES\n{dynamic_rules}\n\n"
            f"### LAYER 3: OFFICIAL CARD DATA\n{card_context}"
        )

    def get_verb_definitions(self, search_base: str, concepts: List[str] = None, 
                             original_question: str = "", primary_types: List[str] = None,
                             only_titles: bool = False,
                             pinned_rules: List[str] = None) -> Any:
        """
        Finds technical definitions. 
        If pinned_rules is provided, only returns the content of those specific rules (ignoring scores).
        """
        found_defs = []
        concept_set = {c.lower() for c in concepts} if concepts else set()
        type_set = {t.lower() for t in primary_types} if primary_types else set()
        sb_lower = search_base.lower()
        q_lower = original_question.lower()
        
        # Track added headers to prevent redundancy (Deduplication)
        # We normalize titles to catch "Control (REG)" and "Control: (Rulebook)" as same
        added_normalized_titles = set()
        
        # Process in Priority Order: REG -> ORDIR -> Rulebook
        priority_order = ["REG", "ORDIR", "Rulebook"]
        for doc_name in priority_order:
            sections = self.rule_sections.get(doc_name, {})
            for title, data in sections.items():
                title_l = title.lower()
                # Normalize title for comparison (remove punctuation and document suffixes)
                norm_title = re.sub(r'[\(\):].*$', '', title_l).strip()
                
                # Deduplication Gate (Step 5 Optimal): If already found in better source, SKIP
                if doc_name == "Rulebook" and norm_title in added_normalized_titles:
                    continue

                # Priority 1: Exact match for an extracted concept (VITAL)
                is_priority = any(title_l == c or title_l.startswith(c + ":") for c in concept_set)
                
                # Priority 2: TYPE-Match (Rules containing the card's Type)
                is_type_match = any(re.search(r'\b' + re.escape(t) + r'\b', title_l) for t in type_set)
                
                # Priority 3: Direct Header Match (V5.5: Robust Word-Set Match)
                # We check if all significant words of the title appear in the search base.
                title_words = [w for w in re.split(r'\W+', norm_title) if len(w) > 3]
                is_direct_match = False
                if title_words:
                    is_direct_match = all(re.search(r'\b' + re.escape(w), sb_lower) for w in title_words)
                
                # V5.8: If pinned_rules is active, the Librarian has FULL AUTHORITY.
                # We only match if it's in the pinned list.
                is_pinned = False
                if pinned_rules:
                    # Robust check for titles like "Artifact (REG)" vs norm_title "artifact"
                    is_pinned = any(p.lower().startswith(norm_title) for p in pinned_rules)
                    is_match = is_pinned
                else:
                    # Standard logic if no librarian is present
                    is_match = is_priority or is_type_match or is_direct_match
                    if not is_match:
                        for concept in concept_set:
                            if re.search(r'\b' + re.escape(concept) + r'\b', title_l):
                                is_match = True
                                break
                
                if is_match:
                    # SCORING LOGIC (Initialize before use)
                    score = 10
                    
                    # Ensure pinned items get a high score to stay at the top
                    if is_pinned: score += 1000
                    if is_priority: score += 100
                    if is_type_match: score += 150
                    if is_direct_match: score += 200
                    if doc_name == "REG": score += 20
                    
                    content = data['content']
                    
                    # --- ORDIR Precision Logic ---
                    if doc_name == "ORDIR":
                        is_specifically_requested = any(c in q_lower for c in ["is a", "are a", "count as", "considered"])
                        if (len(title) > 25 or "following" in content) and not is_specifically_requested:
                            continue
                    
                    found_defs.append({
                        "header": f"#### [TERM] {title} ({doc_name})",
                        "content": content,
                        "score": score
                    })
                    added_normalized_titles.add(norm_title)

        if only_titles:
            return [d["header"].replace("#### [TERM] ", "") for d in found_defs]

        # Deduplicate and sort by score
        found_defs.sort(key=lambda x: x["score"], reverse=True)
        seen = set()
        unique_results = []
        total_tokens_est = 0
        
        for d in found_defs:
            if d["header"] not in seen:
                # TOKEN CAP: Stop adding if we exceed a safe limit (~6k tokens for rules)
                if total_tokens_est > 6000: break
                
                formatted = f"{d['header']}\n{d['content']}"
                unique_results.append(formatted)
                seen.add(d["header"])
                total_tokens_est += len(formatted) // 4

        return "\n\n".join(unique_results) if unique_results else "No specific definitions found."


class PdfRuleParser:
    """Central parser for PDF rules using font boundaries."""
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.all_sections: Dict[str, Dict[str, Any]] = {}  # Category -> Title -> {content, is_glossary}

    def load_all_rules(self):
        # Prefer direct names, fallback to glob
        # Document-specific configurations based on font analysis
        configs = {
            "REG": {"h1": 36, "h2": 14, "font": "Arial"},
            "ORDIR": {"h1": 36, "h2": 14, "font": "Arial"},
            "Rulebook": {"h1": 24, "h2": 14, "font": "Times"}
        }
        
        categories = {
            "REG": ["REG.pdf", "REG*.pdf"],
            "Rulebook": ["Rulebook.pdf", "*Rulebook.pdf"],
            "ORDIR": ["ORDIR.pdf", "ORDIR*.pdf"]
        }
        
        for cat, patterns in categories.items():
            conf = configs.get(cat, {"h1": 30, "h2": 14, "font": "Arial"})
            found_path = None
            for pattern in patterns:
                matches = glob.glob(os.path.join(self.data_dir, pattern))
                if matches:
                    found_path = sorted(matches)[-1]
                    break
            
            if found_path and fitz:
                self.all_sections[cat] = self.extract_sections(found_path, conf["h1"], conf["h2"], conf["font"])
                logger.info(f"[PDF] Loaded {len(self.all_sections[cat])} sections for {cat} from {found_path}")

    def extract_sections(self, pdf_path: str, heading_size1: int, heading_size2: int, heading_font: str) -> Dict[str, Any]:
        """Extracts structured sections from a PDF exactly as main.py does."""
        try:
            doc = fitz.open(pdf_path)
            sections = {}
            current_title = None
            current_content = []
            is_glossary_mode = False
            tracking = False
            use_heading_size2 = False

            for page in doc:
                blocks = page.get_text("dict")["blocks"]
                for block in blocks:
                    for line in block.get("lines", []):
                        line_text = ""
                        line_font = None
                        line_size = None

                        for span in line.get("spans", []):
                            text = span["text"].strip()
                            font_size = round(span["size"])
                            font_name = span["font"]
                            if line_text: line_text += " "
                            line_text += text
                            if line_font is None:
                                line_font = font_name
                                line_size = font_size

                        if not line_text: continue

                        # Trigger Tracking - More flexible font/size matching
                        is_structure_trigger = "Special Ability Structure" in line_text and abs(line_size - 36) < 1.5
                        is_glossary_trigger = "Glossary of Terms" in line_text and (abs(line_size - 36) < 1.5 or abs(line_size - 24) < 1.5)
                        is_rulebook_start = ("Turn Outline" in line_text or "Draw Phase" in line_text) and abs(line_size - 24) < 1.5

                        if not tracking and (is_structure_trigger or is_rulebook_start):
                            logger.info(f"[PDF] STARTING TRACKING for {pdf_path} at: {line_text}")
                            tracking = True; use_heading_size2 = False; is_glossary_mode = False
                        if not is_glossary_mode and is_glossary_trigger:
                            logger.info(f"[PDF] SWITHCHING TO GLOSSARY for {pdf_path} at: {line_text}")
                            use_heading_size2 = True; tracking = True; is_glossary_mode = True; continue

                        is_heading = False
                        if tracking:
                            # Robust font matching: must contain the target family AND be Bold
                            font_l = (line_font or "").lower()
                            font_matches = heading_font.lower() in font_l and "bold" in font_l
                            
                            if font_matches and (abs(line_size - heading_size1) < 0.5 or abs(line_size - heading_size2) < 0.5):
                                is_heading = True
                                logger.info(f"[PDF] FOUND HEADING in {pdf_path}: {line_text} (size: {line_size}, font: {line_font})")

                        if is_heading:
                            if current_title and current_content:
                                sections[current_title] = {"content": "\n".join(current_content).strip(), "is_glossary": is_glossary_mode}
                            current_title = line_text
                            current_content = []
                        elif current_title:
                            current_content.append(line_text)

            if current_title and current_content:
                sections[current_title] = {"content": "\n".join(current_content).strip(), "is_glossary": is_glossary_mode}
            return sections
        except Exception as e:
            logger.error(f"Error parsing {pdf_path}: {e}")
            return {}
