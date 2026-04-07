import re
from datetime import datetime
from typing import List, Dict, Set, Optional
import os

class DiscordMessage:
    """Represents a single parsed Discord message."""
    def __init__(self, timestamp: str, author: str, content: str):
        self.timestamp = timestamp
        self.author = author
        self.content = content
        self.is_judge = False
        self.anonymized_author = None

    def __repr__(self):
        return f"[{self.timestamp}] <{self.author}>: {self.content[:100]}..."

def parse_discord_log(filepath: str) -> List[DiscordMessage]:
    """
    Parse a Discord log file and return a list of DiscordMessage objects.
    
    Args:
        filepath: Path to the log file.
        
    Returns:
        A list of DiscordMessage objects with raw data.
    """
    messages = []
    if not os.path.exists(filepath):
        print(f"Error: Log file not found at {filepath}")
        return messages

    # Regex to match the message header: [18.05.2019 15:47] Nickname
    header_pattern = re.compile(r'^\[(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})\]\s(.*)$')
    
    current_message = None

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.rstrip()
            if not line:
                continue

            match = header_pattern.match(line)
            if match:
                # Save previous message before starting new one
                if current_message:
                    messages.append(current_message)
                
                timestamp_str = match.group(1)
                author_name = match.group(2).strip()
                current_message = DiscordMessage(timestamp_str, author_name, "")
            else:
                # Append line to current message content
                if current_message:
                    if current_message.content:
                        current_message.content += "\n" + line
                    else:
                        current_message.content = line
                    
        # Don't forget the last message
        if current_message:
            messages.append(current_message)

    return messages

def create_user_mapping(messages: List[DiscordMessage], judge_set: Set[str], shield: Set[str] = None) -> Dict[str, str]:
    """
    Create a unique mapping of real names (and their shortcuts) to anonymized IDs.
    
    Args:
        messages: List of parsed messages.
        judge_set: Set of official judge nicknames (lowercase).
        shield: Optional set of protected terms to avoid mapping shortcuts to common words.
        
    Returns:
        Mapping: {Real Name/Shortcut: Anonymized ID}
    """
    user_map = {}
    judge_count = 1
    user_count = 1
    shield = shield or set()
    
    # Identify unique full names first
    all_names = sorted(list(set(m.author for m in messages)))
    
    # Temporary mapping for full names 
    full_name_mapping = {}
    
    for name in all_names:
        if name.lower() in judge_set:
            anon_id = f"JUDGE_{judge_count:03d}"
            full_name_mapping[name] = anon_id
            judge_count += 1
        else:
            anon_id = f"USER_{user_count:03d}"
            full_name_mapping[name] = anon_id
            user_count += 1
            
    # Add full names to final map
    user_map.update(full_name_mapping)
    
    # SECOND PASS: Identify shortcuts for each full name
    for name, anon_id in full_name_mapping.items():
        # Heuristic for shortcuts:
        # 1. Strip common prefixes like "Redemption" or "RDM"
        # 2. Extract CamelCase parts
        
        clean_name = re.sub(r'^(Redemption|RDM|The)', '', name, flags=re.IGNORECASE)
        potential_shortcuts = {clean_name}
        
        # Add CamelCase parts
        parts = re.findall(r'[A-Z][a-z0-9]+|[a-z0-9]+', clean_name)
        potential_shortcuts.update(parts)
        potential_shortcuts.add(name) # Full name is already mapped but helpful for logic
        
        for part in potential_shortcuts:
            part_lower = part.lower()
            # Requirements: > 3 chars, not in shield, not just a number
            if len(part) > 3 and part_lower not in shield and not part.isdigit():
                if part not in user_map:
                    user_map[part] = anon_id
        
    # FINAL SAFETY OVERRIDES for persistent leaks
    if "RedemptionAggie" in user_map:
        aggie_id = user_map["RedemptionAggie"]
        user_map["redemptionaggie"] = aggie_id
        user_map["aggie"] = aggie_id
        
    # Search for cthetree in messages if not found yet
    for m in messages:
        if "cthetree" in m.author.lower() and "cthetree" not in user_map:
            user_map["cthetree"] = user_map.get(m.author, "USER_PII")
            break
            
    return user_map
