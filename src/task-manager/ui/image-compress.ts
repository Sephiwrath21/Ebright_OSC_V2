"use client";

// Client-side image compression (2026-08-01, storage-sizing decision):
// EVERY image entering the Task Manager — proof uploads (camera, picker,
// drop, paste) and guideline attachments — is downscaled and re-encoded
// in the browser BEFORE upload, so the full-resolution original never
// reaches the server or the database. Confirmed profile: max long side
// 1280px, JPEG quality 75%, 2 MB post-compression cap (the server
// enforces the same cap, so the client pipeline can't be bypassed).
// Projection at real volume (~94k photos/yr): ~24 GB/yr vs 944 GB/yr
// uncompressed.

export const IMAGE_MAX_DIMENSION = 1280;
export const IMAGE_JPEG_QUALITY = 0.75;
/** Post-compression cap — matches the server's Zod cap in data/tasks.ts. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Pre-decode sanity cap: refuse to even decode absurd files. */
export const IMAGE_MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export const IMAGE_INPUT_MIMES = ["image/png", "image/jpeg", "image/webp"];

export interface CompressedImage {
  /** Always image/jpeg after re-encoding. */
  mime: "image/jpeg";
  dataBase64: string;
  previewUrl: string; // data: URL, ready for <img src>
  bytes: number; // approximate decoded size of dataBase64
}

export type CompressResult =
  | { ok: true; image: CompressedImage }
  | { ok: false; message: string };

/** Burns the current local date/time into the bottom-right corner (2026-08-09,
 *  Proof of Completion timestamp watermark) — semi-transparent dark backdrop
 *  behind light text so it stays legible over any photo. Stamped at
 *  CAPTURE/PICK time (whenever this runs), not upload time: a photo can now
 *  sit staged for a while before the Upload button is clicked (see
 *  ProofCell's explicit-upload flow), and "when was this photo actually
 *  taken" is the meaningful proof, not "when did the user click Upload."
 *  Shared by both canvas paths that produce a Proof photo — compressImageFile
 *  below (file picker/drag-drop/paste/mobile picker) and capturePhoto's own
 *  canvas in bits.tsx (desktop webcam capture) — so there's one definition
 *  of the watermark's look, not two that could drift. NOT applied to
 *  guideline/SOP attachment images (a separate, non-Proof use of
 *  compressImageFile) — see that function's `watermark` option. */
export function drawTimestampWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const text = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());

  const fontSize = Math.max(12, Math.round(width * 0.03));
  ctx.font = `${fontSize}px sans-serif`;
  const padding = Math.round(fontSize * 0.5);
  const textWidth = ctx.measureText(text).width;
  const boxWidth = textWidth + padding * 2;
  const boxHeight = fontSize + padding * 2;
  const x = width - boxWidth - padding;
  const y = height - boxHeight - padding;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(x, y, boxWidth, boxHeight);

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padding, y + boxHeight / 2);
}

/** Downscale to IMAGE_MAX_DIMENSION (longest side; never upscales) and
 *  re-encode as JPEG. Returns a typed error instead of throwing — callers
 *  surface `message` in their own error UI.
 *
 *  `watermark` (2026-08-09, default false/omitted): this function is
 *  SHARED — proof uploads AND guideline/SOP attachments both compress
 *  through it (see the module comment above). Only Proof of Completion's
 *  call site passes `{ watermark: true }`; guideline attachments are
 *  reference material, not "evidence at time X," so they stay unstamped. */
export async function compressImageFile(
  file: File,
  options?: { watermark?: boolean },
): Promise<CompressResult> {
  if (!IMAGE_INPUT_MIMES.includes(file.type)) {
    return { ok: false, message: "PNG, JPEG or WebP images only" };
  }
  if (file.size > IMAGE_MAX_SOURCE_BYTES) {
    return { ok: false, message: "Image is too large — max 25 MB before compression" };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: "Could not read that image — please try another file" };
  }
  try {
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, message: "Could not process the image in this browser" };
    // White backdrop: PNG/WebP transparency would otherwise turn black in JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (options?.watermark) {
      drawTimestampWatermark(ctx, canvas.width, canvas.height);
    }
    const previewUrl = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
    const dataBase64 = previewUrl.slice(previewUrl.indexOf(",") + 1);
    const bytes = Math.ceil((dataBase64.length * 3) / 4);
    if (bytes > IMAGE_MAX_BYTES) {
      return { ok: false, message: "Image is too large even after compression — max 2 MB" };
    }
    return { ok: true, image: { mime: "image/jpeg", dataBase64, previewUrl, bytes } };
  } finally {
    bitmap.close();
  }
}
