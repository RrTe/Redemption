# Books for OT/NT selection
OT_BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "I Samuel", "II Samuel", "I Kings", "II Kings", "I Chronicles", "II Chronicles", "Ezra",
    "Nehemiah", "Esther", "Job", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon",
    "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
    "Malachi", "Old Testament"
]

NT_BOOKS = [
    "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "I Corinthians", "II Corinthians",
    "Galatians", "Ephesians", "Philippians", "Colossians", "I Thessalonians", "II Thessalonians",
    "I Timothy", "II Timothy", "Titus", "Philemon", "Hebrews", "James", "I Peter", "II Peter",
    "I John", "II John", "III John", "Jude", "Revelation", "Josephus", "New Testament"
]

GOSPEL_BOOKS = ["Matthew", "Mark", "Luke", "John"]

# Mapping for Alignment based on Type
BASE_ALIGNMENT_MAP = {
    "Hero": "Good",
    "GE": "Good",
    "Evil Character": "Evil",
    "EE": "Evil",
    "Artifact": "Neutral",
    "Site": "Neutral",
    "Lost Soul": "Neutral",
    "Hero Token": "Good",
    "Evil Character Token": "Evil",
    "Lost Soul Token": "Neutral",
    "Covenant": "Neutral/Good",
    "Curse": "Neutral/Evil",
    "City": "Neutral", # City logic handles the second part via Fortress
}

# Special Type patterns
DA_TYPES = ["DAC", "DAE", "DAx"]
GOOD_TYPES = ["Hero", "GE", "Dominant"]
EVIL_TYPES = ["Evil Character", "EE", "Dominant"] # Dominant can be either, handled via original alignment
NEUTRAL_TYPES = ["Artifact", "Site", "Lost Soul"]
