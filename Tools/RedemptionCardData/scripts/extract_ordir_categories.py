import fitz  # PyMuPDF
from pathlib import Path

# === CONFIG ===
PDF_PATH = Path("../data/ORDIR.pdf")
OUTPUT_FILE = Path("../mappings/ordir_categories.py")

# === PARAMETERS ===
HEADING_SIZE_MAIN = 30
HEADING_SIZE_GLOSSARY = 14
HEADING_FONT = "Arial"

# === EXTRACT HEADINGS ===
def extract_ordir_headings(pdf_path, heading_size1, heading_size2, heading_font):
    doc = fitz.open(pdf_path)
    extracted_titles = set()
    tracking = False
    use_heading_size2 = False

    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            for line in block.get("lines", []):
                line_text = ""
                line_font = None
                line_size = None

                for span in line.get("spans", []):
                    text = span["text"].strip()
                    font_size = round(span["size"])
                    font_name = span["font"]

                    if line_text:
                        line_text += " "
                    line_text += text

                    if line_font is None:
                        line_font = font_name
                        line_size = font_size
                    elif line_font != font_name or line_size != font_size:
                        line_font = None

                if line_text == "Special Ability Structure" and font_size == 36 and "Arial" in font_name:
                    tracking = True
                    use_heading_size2 = False

                if line_text == "Glossary of Terms" and font_size == 36 and "Arial" in font_name:
                    use_heading_size2 = True
                    tracking = True
                    continue

                if tracking:
                    font_matches = heading_font.lower() in (line_font or "").lower()
                    if not use_heading_size2:
                        if font_size == heading_size1 and font_matches:
                            extracted_titles.add(line_text)
                    else:
                        if font_size == heading_size2 and font_matches:
                            extracted_titles.add(line_text)

    valid_titles = [title for title in extracted_titles if 1 <= len(title) <= 100]
    return sorted(valid_titles)

# === WRITE TO PY FILE ===
def write_categories_py(titles, output_path):
    with output_path.open("w", encoding="utf-8") as f:
        f.write("ORDIR_CATEGORIES = [\n")
        for title in titles:
            f.write(f'    "{title}",\n')
        f.write("]\n")
    print(f"✅ Kategorien geschrieben nach: {output_path}")

# === MAIN ===
if __name__ == "__main__":
    categories = extract_ordir_headings(PDF_PATH, HEADING_SIZE_MAIN, HEADING_SIZE_GLOSSARY, HEADING_FONT)
    write_categories_py(categories, OUTPUT_FILE)
