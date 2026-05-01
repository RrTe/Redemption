# Redemption RuleBot

A multi-functional Discord bot for the Redemption Trading Card Game (TCG). The bot serves both as a classic reference tool for official rulebooks and as an interactive, AI-powered assistant designed to help answer ruling questions based on official documents.

## Features

### 1. Classic Rule Tools (Core Features)
- **Interactive Rule Lookup (`/lookup`)**: A slash command with autocomplete functionality that allows users to quickly pull up specific sections from the official rule PDFs (REG, Rulebook, ORDIR).
- **Live PDF Search (`!search`)**: A classic prefix command that scans PDFs in real-time and extracts exact sections (including bullet points) based on font sizes and formatting.
- **Factual Database Search (`/find`)**: Searches directly through a database of past Discord rulings and rule snippets without any AI interpretation.
- **Persistent Pagination**: Long rule texts or rulings are intelligently divided into pages. Users can navigate through them using Discord buttons (◀️/▶️). Pagination progress is seamlessly saved in the background.

### 2. The AI Judge
Utilizes an advanced **RAG (Retrieval-Augmented Generation) architecture** combined with Large Language Models (LLMs) to answer rule questions deductively (`/ruling`).
- **Deterministic Selection Gate**: Accurately identifies the exact card version the user is referring to before loading any rules, preventing AI "hallucinations" and context bloat.
- **Single Ground Truth (Deduplication)**: Prioritizes the Redemption Exegesis Guide (REG) over the general Rulebook and filters out redundant rules to utilize the token limit efficiently.
- **Robust Word-Set Matching**: Reliably finds technical special rules (e.g., "Activate an Artifact") in the PDFs, even when the user's phrasing is imprecise.
- **Official Rulings Precedence**: If a relevant ruling by an official human Judge is found in the Discord database, the AI prioritizes it as the correct answer. The system identifies authoritative rulings through internal metadata tags, ensuring their authority is recognized even though the actual usernames have been anonymized.

### 3. Data Privacy & Integrity
The bot uses a vector database populated with official Discord rulings that have been heavily sanitized.
- **Anonymization Engine**: All Personally Identifiable Information (PII), such as Discord usernames, is stripped from the rulings before they enter the knowledge base.
- **Card Data Preservation**: To prevent the anonymizer from accidentally redacting important game terminology, a verification check ensures that authorized card names and game terms are preserved, maintaining the technical accuracy of the rulings.

## Bot Commands Overview

| Command | Type | Description |
| :--- | :--- | :--- |
| `/ruling` | Slash | Asks the AI Judge a complex ruling question. |
| `/lookup` | Slash | Displays a specific rule section from the documents (with autocomplete). |
| `/find` | Slash | Searches rulings and rules directly (without AI analysis). |
| `!search` | Prefix | Live searches a PDF for a keyword (e.g., `!search REG Abomination`). |
| `!sync` | Prefix | Admin command to synchronize slash commands on the server. |

## Project Structure

- `data/`: Contains the rule PDFs (REG, Rulebook, ORDIR) and the processed `carddata.json`.
- `scripts/core/`: The core logic (RAGEngine, KnowledgeManager, PDF Parser).
- `scripts/prompts/`: The system instructions for the various AI reasoning phases.
- `scripts/utils/`: Helper scripts (e.g., data loaders).
- `src/`: The entry point of the bot (`main.py`) including the Discord command handlers and pagination logic.

## Local Setup

1. Create a virtual environment: `python -m venv .venv`
2. Activate the environment: `.\.venv\Scripts\activate` (Windows)
3. Install dependencies: `pip install -r requirements.txt`
4. Create a `.env` file in the root directory with the following variables:
   - `DISCORD_TOKEN`: Your Discord Bot Token
   - `GROQ_API_KEY` (or other LLM Provider Keys)
   - `PINECONE_API_KEY` & `PINECONE_ENVIRONMENT`
5. Start the bot: `python src/main.py`
