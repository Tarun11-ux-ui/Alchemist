from __future__ import annotations

import json
import os
from typing import Any

try:
    from openai import OpenAI, OpenAIError
except ImportError:
    OpenAI = None

    class OpenAIError(Exception):
        pass


_client: Any | None = None


def _get_client() -> Any | None:
    global _client

    if OpenAI is None:
        return None

    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        return None

    if _client is None:
        _client = OpenAI(api_key="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")
    return _client


def _summarize_context(context: str) -> str:
    compact = " ".join(context.split()).strip()
    if not compact:
        return "No input context was provided."
    if len(compact) <= 180:
        return compact
    return f"{compact[:177]}..."


def _local_demo_response(prompt: str, context: str, reason: str) -> str:
    prompt_text = prompt.strip() or "Summarize the input."
    summary = _summarize_context(context)
    lower_prompt = prompt_text.lower()

    if "json" in lower_prompt:
        return json.dumps(
            {
                "mode": "local-demo",
                "reason": reason,
                "prompt": prompt_text,
                "context_summary": summary,
            },
            indent=2,
        )

    if "summarize" in lower_prompt or "summary" in lower_prompt:
        return f"Local demo summary: {summary} (Prompt: {prompt_text})"

    return (
        "[LOCAL AI DEMO MODE]\n"
        f"Reason: {reason}\n"
        f"Prompt: {prompt_text}\n"
        f"Context summary: {summary}"
    )


def call_ai(prompt: str, context: str = "") -> str:
    client = _get_client()

    if client is None:
        reason = (
            "OPENAI_API_KEY is not configured"
            if not os.getenv("OPENAI_API_KEY", "").strip()
            else "OpenAI client is unavailable"
        )
        return _local_demo_response(prompt, context, reason)

    messages = []
    if context:
        messages.append({"role": "user", "content": f"Context:\n{context}"})
    messages.append({"role": "user", "content": prompt})

    try:
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=512,
            temperature=0.7,
        )
        return (resp.choices[0].message.content or "").strip()
    except OpenAIError as exc:
        return _local_demo_response(prompt, context, f"OpenAI request failed: {exc}")


if __name__ == "__main__":
    print(call_ai("Summarize the input in one sentence.", '{"message": "hello"}'))
