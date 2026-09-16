import os
import requests
import re
from groq import Groq
from dotenv import load_dotenv
from scripts.core.knowledge_manager import KnowledgeManager

load_dotenv()

def ausfuehren():
    print("🔄 [Schritt 1] Starte isolierten Direkt-Test...")
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    km = KnowledgeManager()
    
    question = "Hero rescues --> Antiochus' Army blocks and activated Abom --> Hero plays teaching in parables to negate Abom --> In regular inish, Antiochus' Army plays Allowed to be trampled. Does Abom reactivate. And if so, does the special inish off it or the enhancement come first?"
    
    # 1. Karten deterministisch laden
    card_matches = km.find_cards_in_text(question)
    
    # 2. HuggingFace Vektorsuche mit GARANTIERT korrekter URL ausführen
    print("🔄 [Schritt 2] Rufe HuggingFace-Embeddings ab...")
    hf_url = f"https://huggingface.co"
    headers = {"Authorization": f"Bearer {os.getenv('HF_API_KEY')}"}
    response = requests.post(hf_url, headers=headers, json={"inputs": [f"query: {question}"]})
    
    if response.status_code != 200:
        print(f"❌ HuggingFace Fehler: {response.status_code}")
        return
        
    vector = response.json()
    
    # 3. Pinecone Kontext abfragen
    print("🔄 [Schritt 3] Frage Pinecone-Datenbank ab...")
    from pinecone import Pinecone
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    results = index.query(vector=vector, top_k=2, include_metadata=True, filter={"source": "discord"})
    
    context_parts = [f"SOURCE: Discord Ruling\nCONTENT: {match['metadata']['text']}" for match in results['matches']]
    discord_context = "\n\n---\n\n".join(context_parts) if context_parts else "No rulings."
    
    # 4. Umfassenden Regel-Kontext bauen
    research_keywords = ["Negate", "Reactivate", "Inish", "Enhancement"]
    layered_context = km.get_comprehensive_context(question, research_keywords, card_matches)
    
    with open(os.path.join("scripts", "prompts", "judge_system_prompt.txt"), "r", encoding="utf-8") as f:
        system_prompt = f.read()
        
    messages = [
        {"role": "user", "content": f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\nCONTEXT:\n{layered_context}\n\nDISCORD:\n{discord_context}\n\nQUESTION: {question}"}
    ]
    
    # 5. Groq mit dem Qwen-Modell und striktem Output-Limit anfunken
    print("🔄 [Schritt 4] Sende Payload an Qwen-Modell (Groq)...")
    try:
        completion = client.chat.completions.create(
            model="qwen/qwen3.6-27b",
            messages=messages,
            temperature=0.0,
            max_tokens=500  # Bleibt sicher unter dem 1.000er OTPM Limit von Qwen!
        )
        print("\n✅ ANTWORT VOM KI-JUDGE EMPFANGEN:")
        print("=" * 60)
        print(completion.choices[0].message.content)
        print("=" * 60)
    except Exception as e:
        print(f"❌ Groq-Fehler: {e}")

if __name__ == "__main__":
    ausfuehren()
