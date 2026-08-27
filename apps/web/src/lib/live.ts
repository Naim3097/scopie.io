"use client";

/**
 * LiveKit connection helpers — dynamic imports keep the SDK out of the
 * initial bundle (it only loads when a real room actually connects).
 */

export interface LiveConnection {
  disconnect: () => void;
}

export interface ViewerConnection extends LiveConnection {
  /** Drives the hidden remote-audio elements. Call with false INSIDE a tap gesture to unmute. */
  setMuted: (muted: boolean) => void;
}

export interface ViewerOptions {
  /** Initial mute state for remote audio (match the page's mute button). */
  muted: boolean;
  /** Fires when the first remote VIDEO track attaches — the no-track watchdog listens for this. */
  onVideoTrack?: () => void;
}

/** Viewer: subscribe-only; remote video attaches to the given element. */
export async function connectViewer(
  url: string,
  token: string,
  videoEl: HTMLVideoElement,
  opts: ViewerOptions,
): Promise<ViewerConnection> {
  const { Room, RoomEvent, Track } = await import("livekit-client");
  const room = new Room();
  const audioEls: HTMLMediaElement[] = [];
  let desiredMuted = opts.muted;
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video) {
      track.attach(videoEl);
      opts.onVideoTrack?.();
    } else if (track.kind === Track.Kind.Audio) {
      const el = track.attach();
      el.muted = desiredMuted;
      el.style.display = "none";
      document.body.appendChild(el);
      audioEls.push(el);
    }
  });
  await room.connect(url, token);
  return {
    setMuted: (muted: boolean) => {
      desiredMuted = muted;
      for (const el of audioEls) {
        el.muted = muted;
        if (!muted) void el.play().catch(() => undefined);
      }
      // Inside a tap gesture this unlocks the browser's audio pipeline.
      if (!muted) void room.startAudio().catch(() => undefined);
    },
    disconnect: () => {
      void room.disconnect();
      audioEls.forEach((el) => el.remove());
    },
  };
}

/** Publisher: camera + mic; local preview attaches to the given element. */
export async function connectPublisher(
  url: string,
  token: string,
  previewEl: HTMLVideoElement,
): Promise<LiveConnection> {
  const { Room, Track } = await import("livekit-client");
  const room = new Room();
  await room.connect(url, token);
  await room.localParticipant.setCameraEnabled(true);
  await room.localParticipant.setMicrophoneEnabled(true);
  const camPub = room.localParticipant.getTrackPublications().find((p) => p.kind === Track.Kind.Video);
  camPub?.track?.attach(previewEl);
  return { disconnect: () => void room.disconnect() };
}
