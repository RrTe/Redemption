"""
Pipeline Stage 7: AI-Assisted ORDIR Errata Generator (Offline)

Purpose:
Analyzes the unmatched ORDIR log, queries a selected AI model (Gemini, Groq,
or Ollama) with context-rich semantic candidate lists, and generates highly
accurate static mapping overrides to mappings/special_ordir_overrides.py.

Usage:
1. Ensure a '.env' file exists with GEMINI_API_KEY, GROQ_API_KEY, or local Ollama configuration.
2. Run 'python scripts/07_generate_ai_errata.py' to generate the errata map.
"""

import os
import json
import re
import sys
import time
from pathlib import Path
import requests
from thefuzz import process, fuzz

# Set up paths
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

UNMATCHED_LOG = BASE_DIR / _config["unmatched_ordir_entries_log"]
CARDS_FILE = BASE_DIR / _config["carddata_json"]
OVERRIDES_FILE = BASE_DIR / "mappings" / "special_ordir_overrides.py"

# Add project root to sys.path
sys.path.append(str(BASE_DIR))
from mappings.alias_engine import normalize_name, extract_all_raw_sets_from_card


def load_env():
    """Manually parses the local .env file and populates os.environ."""
    if not ENV_FILE.exists():
        print("No .env file found. Proceeding with system environment variables...")
        return
    
    with ENV_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()
    print("Successfully loaded .env variables.")


def load_unmatched() -> list[dict]:
    """Parses unmatched entries from data/unmatched_ordir_entries.log.

    Returns:
        list[dict]: List of parsed unmatched card items.
    """
    if not UNMATCHED_LOG.exists():
        print(f"No unmatched log found at {UNMATCHED_LOG}. Run pipeline first.")
        sys.exit(0)

    unmatched_items = []
    current_item = {}
    
    with UNMATCHED_LOG.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith("-") and current_item:
                unmatched_items.append(current_item)
                current_item = {}
                continue
            
            if line.startswith("Card: "):
                # Card: emperor nero [P-2025] (Original: Emperor Nero)
                match = re.match(r"Card:\s*(.*?)\s*\[(.*?)\]\s*\(Original:\s*(.*?)\)", line)
                if match:
                    current_item["target_name"] = match.group(1).strip()
                    current_item["target_set"] = match.group(2).strip()
                    current_item["original_name"] = match.group(3).strip()
            elif line.startswith("Categories: "):
                current_item["categories"] = [c.strip() for c in line[12:].split(",")]
            elif line.startswith("Raw string: "):
                current_item["raw_string"] = line[12:].strip()

    print(f"Loaded {len(unmatched_items)} unmatched entries to resolve.")
    return unmatched_items


def load_card_database() -> list[dict]:
    """Loads card entries from data/carddata.json.

    Returns:
        list[dict]: Flat database cards list.
    """
    with CARDS_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)["cards"]


def find_top_candidates(target_name: str, target_set: str, cards_db: list[dict]) -> list[dict]:
    """Searches the database for the top 10 semantic candidates using token ratio.

    Args:
        target_name (str): Unmatched card name.
        target_set (str): Target set filter string.
        cards_db (list[dict]): Full card database.

    Returns:
        list[dict]: Top candidate card entries.
    """
    candidates = []
    # Build unique names to test against
    db_names = list(set(c["Name"] for c in cards_db))
    
    # Get top 20 fuzzy name matches
    matches = process.extractBests(target_name, db_names, scorer=fuzz.token_set_ratio, limit=20)
    matched_names = [m[0] for m in matches]
    
    # Filter full card records of these matched names
    seen_ids = set()
    for c in cards_db:
        name = c["Name"]
        if name in matched_names:
            c_set = c.get("Set", "")
            # Ensure unique instances based on Name + Set
            c_id = (name, c_set)
            if c_id not in seen_ids:
                seen_ids.add(c_id)
                candidates.append({
                    "Name": name,
                    "Set": c_set,
                    "Rarity": c.get("Rarity", ""),
                    "OfficialSet": c.get("OfficialSet", "")
                })

    # Return top 10 candidates
    return candidates[:10]


def query_llm(backend: str, prompt: str) -> str:
    """Dispatches query to Gemini, Groq, or Ollama based on loaded configs.

    Args:
        backend (str): Selected backend ('gemini', 'groq', or 'ollama').
        prompt (str): Prompt to send.

    Returns:
        str: Raw JSON string response from LLM.
    """
    if backend == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        }
        resp = requests.post(url, headers=headers, json=body, timeout=60)
        resp.raise_for_status()
        res_json = resp.json()
        return res_json["candidates"][0]["content"]["parts"][0]["text"]
        
    elif backend == "groq":
        api_key = os.environ.get("GROQ_API_KEY")
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        body = {
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"}
        }
        resp = requests.post(url, headers=headers, json=body, timeout=60)
        resp.raise_for_status()
        res_json = resp.json()
        return res_json["choices"][0]["message"]["content"]
        
    elif backend == "ollama":
        host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        model = os.environ.get("OLLAMA_MODEL", "llama3")
        url = f"{host}/api/generate"
        body = {
            "model": model,
            "prompt": prompt,
            "format": "json",
            "stream": False
        }
        resp = requests.post(url, json=body, timeout=90)
        resp.raise_for_status()
        res_json = resp.json()
        return res_json["response"]
        
    raise ValueError(f"Unknown backend: {backend}")


def build_prompt(batch: list[dict]) -> str:
    """Builds the context-aware structured Prompt for the LLM.

    Args:
        batch (list[dict]): Segmented batch of unmatched cards.

    Returns:
        str: Prompt text.
    """
    prompt = """You are a highly precise database matching assistant for the Redemption TCG card game.
Your task is to match cards from the official ORDIR rules list (which have annotations and minor typos) to the exact canonical cards in our database.

For each unmatched card in the list, I will provide:
1. "Unmatched Card Name" as listed in ORDIR.
2. "Target Set" expected by ORDIR.
3. "Raw string" parsed from the original PDF rules text.
4. "Categories" to which the card belongs.
5. "Candidates" - a list of potential matching cards currently in the database.

TASK:
Identify the correct canonical card from the "Candidates" list that represents the exact match for the ORDIR card.
Rules:
- If a candidate card is a clear semantic match (e.g. spelling variation like "Task Master" vs "Taskmaster", or "Seraphim [Band to Blue]" matching "Seraphim - Isaiah 6:2" because they refer to the same set/verse context), return its exact "Name" as the "matched_canonical_name".
- IMPORTANT: Set codes in ORDIR can use years (like P-2025) or custom print names, while the database uses standard abbreviations (like Pmo-P2, Ap, Wa). Do NOT return NONE just because the set names don't match exactly! If the card name is semantically the same or a very clear match (e.g. "Emperor Nero" matching "Emperor Nero (Promo)" or "Emperor Nero"), please choose the best-fitting database card name.
- If the card has a year mismatch in the set code, but matches perfectly otherwise, prefer the most semantically correct reprint.
- Only return "NONE" if there is absolutely no card in the database that represents the card (e.g., if it's a completely different character or concept).
- Return your response strictly as a JSON object with the key "mappings" containing a list of mapped objects.

Expected Output Format:
{
  "mappings": [
    {
      "original_name": "Unmatched Card Name",
      "target_set": "Target Set",
      "matched_canonical_name": "Canonical Card Name from Candidates List or NONE"
    }
  ]
}

UNMATCHED ITEMS LIST:
"""
    for idx, item in enumerate(batch):
        prompt += f"\n--- Item {idx+1} ---\n"
        prompt += f"Original Name: {item['original_name']}\n"
        prompt += f"Target Name: {item['target_name']}\n"
        prompt += f"Target Set: {item['target_set']}\n"
        prompt += f"Raw String: {item['raw_string']}\n"
        prompt += f"Categories: {', '.join(item['categories'])}\n"
        prompt += "Candidates in Database:\n"
        for c in item["candidates"]:
            prompt += f"  - Name: \"{c['Name']}\", Set: \"{c['Set']}\", Rarity: \"{c['Rarity']}\", OfficialSet: \"{c['OfficialSet']}\"\n"
            
    prompt += "\nRespond strictly in valid JSON matching the exact schema."
    return prompt


def generate_errata():
    """Orchestrates the AI loading, segment batching, querying, and updating

    of overrides.
    """
    load_env()
    
    # Determine the LLM backend
    backend = None
    if os.environ.get("GEMINI_API_KEY"):
        backend = "gemini"
    elif os.environ.get("GROQ_API_KEY"):
        backend = "groq"
    else:
        # Fallback to local Ollama (assumes it is running)
        print("No cloud API keys found. Attempting to fall back to local Ollama...")
        try:
            host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
            requests.get(host, timeout=5)
            backend = "ollama"
        except requests.exceptions.RequestException:
            print("ERROR: Local Ollama is not running under http://localhost:11434.")
            print("Please set GEMINI_API_KEY, GROQ_API_KEY, or run Ollama locally.")
            sys.exit(1)

    print(f"Selected AI Backend: {backend.upper()}")
    
    unmatched_items = load_unmatched()
    cards_db = load_card_database()
    
    # Build candidate lists for all items
    print("Locating closest database candidates for each unmatched item...")
    for item in unmatched_items:
        item["candidates"] = find_top_candidates(
            item["target_name"], item["target_set"], cards_db
        )

    # Batching: Process in segments of 10 items to prevent context pollution
    batch_size = 10
    resolved_mappings = {}

    print(f"Processing in batches of {batch_size}...")
    for i in range(0, len(unmatched_items), batch_size):
        batch = unmatched_items[i:i+batch_size]
        print(f"  Querying batch {i//batch_size + 1}/{(len(unmatched_items)-1)//batch_size + 1}...")
        
        prompt = build_prompt(batch)
        try:
            response_text = query_llm(backend, prompt)
            
            # Extract JSON from potential markdown blocks
            json_match = re.search(r"({.*})", response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)
                
            res_json = json.loads(response_text)
            for mapping in res_json.get("mappings", []):
                o_name = mapping.get("original_name")
                o_set = mapping.get("target_set")
                can_name = mapping.get("matched_canonical_name")
                
                if o_name and o_set and can_name and can_name != "NONE":
                    resolved_mappings[(o_name, o_set)] = can_name
                    print(f"    Resolved: ({o_name}, {o_set}) -> {can_name}")
                    
        except Exception as e:
            print(f"    Error processing batch starting at {i}: {e}")
            continue
        finally:
            # Respect Gemini rate limits
            time.sleep(5.0)

    # Merge resolved mappings with existing manual overrides
    print(f"Merging {len(resolved_mappings)} resolved mappings...")
    from mappings.special_ordir_overrides import SPECIAL_ORDIR_OVERRIDES
    
    merged_overrides = SPECIAL_ORDIR_OVERRIDES.copy()
    
    # Normalize keys and values
    for (o_name, o_set), can_name in resolved_mappings.items():
        # Keep keys as they were logged, so the Registry mapping resolves them instantly
        key = (o_name, o_set)
        merged_overrides[key] = can_name

    # Write merged overrides back to special_ordir_overrides.py
    print(f"Writing updated overrides to {OVERRIDES_FILE}...")
    with OVERRIDES_FILE.open("w", encoding="utf-8") as f:
        f.write("# Harte Overrides für bekannte Fehlprints oder Sonderfälle,\n")
        f.write("# die parser-unabhängig in die Maps geschrieben werden sollen.\n\n")
        f.write("SPECIAL_ORDIR_OVERRIDES = {\n")
        
        # Sort for readability
        for (name, o_set), target in sorted(merged_overrides.items(), key=lambda x: (x[0][0], x[0][1])):
            # Escape strings carefully
            esc_name = name.replace('"', '\\"')
            if isinstance(target, dict):
                # Keep old metadata overrides intact
                f.write(f'    ("{esc_name}", "{o_set}"): {target},\n')
            else:
                esc_target = target.replace('"', '\\"')
                f.write(f'    ("{esc_name}", "{o_set}"): "{esc_target}",\n')
                
        f.write("}\n")

    print("\nAI Errata Generation Completed successfully!")
    print("Now run 'python run_pipeline.py' to apply the new overrides!")


if __name__ == "__main__":
    generate_errata()
