"use client";

import type { Occurrence } from "./shows";
import { formatSlotTime, showSeller } from "./shows";

/**
 * Push-server-free reminders. An .ics VEVENT carries its own VALARM — the
 * user's calendar app fires the notification 15 minutes before the show,
 * no permission prompt, no backend. wa.me deep links are the share rail
 * (WhatsApp is Malaysia's real notification layer).
 */

const icsStamp = (ms: number): string =>
  new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const esc = (s: string): string => s.replace(/([,;\\])/g, "\\$1");

export function downloadShowIcs(occ: Occurrence): void {
  const seller = showSeller(occ.slot);
  const title = `${occ.slot.title} — ${seller?.name ?? "Scopie"} on Scopie`;
  const url = `https://scopie.io/live/${occ.slot.roomId}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scopie//Shows//EN",
    "BEGIN:VEVENT",
    `UID:${occ.slot.id}-${occ.startMs}@scopie.io`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(occ.startMs)}`,
    `DTEND:${icsStamp(occ.endMs)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(`Live on Scopie — hosted by ${occ.slot.host}. ${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`${occ.slot.title} starts in 15 minutes`)}`,
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `scopie-${occ.slot.id}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Zero-JS calendar path for Google users. */
export function googleCalendarUrl(occ: Occurrence): string {
  const seller = showSeller(occ.slot);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${occ.slot.title} — ${seller?.name ?? "Scopie"} on Scopie`,
    dates: `${icsStamp(occ.startMs)}/${icsStamp(occ.endMs)}`,
    details: `Live on Scopie — hosted by ${occ.slot.host}. https://scopie.io/live/${occ.slot.roomId}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** WhatsApp share — opens the contact picker with prefilled BM/EN copy. */
export function whatsappShareUrl(occ: Occurrence): string {
  const seller = showSeller(occ.slot);
  const text =
    `Jom tengok ${occ.slot.title} (${seller?.name ?? "Scopie"}) ${formatSlotTime(occ)} di Scopie. ` +
    `https://scopie.io/live/${occ.slot.roomId}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
