# Scopie Live agent

> **Status: transport layer, ready for credentials.** The host BRAIN is live
> in the API today — chat in any AI-hosted room and it answers (scripted
> zero-key, LLM with `OPENAI_API_KEY`). This worker is the room-side
> transport: it polls the room's chat feed and SPEAKS each new host answer
> into the LiveKit room (TTS now, HeyGen LiveAvatar face when its key is
> set). It has not run against live credentials yet — first LiveKit + HeyGen
> session is the activation task.

## Where the brain lives (and why)

`apps/api/src/live/host-brain.service.ts` answers every viewer message posted
to `POST /v1/live/rooms/:id/chat`. Putting the brain behind the API keeps one
guardrailed implementation for every surface (web chat, this worker), lets
the API re-validate and audit every answer (`live_room_events` ·
`host_answer`), and means the AI host works on the zero-infra demo site.
This worker deliberately contains no model calls: it voices text the API has
already produced and audited.

## Why Python when everything else is TypeScript?

LiveKit Agents is Python-first, and every avatar vendor (HeyGen LiveAvatar,
Anam, Tavus, Simli) ships its plugin for the Python runtime. This service is a
deliberate island: it talks to the rest of Scopie only through the LiveKit
room and the public chat API.

## Setup

```bash
cd apps/live-agent
uv sync          # or: pip install -e .
uv run agent.py connect --room room_<SCOPIE_ROOM_ID>
```

Requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
`SCOPIE_API_URL`, `SCOPIE_ROOM_ID`, `OPENAI_API_KEY` (TTS voice); optional
`HEYGEN_API_KEY` + `HEYGEN_AVATAR_ID` for the face. See the root
`.env.example`.

## The one-session economics

One agent + one avatar session serves ANY audience size: the avatar publishes
a single A/V track into the LiveKit room; big audiences are fanned out via
Egress → Cloudflare Stream HLS. Avatar cost is fixed per show (~$6–12/hour),
delivery scales per viewer (~$0.06/viewer-hour).
