"""
set_sync_state.py — Manual Sync State Helper
--------------------------------------------
Run this script BEFORE starting the bot locally to define the "Aufsetzpunkt"
(the Discord message ID from which the Auto-Sync should start reading).

The bot reads this value from data/sync_state.json on startup.

Usage:
    python scripts/set_sync_state.py <message_id>

Example:
    python scripts/set_sync_state.py 1234567890123456789
"""

import json
import os
import sys


STATE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sync_state.json")


def set_sync_state(message_id: int) -> None:
    """Write the given message ID as the last-synced state.

    Args:
        message_id: The Discord message ID to use as the starting point
                    for the next auto-sync run.

    Returns:
        None
    """
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    payload = {"last_message_id": message_id}
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4)
    print(f"[OK] sync_state.json updated: last_message_id = {message_id}")
    print(f"     File: {STATE_FILE}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/set_sync_state.py <message_id>")
        sys.exit(1)

    try:
        msg_id = int(sys.argv[1])
    except ValueError:
        print(f"[ERROR] '{sys.argv[1]}' is not a valid integer message ID.")
        sys.exit(1)

    set_sync_state(msg_id)
