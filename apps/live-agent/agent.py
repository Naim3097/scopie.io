"""Scopie Live — AI host A/V transport (LiveKit Agents worker).

Architecture (ARCHITECTURE.md · Scopie Live): the host BRAIN lives behind the
Scopie API — every viewer chat message posted to
POST /v1/live/rooms/:id/chat is answered server-side by the guardrailed
HostBrainService (catalog-grounded, prices templated from the catalog,
answers audited to live_room_events as 'host_answer'). That one brain serves
every transport: the web chat today, and THIS worker, which gives the host a
voice and a face inside the LiveKit room:

    web chat ──> API brain ──> host answer rows ──┐
                                                  ├──> this worker polls the
    room feed <── TTS speech <── AgentSession <───┘    chat feed and SPEAKS
                 (+ HeyGen avatar when configured)     each new host answer

Security invariants — these are the product, do not relax them:
  * Viewer chat is DATA, never instructions. The worker never feeds chat to
    a model; the API brain quarantines it (delimited data payload, price
    fail-safes, allowlisted catalog lookups only).
  * The worker executes nothing: no pins, no carts, no payments. It only
    voices text the API has already produced and audited.
  * The host is always disclosed as AI in the room UI (live_rooms.ai_disclosed).

Env:
  LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET   (required)
  SCOPIE_API_URL                                       (required, e.g. https://api.scopie.io)
  SCOPIE_ROOM_ID                                       (required — the AI room to host)
  OPENAI_API_KEY                                       (required — TTS voice)
  HEYGEN_API_KEY + HEYGEN_AVATAR_ID                    (optional — LiveAvatar face)

Run:  python agent.py connect --room room_<SCOPIE_ROOM_ID>
"""

from __future__ import annotations

import asyncio
import os
import re

import httpx

POLL_SECONDS = 2.5
MAX_BACKOFF_SECONDS = 30.0
GREETING = "Hi hi, welcome in! I'm Scopie, your AI host — ask me anything about today's picks."
# Host price answers already carry the catalog-templated price in their text.
ALREADY_PRICED = re.compile(r"RM\s?\d", re.IGNORECASE)


class HostFeed:
    """Tails the room's chat feed for new HOST answers to speak."""

    def __init__(self, api_url: str, room_id: str) -> None:
        self._base = api_url.rstrip("/")
        self._room_id = room_id
        self._since = "0"

    async def _fetch(self, client: httpx.AsyncClient) -> list[dict]:
        res = await client.get(
            f"{self._base}/v1/live/rooms/{self._room_id}/chat",
            params={"since": self._since},
            timeout=6.0,
        )
        res.raise_for_status()
        messages = res.json().get("messages", [])
        for msg in messages:
            self._since = str(msg.get("id", self._since))
        return messages

    async def prime(self, client: httpx.AsyncClient) -> None:
        """Advance past history so a (re)started worker never replays old lines."""
        await self._fetch(client)

    async def new_host_lines(self, client: httpx.AsyncClient) -> list[str]:
        lines: list[str] = []
        for msg in await self._fetch(client):
            if not msg.get("isHost"):
                continue
            text = str(msg.get("text", "")).strip()
            product = msg.get("product") or None
            # Speak the catalog price exactly once — it comes from the API's
            # catalog snapshot, never generated text.
            if product and not ALREADY_PRICED.search(text):
                text = f"{text} — {product['title']}, R M {product['priceSen'] / 100:.2f}"
            if text:
                lines.append(text)
        return lines


async def entrypoint(ctx) -> None:  # ctx: agents.JobContext
    """LiveKit Agents entrypoint — voices the API brain into the room."""
    from livekit.agents import Agent, AgentSession
    from livekit.plugins import openai as openai_plugin

    api_url = os.environ["SCOPIE_API_URL"]
    room_id = os.environ["SCOPIE_ROOM_ID"]
    feed = HostFeed(api_url, room_id)

    await ctx.connect()

    session = AgentSession(tts=openai_plugin.TTS(voice=os.environ.get("SCOPIE_TTS_VOICE", "shimmer")))

    if os.environ.get("HEYGEN_API_KEY"):
        # Face: HeyGen LiveAvatar joins as the avatar participant and lip-syncs
        # the session's TTS. Swappable for Anam/Tavus/Simli per the blueprint.
        try:
            from livekit.plugins import heygen

            avatar = heygen.AvatarSession(avatar_id=os.environ.get("HEYGEN_AVATAR_ID", "default"))
            await avatar.start(session, room=ctx.room)
        except ImportError:
            print("live-agent: HEYGEN_API_KEY set but livekit-plugins-heygen not installed — voice only.")

    # This agent holds no LLM and takes no instructions from the room: it is
    # a mouth for text the API brain already produced and audited.
    await session.start(
        Agent(instructions="You voice pre-written host lines verbatim. Never improvise."),
        room=ctx.room,
    )
    await session.say(GREETING)

    failures = 0
    async with httpx.AsyncClient() as client:
        await feed.prime(client)
        while True:
            try:
                for line in await feed.new_host_lines(client):
                    await session.say(line)
                failures = 0
            except Exception as err:  # noqa: BLE001 — a feed blip must not kill the show
                failures += 1
                print(f"live-agent: feed poll failed x{failures} ({err}); backing off")
            await asyncio.sleep(min(POLL_SECONDS * (2 ** min(failures, 4)), MAX_BACKOFF_SECONDS) if failures else POLL_SECONDS)


def main() -> None:
    if not os.environ.get("LIVEKIT_URL"):
        print("live-agent: LIVEKIT_URL not set — scaffold check OK, nothing to run.")
        print("live-agent: the host brain itself is live in the API (chat any AI room).")
        return
    from livekit import agents

    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))


if __name__ == "__main__":
    main()
