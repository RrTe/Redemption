import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


def run_basic_test():
    print("🔄 Starte minimalen Groq-API Test...")

    client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    # Wir stellen eine ganz simple Frage und geben dem Modell viel Platz (max_tokens=1000)
    # Wichtig: Wir nutzen KEINE versteckten Parameter, um die rohe Wahrheit zu sehen.
    messages = [
        {
            "role": "user",
            "content": "Please reply with exactly the word 'SUCCESS' and absolutely nothing else.",
        }
    ]

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=messages,
            temperature=0.0,
            max_tokens=1000,
        )

        print("\n🟢 API-AUFRUF ERFOLGREICH!")
        print("=" * 60)
        print("1. Rohes Completion-Objekt:")
        print(completion)
        print("-" * 40)

        # Wir lesen den Inhalt direkt aus
        content = completion.choices[0].message.content
        print(f"2. Ausgelesener Inhalt (.content): '{content}'")

        # Wir prüfen, ob Groq herstellerspezifische Zusatzfelder mitsendet
        message_dict = completion.choices[0].message.__dict__
        print(f"3. Alle Felder in der Nachricht: {list(message_dict.keys())}")

        # Falls es ein spezielles Reasoning-Feld gibt, geben wir es aus
        if "reasoning_content" in message_dict:
            print(
                f"4. Reasoning Content gefunden: '{message_dict['reasoning_content']}'"
            )
        elif hasattr(completion.choices[0].message, "reasoning"):
            print(
                f"4. Reasoning Attribut gefunden: '{completion.choices[0].message.reasoning}'"
            )

        print("=" * 60)

    except Exception as e:
        print(f"❌ API-Fehler aufgetreten: {e}")


if __name__ == "__main__":
    run_basic_test()
