import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

# Wir funken direkt den Chat-Endpunkt anstelle der Modellliste an
url = "https://groq.com"

headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

# Wir senden eine minimale Testfrage exakt an dein Selector-Modell
payload = {
    "model": "openai/gpt-oss-20b",
    "messages": [{"role": "user", "content": "Ping"}],
    "temperature": 0.0,
}

print("Sende Test-Anfrage an openai/gpt-oss-20b...")
response = requests.post(url, headers=headers, json=payload)

print("\n--- ROHE ANTWORT VOM SERVER ---")
print(response.status_code)
print(response.text)
