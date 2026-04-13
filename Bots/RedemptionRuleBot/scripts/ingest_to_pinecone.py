import json
import os
import re
import time
from datetime import datetime
from typing import List, Dict, Any
from pinecone import Pinecone
from pinecone.exceptions import PineconeApiException
from dotenv import load_dotenv

# Import constants for Judge verification
from scripts.core.constants.judges import OFFICIAL_JUDGES_LOWER

load_dotenv()

def get_pinecone_client():
    api_key = os.getenv("PINECONE_API_KEY")
    index_name = os.getenv("PINECONE_INDEX_NAME")
    if not api_key or not index_name:
        raise ValueError("Missing PINECONE_API_KEY or PINECONE_INDEX_NAME in .env")
    
    print(f"Connecting to Pinecone Index: {index_name}...")
    pc = Pinecone(api_key=api_key)
    return pc.Index(index_name)

def chunk_text_file(filepath: str, max_chunk_size: int = 4000) -> List[Dict[str, Any]]:
    """
    Splits a rulebook TXT file into chapters/chunks based on detected headings.
    """
    filename = os.path.basename(filepath)
    print(f"Processing rulebook: {filename}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    sections = re.split(r'\n{2,}', content) 
    
    chunks = []
    current_chunk = ""
    current_heading = "General"
    
    def add_final_chunk(text_content, heading):
        safe_text = text_content[:8000] 
        chunks.append({
            "text": f"Source: {filename}\nSection: {heading}\n\n{safe_text}",
            "metadata": {
                "source": f"Rulebook: {filename}",
                "section": heading,
                "is_judge": True,
                "date": "2026-03-13"
            }
        })

    for section in sections:
        section = section.strip()
        if not section:
            continue
            
        if len(section) < 100 and '\n' not in section:
            if current_chunk:
                add_final_chunk(current_chunk, current_heading)
            current_heading = section
            current_chunk = ""
        else:
            while len(section) > max_chunk_size:
                split_idx = section.rfind('\n', 0, max_chunk_size)
                if split_idx == -1: split_idx = max_chunk_size
                part = section[:split_idx]
                add_final_chunk(part, current_heading)
                section = section[split_idx:].strip()
            
            if len(current_chunk) + len(section) > max_chunk_size:
                add_final_chunk(current_chunk, current_heading)
                current_chunk = section
            else:
                current_chunk += "\n\n" + section if current_chunk else section

    if current_chunk:
        add_final_chunk(current_chunk, current_heading)
        
    return chunks

def process_rulings(filepath: str) -> List[Dict[str, Any]]:
    """
    Processes the processed_rulings_final.json into indexable records.
    FIXED: Uses correct JSON fields (date, question_author, judges).
    """
    print(f"Processing rulings: {filepath}")
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    records = []
    for item in data:
        # Correct fields from JSON
        full_date = item.get('date', 'Unknown Date')
        author = item.get('question_author', 'Unknown User')
        judges_list = item.get('judges', [])
        
        # Identification of Judge status
        is_official = len(judges_list) > 0 or "(JUDGE_" in item.get('answer', '')
        
        # Split date and time for metadata
        dt_parts = full_date.split(' ')
        date_str = dt_parts[0] if len(dt_parts) > 0 else "Unknown"
        time_str = dt_parts[1] if len(dt_parts) > 1 else "Unknown"

        # Content block (optimized for citation)
        text_block = (
            f"SOURCE: Discord Ruling\n"
            f"DATE: {date_str}\n"
            f"TIME: {time_str}\n"
            f"AUTHOR: {author}\n"
            f"OFFICIAL JUDGE: {is_official}\n\n"
            f"QUESTION: {item['question']}\n\n"
            f"ANSWER: {item['answer']}"
        )
        
        records.append({
            "text": text_block,
            "metadata": {
                "source": "Discord Ruling",
                "date": date_str,
                "time": time_str,
                "author": author,
                "is_judge": is_official
            }
        })
    return records

def upsert_to_pinecone(index, records: List[Dict[str, Any]], batch_size: int = 20, start_id_offset: int = 0):
    """
    Upserts records to Pinecone. 
    start_id_offset ensures we overwrite the correct existing records.
    """
    total = len(records)
    print(f"Upserting {total} records (starting from rec_{start_id_offset}) to Pinecone...")
    
    for i in range(0, total, batch_size):
        batch = records[i:i + batch_size]
        
        pinecone_records = []
        for idx, rec in enumerate(batch):
            current_id_num = start_id_offset + i + idx
            record = {
                "id": f"rec_{current_id_num}",
                "text": rec["text"]
            }
            record.update(rec["metadata"])
            pinecone_records.append(record)
        
        while True:
            try:
                index.upsert_records(namespace="__default__", records=pinecone_records)
                time.sleep(8) # Throttling for Free Tier
                break
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                    print(f"  ⏳ Rate limit reached. Waiting 30s...")
                    time.sleep(30)
                else:
                    print(f"  ❌ Error: {error_msg}")
                    time.sleep(10)
        
        if (i + batch_size) % 100 == 0 or (i + batch_size) >= total:
            print(f"  - Progress: {min(i + batch_size, total)}/{total}")

if __name__ == "__main__":
    try:
        index = get_pinecone_client()
        
        # Only process rulings as requested to save time and fix metadata
        rulings_path = "data/processed_rulings_final.json"
        
        if os.path.exists(rulings_path):
            records = process_rulings(rulings_path)
            # Offset of 157 matches the rulebook chunks from the first run
            upsert_to_pinecone(index, records, start_id_offset=157)
            print("Successfully updated Discord Ruling metadata!")
        else:
            print("Rulings file not found.")
            
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
