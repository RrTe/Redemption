import re
import os
from typing import Dict, Set, List
try:
    from presidio_analyzer import AnalyzerEngine, NlpEngineProvider
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig
    PRESIDIO_AVAILABLE = True
except ImportError:
    PRESIDIO_AVAILABLE = False

class RuleAnonymizer:
    """Anonymizes Discord logs using mapping and PII detection."""
    

    def __init__(self, user_map: Dict[str, str], protective_shield: Set[str]):
        """
        Initialize the anonymizer.
        
        Args:
            user_map: Mapping of real names to USER/JUDGE IDs.
            protective_shield: Set of terms that should NEVER be anonymized.
        """
        self.user_map = user_map
        self.protective_shield = protective_shield
        self.analyzer = None
        self.anonymizer = None
        
        if PRESIDIO_AVAILABLE:
            # Custom configuration to avoid automatic downloads in multiprocessing workers
            configuration = {
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": "en_core_web_lg"}]
            }
            provider = NlpEngineProvider(nlp_configuration=configuration)
            nlp_engine = provider.create_engine()
            
            self.analyzer = AnalyzerEngine(nlp_engine=nlp_engine)
            self.anonymizer = AnonymizerEngine()
        else:
            print("Warning: presidio-analyzer/anonymizer not found. Falling back to basic mapping.")

    def clean_text(self, text: str) -> str:
        """
        Remove embeds, attachments, and other Discord noise.
        """
        # Remove {Embed} tags and content following them (if it looks like a URL/Embed)
        text = re.sub(r'\{Embed\}.*?(\n\n|$)', '', text, flags=re.DOTALL)
        # Remove {Attachments}
        text = re.sub(r'\{Attachments\}.*?(\n\n|$)', '', text, flags=re.DOTALL)
        # Remove common Discord bot or reaction clutter
        text = re.sub(r':\w+:', '', text) # Remove emojis :smile:
        
        return text.strip()

    def anonymize_text(self, text: str) -> str:
        """
        Anonymize a piece of text using the user map and optionally Presidio.
        Order: Noise removal -> Mapping replacement -> Presidio analysis.
        
        Args:
            text: The raw message content.
            
        Returns:
            The anonymized text.
        """
        # LAYER 3: Clean the text first (Noise removal)
        text = self.clean_text(text)
        
        # LAYER 1: Sequential replacement of all mapped usernames/shortcuts
        # We process longer names first to avoid "Aggie" shadowing "RedemptionAggie"
        sorted_names = sorted(self.user_map.keys(), key=len, reverse=True)
        
        for name in sorted_names:
            anon_id = self.user_map[name]
            
            # Skip if name is in protective shield (e.g. "Moses")
            if name.lower() in self.protective_shield:
                continue
            
            # IMPROVED REGEX: 
            # We use lookarounds to ensure we match the name but allow special chars (like '.') 
            # that are not considered 'word characters' by \b.
            # Only characters that are alphanumeric should not be immediately adjacent.
            pattern = re.compile(rf'(?<![a-zA-Z0-9])(@)?{re.escape(name)}(?![a-zA-Z0-9])', re.IGNORECASE)
            
            def replace_match(match):
                prefix = match.group(1) or ""
                return f"{prefix}{anon_id}"
            
            text = pattern.sub(replace_match, text)

        # LAYER 2: Presidio (if available) for missed PII like emails or rare names
        if self.analyzer and self.anonymizer:
            # We pass the protective_shield as an allow_list to Presidio
            results = self.analyzer.analyze(
                text=text, 
                entities=["PERSON", "EMAIL_ADDRESS", "LOCATION"], 
                language='en',
                allow_list=list(self.protective_shield)
            )
            
            # Filter results: avoid anonymizing words that are in our shield
            # (though allow_list should handle it, we double check here)
            filtered_results = [
                res for res in results 
                if text[res.start:res.end].lower() not in self.protective_shield
            ]
            
            # Use constant replacement for simplicity in the one-way process
            anonymized_result = self.anonymizer.anonymize(
                text=text,
                analyzer_results=filtered_results,
                operators={
                    "PERSON": OperatorConfig("replace", {"new_value": "USER_PII"}),
                    "EMAIL_ADDRESS": OperatorConfig("replace", {"new_value": "EMAIL_PII"}),
                    "LOCATION": OperatorConfig("replace", {"new_value": "LOCATION_PII"}),
                }
            )
            text = anonymized_result.text

        return text
