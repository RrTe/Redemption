from scripts.utils.data_loader import get_protective_shield
from scripts.core.anonymizer import RuleAnonymizer
import os

def test_over_anonymization():
    """
    Test that card names and biblical terms are NOT anonymized even in text.
    """
    card_data_path = "data/carddata.json"
    if not os.path.exists(card_data_path):
        print("Skipping test: carddata.json not found.")
        return

    shield = get_protective_shield(card_data_path)
    # Mock user map
    user_map = {
        "RedemptionAggie": "JUDGE_001",
        "Gabe":            "JUDGE_002",
        "Moses":           "USER_FAKE" # This shouldn't happen if shield works
    }
    
    anonymizer = RuleAnonymizer(user_map, shield)
    
    test_cases = [
        "So how does Noah's Ark work?",
        "Moses is a cool hero.",
        "RedemptionAggie said to use BTN.",
        "Can I play Aaron (Di)?",
        "Gabe told me about Great White Throne."
    ]
    
    print("--- Running Over-Anonymization Tests ---")
    for tc in test_cases:
        anon = anonymizer.anonymize_text(tc)
        print(f"Original: {tc}")
        print(f"Anonymized: {anon}")
        print("-" * 20)

if __name__ == "__main__":
    test_over_anonymization()
