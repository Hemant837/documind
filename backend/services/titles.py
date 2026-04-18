"""
Generates a short conversation title from the first user question.

Why a separate module?
  Keeps title logic isolated and easy to test or swap out.
  The LLM call is intentionally cheap — gpt-4o-mini, max 10 tokens,
  no context needed. We only call this once per session (first message).

How it's called:
  After the first assistant response is saved, ask_question_stream()
  checks if the session has a title. If not, it generates one and
  saves it via history.update_session_title().
"""

from langchain_openai import ChatOpenAI

# Separate LLM instance with very low max_tokens — title generation
# doesn't need a long response and we don't want to waste tokens.
_title_llm = ChatOpenAI(model="gpt-4o-mini", max_tokens=10, temperature=0.3)

TITLE_PROMPT = """\
Generate a short title (3-5 words) for a conversation that starts with this question.
Reply with ONLY the title, no punctuation, no quotes, no explanation.

Question: {question}
"""


async def generate_title(question: str) -> str:
    """
    Generate a 3-5 word title for a conversation given its first question.
    Falls back to a truncated version of the question if the LLM call fails.
    """
    try:
        response = await _title_llm.ainvoke(
            TITLE_PROMPT.format(question=question[:300])  # cap input length
        )
        title = response.content.strip()
        # Safety cap — if the model returns more than expected, truncate
        return title[:100]
    except Exception:
        # Fallback: use first 50 chars of the question
        return question[:50].rstrip() + ("…" if len(question) > 50 else "")