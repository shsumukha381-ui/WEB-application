"""
Chatbot router — proxies user messages to Groq AI (Llama models).
No keyword matching. Every question goes directly to Groq for
intelligent, context-aware answers.
"""
import os
import re
from dotenv import load_dotenv
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# ── Groq Config ──────────────────────────────────────────────────
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "qwen/qwen3.6-27b"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# System prompt that gives the AI financial-advisor context
SYSTEM_PROMPT = (
    "You are WealthOne AI — a friendly, knowledgeable financial advisor chatbot "
    "embedded inside the WealthOne portfolio dashboard. You can answer ANY question "
    "the user asks — finance, investments, mutual funds, stocks, taxes, budgeting, "
    "or even general knowledge. Be concise but thorough. Use simple language. "
    "When discussing Indian finance, use ₹ and Indian conventions. "
    "If the user asks about their portfolio, remind them you can see the dashboard "
    "data they've linked. Always be helpful, accurate, and never refuse to answer."
)


# ── Request / Response schemas ─────────────────────────────────────
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    text: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


class ChatResponse(BaseModel):
    reply: str


# ── Endpoint ───────────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
async def chat_with_groq(payload: ChatRequest):
    """
    Send a message to Groq AI and return the response.
    Accepts conversation history for multi-turn context.
    """
    if not GROQ_API_KEY:
        raise HTTPException(500, "Groq API key not configured")

    # Build the OpenAI-compatible messages array
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add conversation history
    if payload.history:
        for msg in payload.history:
            # Map "model" role to "assistant" for OpenAI compatibility
            role = "assistant" if msg.role == "model" else msg.role
            messages.append({"role": role, "content": msg.text})

    # Add current user message
    messages.append({"role": "user", "content": payload.message})

    request_body = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "top_p": 0.95,
        "max_tokens": 2048,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GROQ_URL,
                json=request_body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                },
            )

        if response.status_code != 200:
            error_detail = response.json().get("error", {}).get("message", response.text)
            raise HTTPException(
                502,
                f"Groq API error: {error_detail}",
            )

        data = response.json()

        # Extract the text from Groq's response (OpenAI format)
        choices = data.get("choices", [])
        if not choices:
            raise HTTPException(502, "Groq returned no response")

        reply_text = choices[0].get("message", {}).get("content", "").strip()

        # Strip <think>...</think> reasoning blocks (Qwen models include these)
        reply_text = re.sub(r"<think>[\s\S]*?</think>", "", reply_text).strip()

        if not reply_text:
            reply_text = "I'm sorry, I couldn't generate a response. Please try again."

        return ChatResponse(reply=reply_text)

    except httpx.TimeoutException:
        raise HTTPException(504, "Groq API timed out. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to reach Groq AI: {str(e)}")
