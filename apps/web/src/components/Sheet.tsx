"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StrokeIcon } from "@/components/Glyph";

const FOCUSABLE = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * Bottom-sheet modal primitive: backdrop, drag handle, close button, ESC,
 * Tab trap, body scroll lock, focus restore. Content renders inside.
 * Closing plays the exit animation first (close mirrors open), and the
 * system back gesture dismisses the sheet instead of leaving the page.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
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
    }, 200);
  }, []);

  // One history entry per sheet: back closes the sheet, programmatic closes
  // consume the entry so history stays balanced.
  useEffect(() => {
    let popped = false;
    window.history.pushState({ scopieSheet: true }, "");
    const onPop = () => {
      popped = true;
      requestClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && (window.history.state as { scopieSheet?: boolean } | null)?.scopieSheet) {
        window.history.back();
      }
    };
  }, [requestClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Cancelling an IME composition must not close the sheet and eat the draft.
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
    <div className={`sheet-backdrop${closing ? " closing" : ""}`} onClick={requestClose}>
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {children}
        <button className="sheet-close" onClick={requestClose} aria-label="Close">
          <StrokeIcon kind="cross" size={16} />
        </button>
      </div>
    </div>
  );
}
