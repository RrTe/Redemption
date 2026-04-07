import sys
import os

# Add project root to sys.path so 'scripts' can be imported as a package
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.core.rag_engine import RAGEngine

def main():
    print("--- Redemption AI Judge: Local RAG Test Tool ---")
    print("Initializing Engine (Pinecone & Groq)...")
    
    try:
        engine = RAGEngine()
    except Exception as e:
        print(f"Failed to initialize engine: {e}")
        return

    print("Engine Ready.\n")

    while True:
        try:
            question = input("\nEnter your rule question (or 'exit' to quit): ")
            if question.lower() in ['exit', 'quit', 'e']:
                break
            
            print("\nSearching knowledge base (Pinecone)...")
            
            # Debug: Show retrieved matches (Added for Phase 3 Verification)
            matches = engine.retrieve_context(question, top_k=5)
            if not matches:
                print("[DEBUG] No matches found in Pinecone.")
            else:
                print(f"[DEBUG] Found {len(matches)} matches:")
                for i, meta in enumerate(matches):
                    source = meta.get('source', 'Unknown')
                    text_snippet = meta.get('text', '')[:200].replace('\n', ' ')
                    print(f"  {i+1}. Source: {source}")
                    print(f"     Content: {text_snippet}...\n")
            
            print("==================================================")
            print("JUDGE ANSWER:")
            print("==================================================")
            
            # Use the actual engine to generate response
            answer = engine.ask_judge(question)
            print(answer)
            print("==================================================\n")
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
