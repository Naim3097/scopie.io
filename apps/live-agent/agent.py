"""Scopie Live host brain (scaffold).

Architecture (see ARCHITECTURE.md · Layer: Scopie Live):

    viewer chat ──> question ranker ──> LLM brain ──> TTS ──> avatar plugin
                     (dedupe/filter)     (catalog     (BM/EN)  (HeyGen LiveAvatar
                                          via MCP)              over LiveKit)

Security invariants — these are the product, do not relax them:
  * Viewer chat is DATA, never instructions. It is quarantined into a
    structured "questions" list; raw chat text is never concatenated into
    the system prompt.
  * The brain may only call allowlisted tools (the Scopie Commerce MCP
    server); every tool call is re-validated server-side by the API.
  * Prices and deals come from the catalog, never from generated text.
  * The host is always disclosed as AI in the room UI.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class ViewerQuestion:
    """A chat message promoted to an answerable question by the ranker."""

    question_id: str
    user: str
    text: str
    score: float


class QuestionRanker:
    """Turns the chat firehose into a short queue the host can answer.

    MVP heuristic: dedupe near-identical questions, drop non-questions and
    unsafe content, prioritise purchase-intent ("how much", "what size",
    "show in <colour>"). Phase 2: a small classifier model.
    """

    PRIORITY_MARKERS = ("how much", "berapa", "size", "saiz", "colour", "color", "warna", "ship", "pos")

    def rank(self, messages: list[tuple[str, str, str]]) -> list[ViewerQuestion]:
        questions: list[ViewerQuestion] = []
        seen: set[str] = set()
        for msg_id, user, text in messages:
            normalized = " ".join(text.lower().split())
            if normalized in seen or len(normalized) < 3:
                continue
            seen.add(normalized)
            score = 1.0
            if any(marker in normalized for marker in self.PRIORITY_MARKERS):
                score += 2.0
            if "?" in text:
                score += 0.5
            questions.append(ViewerQuestion(msg_id, user, text, score))
        return sorted(questions, key=lambda q: q.score, reverse=True)[:5]


async def entrypoint() -> None:
    """LiveKit Agents entrypoint (wire up when LIVEKIT_* env is configured).

    Production wiring, per livekit-agents docs:
      1. AgentSession with STT (Deepgram Nova-3, ms+en), LLM (Claude/Gemini
         Flash-class), TTS (ElevenLabs Malay voice).
      2. Avatar plugin (HeyGen LiveAvatar) joins as the avatar worker and
         publishes the synced A/V track; call wait_for_join() before speaking.
      3. Chat arrives via the room's data channel -> QuestionRanker.
      4. Tool calls go to the Scopie Commerce MCP server (packages/mcp);
         structured HostCommands (pin_product, start_flash_deal) are emitted
         as data messages, and the API re-validates each one.
    """
    if not os.environ.get("LIVEKIT_URL"):
        print("live-agent: LIVEKIT_URL not set — scaffold check OK, nothing to run.")
        return
    raise NotImplementedError("wire AgentSession here (see docstring)")


if __name__ == "__main__":
    import asyncio

    asyncio.run(entrypoint())
