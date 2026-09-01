/**
 * Share cards — a branded 1080×1350 PNG rendered on a canvas for the win
 * moments (Dapat!/Menang!/Rezeki!). Where the Web Share API can hand a file
 * to WhatsApp/IG (most mobile browsers), we share the CARD + the text; where
 * it can't (desktop), we fall back to the wa.me text link. The Rehearsal
 * disclosure is painted INTO the image — it can't be cropped out by a
 * forwarded text.
 */

export interface ShareCardSpec {
  word: string;
  title: string;
  priceLine: string;
  host?: string;
  imageUrl?: string | null;
}

const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => resolve(ok ? img : null);
    const t = setTimeout(() => done(false), 2500);
    img.onload = () => {
      clearTimeout(t);
      done(true);
    };
    img.onerror = () => {
      clearTimeout(t);
      done(false);
    };
    img.src = src;
  });
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function renderCard(spec: ShareCardSpec): Promise<Blob | null> {
  try {
    // Best-effort: have the brand face ready before drawing text.
    await (document.fonts?.load?.("800 100px Manrope") ?? Promise.resolve());
  } catch {
    /* system font fallback below */
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const FONT = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';

  // Ground: the brand violet, deep to light.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#241d3d");
  bg.addColorStop(0.55, "#4a3d99");
  bg.addColorStop(1, "#695ACD");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Soft light blooms.
  const blob = ctx.createRadialGradient(W * 0.8, H * 0.16, 0, W * 0.8, H * 0.16, 500);
  blob.addColorStop(0, "rgba(148, 133, 235, 0.55)");
  blob.addColorStop(1, "rgba(148, 133, 235, 0)");
  ctx.fillStyle = blob;
  ctx.fillRect(0, 0, W, H);

  // Product image in a rounded card.
  const img = spec.imageUrl ? await loadImage(spec.imageUrl) : null;
  const imgSize = 560;
  const imgX = (W - imgSize) / 2;
  const imgY = 170;
  if (img) {
    ctx.save();
    rounded(ctx, imgX, imgY, imgSize, imgSize, 48);
    ctx.clip();
    // cover-fit
    const scale = Math.max(imgSize / img.width, imgSize / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, imgX + (imgSize - dw) / 2, imgY + (imgSize - dh) / 2, dw, dh);
    ctx.restore();
    ctx.save();
    rounded(ctx, imgX, imgY, imgSize, imgSize, 48);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";

  // The word.
  ctx.font = `800 108px ${FONT}`;
  ctx.fillText(spec.word, W / 2, img ? 880 : 560);

  // Title + price line.
  ctx.font = `600 46px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const title = spec.title.length > 40 ? `${spec.title.slice(0, 39)}…` : spec.title;
  ctx.fillText(title, W / 2, img ? 960 : 650);
  ctx.font = `800 54px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(spec.priceLine, W / 2, img ? 1040 : 730);

  // Host chip line.
  if (spec.host) {
    ctx.font = `700 36px ${FONT}`;
    ctx.fillStyle = "#CBBDF7";
    ctx.fillText(`hosted by ${spec.host}`, W / 2, img ? 1105 : 800);
  }

  // Footer: wordmark + the disclosure, IN the pixels.
  ctx.font = `800 44px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("scopie.io", W / 2, H - 120);
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText("Rehearsal preview — simulated show", W / 2, H - 66);

  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Share the moment: card + text via the system share sheet when files are
 * supported; wa.me text otherwise. Never throws.
 */
export async function shareMoment(spec: ShareCardSpec, text: string): Promise<void> {
  try {
    const blob = await renderCard(spec);
    if (blob) {
      const file = new File([blob], "scopie-moment.png", { type: "image/png" });
      const payload: ShareData = { files: [file], text };
      if (typeof navigator.canShare === "function" && navigator.canShare(payload)) {
        await navigator.share(payload);
        return;
      }
    }
  } catch (e) {
    // AbortError = the user closed the sheet — that's a completed share flow.
    if ((e as DOMException)?.name === "AbortError") return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}
