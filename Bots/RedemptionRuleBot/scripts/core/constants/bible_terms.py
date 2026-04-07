# ============================================================
# OLD TESTAMENT CHARACTERS
# ============================================================

OLD_TESTAMENT_CHARACTERS = {
    "aaron",
    "abednego",
    "abel",
    "abraham",
    "absalom",
    "adam",
    "ahab",
    "amnon",
    "amos",
    "bathsheba",
    "benjamin",
    "boaz",
    "cain",
    "caleb",
    "daniel",
    "david",
    "delilah",
    "eli",
    "elijah",
    "elisha",
    "esau",
    "esther",
    "eve",
    "ezekiel",
    "ezra",
    "gideon",
    "habakkuk",
    "haggai",
    "ham",
    "hezekiah",
    "isaac",
    "isaiah",
    "jacob",
    "japheth",
    "jeremiah",
    "jezebel",
    "job",
    "joel",
    "jonah",
    "jonathan",
    "joshua",
    "judah",
    "leah",
    "lot",
    "malachi",
    "melchizedek",
    "meshach",
    "miriam",
    "moses",
    "naomi",
    "nahum",
    "nehemiah",
    "noah",
    "obadiah",
    "rachel",
    "rebekah",
    "ruth",
    "samson",
    "samuel",
    "sarah",
    "saul",
    "seth",
    "shadrach",
    "shem",
    "solomon",
    "tamar",
    "zechariah",
    "zephaniah",
}

# ============================================================
# OT BOOK AUTHORS
# ============================================================

OT_BOOK_AUTHORS = {
    "amos",
    "chronicles",
    "daniel",
    "ecclesiastes",
    "esther",
    "ezekiel",
    "ezra",
    "habakkuk",
    "haggai",
    "hosea",
    "isaiah",
    "jeremiah",
    "job",
    "joel",
    "jonah",
    "joshua",
    "judges",
    "kings",
    "lamentations",
    "leviticus",
    "malachi",
    "micah",
    "nahum",
    "nehemiah",
    "numbers",
    "obadiah",
    "proverbs",
    "psalms",
    "ruth",
    "samuel",
    "song of solomon",
    "zechariah",
    "zephaniah",
}

# ============================================================
# NEW TESTAMENT CHARACTERS
# ============================================================

NEW_TESTAMENT_CHARACTERS = {
    "andrew",
    "bartholomew",
    "barnabas",
    "caesar augustus",
    "christ",
    "cornelius",
    "gabriel",
    "herod",
    "herodias",
    "immanuel",
    "james",
    "james son of alphaeus",
    "jesus",
    "john",
    "john the baptist",
    "joseph",
    "judas iscariot",
    "lazarus",
    "levi",
    "luke",
    "mark",
    "martha",
    "mary",
    "mary magdalene",
    "matthew",
    "michael",
    "nicodemus",
    "paul",
    "peter",
    "philip",
    "pontius pilate",
    "quirius",
    "sapphira",
    "saul",
    "silas",
    "simon peter",
    "simon the zealot",
    "stephen",
    "thaddaeus",
    "thomas",
    "titus",
    "timothy",
    "zacchaeus",
}

# ============================================================
# NT BOOK AUTHORS
# ============================================================

NT_BOOK_AUTHORS = {
    "john",
    "jude",
    "james",
    "luke",
    "mark",
    "matthew",
    "paul",
    "peter",
}

# ============================================================
# BIBLICAL NAME VARIANTS / TITLES
# ============================================================

BIBLICAL_NAME_VARIANTS = {
    "god",
    "holy spirit",
    "immanuel",
    "jehovah",
    "lord",
    "messiah",
    "rabbi",
    "son of god",
    "son of man",
    "spirit of god",
    "the christ",
    "the holy spirit",
    "the messiah",
    "the prophet",
    "the teacher",
    "yahweh",
}

# ============================================================
# COMBINED BIBLICAL CHARACTERS (EXPORT)
# ============================================================

BIBLICAL_CHARACTERS = {
    name.lower()
    for name in (
        list(OLD_TESTAMENT_CHARACTERS)
        + list(NEW_TESTAMENT_CHARACTERS)
        + list(BIBLICAL_NAME_VARIANTS)
        + list(OT_BOOK_AUTHORS)
        + list(NT_BOOK_AUTHORS)
    )
}

# ============================================================
# REDEMPTION ABBREVIATIONS (Sets, Keywords, Meta)
# ============================================================

REDEMPTION_ABBREVIATIONS = {
    # Sets
    "iotp", "poc", "loc", "foo", "pri", "roo", "goc", "wom",
    "txp", "txp2", "k", "j", "f", "i", "h", "g", "e", "d", "c", "b", "a",

    # Keywords
    "ge", "ee", "ra", "tcg", "ccg", "lob",

    # Battle terms
    "btn", "cbn", "cbp", "negate", "interrupt",

    # Common shorthand
    "nt", "ot", "sa", "da", "tc", "ec", "gec", "eec",
}

# ============================================================
# EXPORT
# ============================================================

__all__ = [
    "OLD_TESTAMENT_CHARACTERS",
    "NEW_TESTAMENT_CHARACTERS",
    "BIBLICAL_NAME_VARIANTS",
    "OT_BOOK_AUTHORS",
    "NT_BOOK_AUTHORS",
    "BIBLICAL_CHARACTERS",
    "REDEMPTION_ABBREVIATIONS",
]
