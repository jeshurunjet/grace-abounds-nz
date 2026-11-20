import { deflateSync, inflateSync } from 'node:zlib';
import {
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_SIDE,
  PROFILE_PHOTO_MIN_SIDE,
} from '@grace-abounds/validation';

/*
 * Profile photo decoding (Phase 5), with Node's own zlib and no image
 * library: one well-defined format is accepted and fully decoded, then a
 * fresh image is written, so nothing but pixels survives.
 *
 * Accepted: PNG, 8-bit, RGB or RGBA, not interlaced, 64–1024 pixels each
 * way, at most PROFILE_PHOTO_MAX_BYTES. The browser crops any JPEG, PNG or
 * WebP to exactly this before sending.
 *
 * Checked: the signature; every chunk's length, type and CRC; the order
 * (IHDR first, image data in one run, IEND last with nothing after it); no
 * palette or unknown critical chunk; the compressed data inflates (with a
 * hard output limit) to exactly the expected bytes; every row's filter is
 * legal and every row is reconstructed. Optional chunks (text, EXIF, colour
 * profiles, times) are dropped. JPEG, GIF, SVG, HTML and every other PNG
 * mode are refused with a clear message.
 *
 * Written: signature, IHDR, one IDAT (rows re-filtered, deflated), IEND.
 * Memory is bounded: at most 1024 × 1024 × 4 bytes of pixels.
 */

export type CheckedImage = {
  bytes: Uint8Array;
  contentType: 'image/png';
  extension: 'png';
  width: number;
  height: number;
};
export type DecodedImage = {
  width: number;
  height: number;
  /** 3 (RGB) or 4 (RGBA). */
  channels: number;
  /** Rows of pixels, top to bottom, without filter bytes. */
  pixels: Uint8Array;
};

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_CHUNKS = 4096;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class Refused extends Error {}
const refuse = (message: string): never => {
  throw new Refused(message);
};
const DAMAGED = 'This photo is damaged. Choose it again.';
const UNSUPPORTED =
  'This photo format isn’t supported. Choose a JPEG, PNG or WebP photo and crop it again.';

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Fully decodes an accepted PNG; throws Refused with a message. */
function decode(bytes: Uint8Array): DecodedImage {
  if (bytes.length > PROFILE_PHOTO_MAX_BYTES)
    refuse('This photo is too large. Choose a smaller one.');
  if (bytes.length < SIGNATURE.length + 12 * 3 + 13)
    refuse(bytes.length ? DAMAGED : 'Choose a photo.');
  if (!SIGNATURE.every((value, index) => bytes[index] === value))
    refuse(UNSUPPORTED);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = SIGNATURE.length;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Uint8Array[] = [];
  let state: 'header' | 'before-data' | 'data' | 'after-data' = 'header';
  let ended = false;
  for (let count = 0; !ended; count++) {
    if (count >= MAX_CHUNKS || offset + 12 > bytes.length) refuse(DAMAGED);
    const length = view.getUint32(offset);
    if (length > bytes.length) refuse(DAMAGED);
    const end = offset + 12 + length;
    if (end > bytes.length) refuse(DAMAGED);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    if (!/^[A-Za-z]{4}$/.test(type)) refuse(DAMAGED);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
      view.getUint32(offset + 8 + length)
    )
      refuse(DAMAGED);
    const critical = type.charCodeAt(0) < 97;
    if (state === 'header') {
      if (type !== 'IHDR' || length !== 13) refuse(DAMAGED);
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [depth, colour, compression, filter, interlace] = body.subarray(8);
      if (compression !== 0 || filter !== 0) refuse(DAMAGED);
      if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0)
        refuse(UNSUPPORTED);
      channels = colour === 6 ? 4 : 3;
      if (
        width < PROFILE_PHOTO_MIN_SIDE ||
        height < PROFILE_PHOTO_MIN_SIDE ||
        width > PROFILE_PHOTO_MAX_SIDE ||
        height > PROFILE_PHOTO_MAX_SIDE
      )
        refuse(
          `Choose a photo between ${PROFILE_PHOTO_MIN_SIDE} and ${PROFILE_PHOTO_MAX_SIDE} pixels wide and high.`,
        );
      state = 'before-data';
    } else if (type === 'IHDR') refuse(DAMAGED);
    else if (type === 'IDAT') {
      // Image data must be one unbroken run.
      if (state === 'after-data') refuse(DAMAGED);
      state = 'data';
      data.push(body);
    } else if (type === 'IEND') {
      if (state !== 'data' && state !== 'after-data') refuse(DAMAGED);
      if (length !== 0 || end !== bytes.length) refuse(DAMAGED);
      ended = true;
    } else if (critical) {
      // PLTE (a palette) or anything unknown that can't be ignored.
      refuse(UNSUPPORTED);
    } else if (state === 'data') state = 'after-data';
    offset = end;
  }
  const stride = width * channels;
  const expected = height * (stride + 1);
  let raw: Buffer;
  try {
    // A hard limit: more output than the declared size is refused.
    raw = inflateSync(Buffer.concat(data), {
      maxOutputLength: expected + 1,
    });
  } catch {
    return refuse(DAMAGED);
  }
  if (raw.length !== expected) refuse(DAMAGED);
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    if (filter > 4) refuse(DAMAGED);
    const source = y * (stride + 1) + 1;
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[source + x]!;
      const left = x >= channels ? pixels[row + x - channels]! : 0;
      const up = y > 0 ? pixels[previous + x]! : 0;
      const corner =
        y > 0 && x >= channels ? pixels[previous + x - channels]! : 0;
      const predicted =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : paeth(left, up, corner);
      pixels[row + x] = (value + predicted) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function chunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Writes a fresh PNG from decoded pixels (adaptive row filters). */
export function encodePng(image: DecodedImage): Uint8Array {
  const { width, height, channels, pixels } = image;
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let best = 0;
    let bestScore = Infinity;
    let bestRow: Uint8Array | null = null;
    for (let filter = 0; filter <= 4; filter++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const value = pixels[row + x]!;
        const left = x >= channels ? pixels[row + x - channels]! : 0;
        const up = y > 0 ? pixels[row - stride + x]! : 0;
        const corner =
          y > 0 && x >= channels ? pixels[row - stride + x - channels]! : 0;
        const predicted =
          filter === 0
            ? 0
            : filter === 1
              ? left
              : filter === 2
                ? up
                : filter === 3
                  ? (left + up) >> 1
                  : paeth(left, up, corner);
        const out = (value - predicted) & 0xff;
        candidate[x] = out;
        score += out < 128 ? out : 256 - out;
      }
      if (score < bestScore) {
        bestScore = score;
        best = filter;
        bestRow = candidate.slice();
      }
    }
    raw[y * (stride + 1)] = best;
    raw.set(bestRow!, y * (stride + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8);
  const parts = [
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Decodes an accepted PNG (for tests and checks); throws on refusal. */
export function decodePng(bytes: Uint8Array): DecodedImage {
  return decode(bytes);
}

/** Checks, decodes and rewrites a profile photo; or returns a message. */
export function checkProfileImage(bytes: Uint8Array): CheckedImage | string {
  try {
    const image = decode(bytes);
    return {
      bytes: encodePng(image),
      contentType: 'image/png',
      extension: 'png',
      width: image.width,
      height: image.height,
    };
  } catch (error) {
    if (error instanceof Refused) return error.message;
    throw error;
  }
}
