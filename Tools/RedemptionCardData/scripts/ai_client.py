"""LLM Client module for multi-backend AI ability extraction.

Handles HTTP requests, retries, quota management, and conversation message formatting
for Google Gemini, Groq, OpenRouter, and local Ollama backends.
"""

from __future__ import annotations
import json
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Union
import requests

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class QuotaExhaustedError(Exception):
    """Raised when API rate limits or quota wait periods exceed thresholds."""
    pass


def load_env() -> None:
    """Loads configuration variables from local .env file into environment.

    Args:
        None

    Returns:
        None
    """
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, val = line.strip().split("=", 1)
                os.environ[key.strip()] = val.strip()


def query_llm_messages(backend: str, messages: List[Dict[str, str]]) -> str:
    """Sends a chat message list to the specified LLM backend with transient error retry.

    Supports multi-turn conversations for self-correction retries when schema validation fails.

    Args:
        backend: Provider identifier ('openrouter', 'groq', 'gemini', 'ollama').
        messages: List of role-content message dictionaries (e.g. [{'role': 'user', 'content': '...'}]).

    Returns:
        str: Raw JSON string response from the LLM.

    Raises:
        ValueError: If backend is unrecognized or required API keys are missing.
        QuotaExhaustedError: If rate limits or quota caps are permanently exceeded.
    """
    if backend in ("openrouter", "groq"):
        if backend == "openrouter":
            api_key = os.environ.get("OPENROUTER_API_KEY")
            url = "https://openrouter.ai/api/v1/chat/completions"
            model_name = os.environ.get("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
        else:
            api_key = os.environ.get("GROQ_API_KEY")
            url = "https://api.groq.com/openai/v1/chat/completions"
            model_name = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")

        if not api_key:
            raise ValueError(f"{backend.upper()}_API_KEY not configured in .env")

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        body = {
            "model": model_name,
            "messages": messages,
            "response_format": {"type": "json_object"}
        }

        for attempt in range(5):
            resp = requests.post(url, headers=headers, json=body, timeout=75)
            if resp.status_code in (500, 502, 503, 504):
                print(f" [{resp.status_code}] Transient server error, waiting 3s...", flush=True)
                time.sleep(3)
                continue
            if resp.status_code == 429:
                err_text = ""
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("error", {}).get("message", "")
                    if "free-models-per-day" in err_msg or "daily" in err_msg.lower():
                        raise QuotaExhaustedError(f"OpenRouter tägliches Free-Tier-Limit (50 Requests/Tag) erreicht: {err_msg}")
                    err_text = f" ({err_msg})"
                except (ValueError, KeyError):
                    pass
                wait_seconds = max(int(resp.headers.get("retry-after", "25")), 25)
                if wait_seconds > 65:
                    raise QuotaExhaustedError(f"{backend.capitalize()} quota exhausted ({wait_seconds}s wait).")
                print(f" [429] Rate limit hit{err_text}. Waiting {wait_seconds}s before retry ({attempt + 1}/5)...", flush=True)
                time.sleep(wait_seconds)
                continue

            resp.raise_for_status()
            res_json = resp.json()
            if "choices" in res_json and res_json["choices"]:
                return res_json["choices"][0]["message"]["content"]
            if "error" in res_json:
                print(f" [{backend.capitalize()} error] {res_json['error'].get('message')}, waiting 3s...", flush=True)
                time.sleep(3)
                continue
        raise QuotaExhaustedError(f"{backend.capitalize()} rate limit exceeded after retries.")

    if backend == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not configured in .env")
        model_name = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        # Combine conversation turns into Gemini contents
        contents = []
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        body = {
            "contents": contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "thinkingConfig": {"thinkingBudget": 0}
            }
        }
        for _ in range(3):
            resp = requests.post(url, json=body, timeout=60)
            if resp.status_code in (500, 502, 503, 504):
                print(f" [{resp.status_code}] Transient server error, waiting 3s...", flush=True)
                time.sleep(3)
                continue
            if resp.status_code == 429:
                wait_seconds = int(resp.headers.get("retry-after", "15"))
                if wait_seconds > 30:
                    raise QuotaExhaustedError(f"Gemini quota exhausted ({wait_seconds}s wait).")
                print(f" [429] Waiting {wait_seconds}s before retry...", flush=True)
                time.sleep(wait_seconds)
                continue
            resp.raise_for_status()
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        raise QuotaExhaustedError("Gemini rate limit or server error exceeded after retries.")

    if backend == "ollama":
        host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        model = os.environ.get("OLLAMA_MODEL", "llama3")
        last_prompt = messages[-1]["content"] if messages else ""
        resp = requests.post(
            f"{host}/api/generate",
            json={"model": model, "prompt": last_prompt, "format": "json", "stream": False},
            timeout=90
        )
        resp.raise_for_status()
        return resp.json()["response"]

    raise ValueError(f"Unsupported backend: {backend}")


def query_llm(backend: str, prompt: str) -> str:
    """Convenience wrapper for single-turn prompt requests.

    Args:
        backend: Provider identifier ('openrouter', 'groq', 'gemini', 'ollama').
        prompt: Single instruction prompt string.

    Returns:
        str: Raw JSON string response from the LLM.
    """
    return query_llm_messages(backend, [{"role": "user", "content": prompt}])
