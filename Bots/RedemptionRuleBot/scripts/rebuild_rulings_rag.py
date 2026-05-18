import os
import json
import time
import logging
from typing import List, Dict, Any
from pinecone import Pinecone
from dotenv import load_dotenv

from scripts.core.parser import parse_discord_log, create_user_mapping
from scripts.core.anonymizer import RuleAnonymizer
from scripts.core.extractor import RulingExtractor
from scripts.utils.data_loader import get_protective_shield, get_official_judges

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

def get_pinecone_index():
    api_key = os.getenv("PINECONE_API_KEY")
    index_name = os.getenv("PINECONE_INDEX_NAME")
    if not api_key or not index_name:
        raise ValueError("Missing PINECONE_API_KEY or PINECONE_INDEX_NAME in .env")
    
    pc = Pinecone(api_key=api_key)
    return pc.Index(index_name)

def rebuild_rag(input_file: str, output_json: str, card_data: str):
    logger.info(f"--- Starting Clean RAG Rebuild from {input_file} ---")
    
    # 1. Load reference data
    logger.info("Loading reference data and protective shield...")
    shield = get_protective_shield(card_data)
    judges = get_official_judges()
    logger.info(f"Found {len(judges)} official judges in list.")

    # 2. Parse logs
    logger.info(f"Parsing log file: {input_file}...")
    messages = parse_discord_log(input_file)
    if not messages:
        logger.error("No messages found in log file.")
        return

    # 3. Create Anonymization Mapping
    logger.info("Creating anonymization mapping...")
    user_map = create_user_mapping(messages, judges, shield)
    anonymizer = RuleAnonymizer(user_map, shield)

    # 4. Anonymize and Extract
    logger.info("Anonymizing messages and extracting Q&A pairs...")
    for msg in messages:
        msg.author = user_map.get(msg.author, "UNKNOWN_USER")
        msg.content = anonymizer.anonymize_text(msg.content)
    
    extractor = RulingExtractor(messages)
    qa_pairs = extractor.cluster_messages()
    logger.info(f"Extracted {len(qa_pairs)} anonymized Knowledge Units.")

    # 5. Save local backup
    logger.info(f"Saving anonymized backup to {output_json}...")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(qa_pairs, f, indent=4)

    # 6. Pinecone Reset & Upload
    try:
        index = get_pinecone_index()
        
        # CLEAR INDEX
        logger.info("⚠️ Wiping Pinecone Index (Rulings-Only Mode)...")
        index.delete(delete_all=True)
        logger.info("Index cleared. Waiting for stabilization...")
        time.sleep(15) 

        # Prepare records
        pinecone_records = []
        for i, item in enumerate(qa_pairs):
            full_date = item.get('date', 'Unknown')
            author = item.get('question_author', 'Unknown')
            is_judge = len(item.get('judges', [])) > 0
            
            # Content block optimized for LLM retrieval
            text_block = (
                f"SOURCE: Discord Ruling\n"
                f"DATE: {full_date}\n"
                f"AUTHOR: {author}\n"
                f"OFFICIAL JUDGE: {is_judge}\n\n"
                f"QUESTION: {item['question']}\n\n"
                f"ANSWER: {item['answer']}"
            )
            
            record = {
                "id": f"rec_{i:04d}",
                "text": text_block,
                "source": "Discord Ruling",
                "date": full_date,
                "author": author,
                "is_judge": is_judge
            }
            pinecone_records.append(record)

        # Batch Upsert using upsert_records (matching ingest_to_pinecone.py)
        batch_size = 20
        total = len(pinecone_records)
        logger.info(f"Upserting {total} records to Pinecone...")
        
        for i in range(0, total, batch_size):
            batch = pinecone_records[i:i + batch_size]
            
            while True:
                try:
                    index.upsert_records(namespace="__default__", records=batch)
                    time.sleep(5) # Throttling
                    break
                except Exception as e:
                    error_msg = str(e)
                    if "429" in error_msg:
                        logger.warning("  ⏳ Rate limit reached. Waiting 30s...")
                        time.sleep(30)
                    else:
                        raise e
            
            if (i + batch_size) % 100 == 0 or (i + batch_size) >= total:
                logger.info(f"  - Progress: {min(i + batch_size, total)}/{total}")

        logger.info("--- Rebuild Finished Successfully ---")

    except Exception as e:
        logger.error(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    rebuild_rag(
        input_file="data/DiscordRulings.txt",
        output_json="data/processed_rulings_final.json",
        card_data="data/carddata.json"
    )
