# Scopie Live agent

> **Status: scaffold.** The entrypoint intentionally raises
> `NotImplementedError` once `LIVEKIT_URL` is set — the AgentSession wiring
> is the next-phase task. Provider keys listed below are what it WILL
> require once wired; nothing reads them yet.

Python worker (LiveKit Agents) that runs the AI host: consumes viewer chat,
answers selected questions, and drives the photoreal avatar into the live room.

## Why Python when everything else is TypeScript?

LiveKit Agents is Python-first, and every avatar vendor (HeyGen LiveAvatar,
Anam, Tavus, Simli) ships its plugin for the Python runtime. This service is a
deliberate island: it talks to the rest of Scopie only through the LiveKit room
and the Commerce MCP server.

## Setup

```bash
cd apps/live-agent
uv sync          # or: pip install -e .
uv run agent.py
```

Requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, plus provider
keys (`HEYGEN_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`,
`ANTHROPIC_API_KEY`) — see the root `.env.example`.

## The one-session economics

One agent + one avatar session serves ANY audience size: the avatar publishes
a single A/V track into the LiveKit room; big audiences are fanned out via
Egress → Cloudflare Stream HLS. Avatar cost is fixed per show (~$6–12/hour),
delivery scales per viewer (~$0.06/viewer-hour).
