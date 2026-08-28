"use client";

import { useEffect, useRef, useState } from "react";
import type { Video } from "@scopie/core";
import { Sheet } from "@/components/Sheet";
import { addComment, commentsFor, type VideoComment } from "@/lib/social";
import { track } from "@/lib/events";

/** Comments over the feed — the video keeps playing underneath. */
export function CommentsSheet({ video, onClose }: { video: Video; onClose: () => void }) {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setComments(commentsFor(video.id));
  }, [video.id]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [comments.length]);

  const post = () => {
    const added = addComment(video.id, draft, "you");
    if (!added) return;
    setDraft("");
    setComments((c) => [...c, added]);
    track({ type: "video.comment", subjectId: video.id, surface: "feed" });
  };

  const total = (video.stats.comments ?? 0) + comments.filter((c) => c.mine).length;

  return (
    <Sheet label={`Comments on @${video.creatorId}'s video`} onClose={onClose}>
      <div className="sheet-body">
        <h2 style={{ fontSize: 17, marginBottom: 10 }}>
          Comments <span style={{ color: "var(--muted)", fontWeight: 600 }}>· {total}</span>
        </h2>
        <div className="comment-list" ref={listRef} tabIndex={0} aria-label="Comment list">
          {comments.map((c) => (
            <div key={c.id} className="comment-row">
              <span className="comment-avatar" aria-hidden="true">
                {c.from.charAt(0).toUpperCase()}
              </span>
              <div className="grow">
                <b>{c.mine ? "You" : c.from}</b>
                <div className="comment-text">{c.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="chatrow" style={{ marginTop: 12 }}>
          <input
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") post();
            }}
            placeholder="Add a comment…"
            aria-label="Add a comment"
          />
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={post}>
            Post
          </button>
        </div>
        <p className="sheet-note">Comments live on this device for now — they sync when accounts launch.</p>
      </div>
    </Sheet>
  );
}
