import os
import sys
import asyncio
from dotenv import load_dotenv

# Pfad-Fix aus Ihrer main.py übernehmen
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

load_dotenv()

# Die originale PaginatedText-Klasse aus Ihrer main.py kopiert,
# um die exakte Seitenaufteilung von Discord lokal zu prüfen.
class PaginatedText:
    def __init__(self, text, per_page=1000):
        self.text = text
        self.per_page = per_page
        self.pages = [text[i:i + per_page] for i in range(0, len(text), per_page)]
        self.total_pages = len(self.pages)

async def test_ruling_flow():
    print("🔄 [Schritt 1] Initialisiere RAGEngine...")
    from scripts.core.rag_engine import RAGEngine
    
    try:
        rag_engine = RAGEngine()
        print("✅ RAGEngine erfolgreich gestartet.")
    except Exception as e:
        print(f"❌ Fehler bei der Initialisierung der Engine: {e}")
        return

    # --- HIER DEINE TEST-FRAGE EINTRAGEN ---
    test_question = "Kann ich den Effekt von Abomination im gegnerischen Zug aktivieren?"
    
    print(f"\n💬 [Schritt 2] Sende 'ruling question' an die Engine...")
    print(f"   Frage: \"{test_question}\"")
    print("   (Die KI analysiert nun Kontext, Regeln und historische Discord-Rulings...)\n")
    
    try:
        # Simuliert das 'await asyncio.to_thread(rag_engine.ask_judge, question)' aus der main.py
        answer = await asyncio.to_thread(rag_engine.ask_judge, test_question)
        
        print("✅ Antwort von der KI empfangen!")
        print("=" * 60)
        
        # --- Schitt 3: Simulation der Discord-Embed-Formatierung ---
        paginated = PaginatedText(answer)
        
        print(f"📊 DISCORD EMBED SIMULATION ({paginated.total_pages} Seite/n generiert):")
        
        for index, page_content in enumerate(paginated.pages):
            print(f"\n--- [ EMBDED PAGE {index + 1} / {paginated.total_pages} ] ---")
            print(f"Title: AI Judge Ruling")
            print(f"Color: Gold (0xFFD700)")
            print(f"Description:\n{page_content}")
            print(f"Footer: Page {index + 1}/{paginated.total_pages}")
            print("-" * 40)
            
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Fehler während des ask_judge-Ablaufs: {e}")

if __name__ == "__main__":
    # Startet den asynchronen Ablauf lokal
    asyncio.run(test_ruling_flow())
