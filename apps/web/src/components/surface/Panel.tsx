"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StrokeIcon } from "@/components/Glyph";

const FOCUSABLE = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * Full-screen overlay surface — the "page that isn't a page". Slides over the
 * feed (which keeps running underneath), closes with the system back gesture,
 * ESC, or the X; exit mirrors entry. One history entry per open session, so
 * switching panel content while open never churns history.
 */
export function Panel({
  title,
  right,
  onClose,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return; // already closing
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onCloseRef.current();
    }, 180);
  }, []);

  // System back closes the panel, not the app. Programmatic closes consume
  // the entry so history stays balanced (same pattern as the sheets).
  useEffect(() => {
    let popped = false;
    window.history.pushState({ scopiePanel: true }, "");
    const onPop = () => {
      popped = true;
      requestClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && (window.history.state as { scopiePanel?: boolean } | null)?.scopiePanel) {
        window.history.back();
      }
    };
  }, [requestClose]);

  // Scroll lock + ESC + focus + Tab trap — aria-modal must be true in fact.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (e.key === "Tab" && ref.current) {
        const focusables = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => !el.hasAttribute("disabled"),
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (active && !ref.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      previous?.focus?.();
    };
  }, [requestClose]);

  return (
    <div
      ref={ref}
      className={`panel${closing ? " closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <div className="panel-head">
        <button className="panel-close" onClick={requestClose} aria-label="Close">
          <StrokeIcon kind="cross" size={17} />
        </button>
        <h2 className="panel-title">{title}</h2>
        <span className="panel-right">{right}</span>
      </div>
      <div className="panel-scroll">{children}</div>
    </div>
  );
}
