import fitz
import json
import os
import re

def extract_sections(pdf_path, heading_size1, heading_size2, heading_font):
    """Reuse logic from main.py to identify headings."""
    try:
        doc = fitz.open(pdf_path)
        extracted_sections = {}
        current_title = None
        current_content = []
        
        tracking = False
        use_heading_size2 = False

        for page in doc:
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                for line in block.get("lines", []):
                    line_text = ""
                    for span in line.get("spans", []):
                        text = span["text"].strip()
                        line_text += text + " "
                    
                    line_text = line_text.strip()
                    if not line_text: continue
                    
                    # Heuristic for fonts from main.py
                    span = line["spans"][0]
                    font_size = round(span["size"])
                    font_name = span["font"]
                    
                    # Logic from main.py triggers
                    if line_text == "Special Ability Structure" and font_size == 36:
                        tracking = True
                        use_heading_size2 = False
                    if line_text == "Glossary of Terms" and font_size == 36:
                        use_heading_size2 = True
                        tracking = True

                    is_heading = False
                    if tracking:
                        font_matches = heading_font.lower() in font_name.lower()
                        if not use_heading_size2:
                            if font_size == heading_size1 and font_matches:
                                is_heading = True
                        else:
                            if font_size == heading_size2 and font_matches:
                                is_heading = True
                    
                    if is_heading:
                        if current_title and current_content:
                            extracted_sections[current_title] = "\n".join(current_content).strip()
                        current_title = line_text
                        current_content = []
                    elif current_title:
                        current_content.append(line_text)
                        
        if current_title and current_content:
            extracted_sections[current_title] = "\n".join(current_content).strip()
            
        return extracted_sections
    except Exception as e:
        print(f"Error: {e}")
        return {}

def main():
    rules_data = {}
    
    # Paths relative to project root
    reg_path = "data/REG.pdf"
    ordir_path = "data/ORDIR.pdf"
    
    if not os.path.exists(reg_path) or not os.path.exists(ordir_path):
        print(f"Error: PDF files not found in data/ subdirectory.")
        return

    # Process REG
    print("Processing REG...")
    reg_sections = extract_sections(reg_path, 30, 14, "Arial")
    rules_data["REG"] = reg_sections
    
    # Process ORDIR
    print("Processing ORDIR...")
    ordir_sections = extract_sections(ordir_path, 30, 14, "Arial")
    rules_data["ORDIR"] = ordir_sections
    
    # Save to JSON
    output_path = "data/rule_sections.json"
    os.makedirs("data", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(rules_data, f, indent=4)
    print(f"Saved {sum(len(v) for v in rules_data.values())} sections to {output_path}")

if __name__ == "__main__":
    main()
