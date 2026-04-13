import os
import json
import argparse
from concurrent.futures import ProcessPoolExecutor
from typing import List, Dict
from scripts.utils.data_loader import get_protective_shield, get_official_judges
from scripts.core.parser import parse_discord_log, create_user_mapping, DiscordMessage
from scripts.core.anonymizer import RuleAnonymizer
from scripts.core.extractor import RulingExtractor

def process_chunk(messages_chunk: List[DiscordMessage], user_map: Dict[str, str], shield: set) -> List[DiscordMessage]:
    """
    Worker function to anonymize a chunk of messages.
    """
    anonymizer = RuleAnonymizer(user_map, shield)
    for msg in messages_chunk:
        msg.author = user_map.get(msg.author, "UNKNOWN_USER")
        msg.content = anonymizer.anonymize_text(msg.content)
    return messages_chunk

def main():
    parser = argparse.ArgumentParser(description="TCG-Rule-Bot-Architect Optimized Pipeline")
    parser.add_argument("--input", type=str, default="data/DiscordRulings.txt", help="Input log file")
    parser.add_argument("--output", type=str, default="data/processed_rulings_final.json", help="Output JSON file")
    parser.add_argument("--carddata", type=str, default="data/carddata.json", help="Card data JSON path")
    parser.add_argument("--chunks", type=int, default=8, help="Number of parallel processes")
    args = parser.parse_args()

    print(f"--- Starting Optimized Pipeline for {args.input} ---")

    # 1. Load reference data
    print("Loading reference data and protective shield...")
    shield = get_protective_shield(args.carddata)
    judges = get_official_judges()
    
    # 2. Parse logs
    print(f"Parsing log file: {args.input}...")
    messages = parse_discord_log(args.input)
    total_msgs = len(messages)
    print(f"Found {total_msgs} unique messages.")
    
    # 3. Create User Mapping
    print("Creating one-way anonymization mapping (including shortcuts)...")
    user_map = create_user_mapping(messages, judges, shield)
    
    # 4. Optimized Anonymization using Multiprocessing
    print(f"Anonymizing in parallel using {args.chunks} processes...")
    chunk_size = (total_msgs // args.chunks) + 1
    chunks = [messages[i:i + chunk_size] for i in range(0, total_msgs, chunk_size)]
    
    anonymized_messages = []
    with ProcessPoolExecutor(max_workers=args.chunks) as executor:
        futures = [executor.submit(process_chunk, chunk, user_map, shield) for chunk in chunks]
        for future in futures:
            anonymized_messages.extend(future.result())
            
    # Sort by timestamp to ensure extraction logic works correctly
    # (Assuming logs are sequential, if not, we'd need more complex sorting)
    
    # 5. Extract Q&A Pairs
    print("Extracting refined Q&A pairs...")
    extractor = RulingExtractor(anonymized_messages)
    qa_pairs = extractor.cluster_messages()
    print(f"Extracted {len(qa_pairs)} Knowledge Units.")
    
    # 6. Save Output
    print(f"Saving final results to {args.output}...")
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(qa_pairs, f, indent=4)
        
    print("--- Optimized Pipeline Finished Successfully ---")

if __name__ == "__main__":
    main()
