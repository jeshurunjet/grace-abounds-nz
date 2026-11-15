import { z } from 'zod';

/*
 * Phase 2D upload policy, shared by the API (which enforces it) and the
 * website (which checks early so staff see problems before uploading).
 *
 * Owner decision (15 Nov): any file type except programs and active
 * content. Files that browsers can show safely (PDF, common images, audio
 * and video) open in the browser once their first bytes confirm the type;
 * everything else is download-only. Videos go through Sermons & videos,
 * where the Pastor approves them; never into the library.
 */

export const uploadPurposes = ['library', 'sermon'] as const;
export type UploadPurpose = (typeof uploadPurposes)[number];

const MB = 1024 * 1024;
export const MAX_LIBRARY_FILE_BYTES = 500 * MB;
/** S3 copies up to 5 GB in one step, which the move after checking uses. */
export const MAX_SERMON_FILE_BYTES = 5 * 1024 * MB;
export const maxBytesFor = (purpose: UploadPurpose) =>
  purpose === 'sermon' ? MAX_SERMON_FILE_BYTES : MAX_LIBRARY_FILE_BYTES;

/** Programs, scripts and active web content: refused whatever their bytes. */
const BLOCKED = new Set(
  (
    'exe msi msp bat cmd com scr pif cpl dll sys drv ocx so dylib bin run elf ' +
    'ps1 psm1 psd1 vbs vbe js jse mjs cjs ts wsf wsh wsc hta jar class apk aab ' +
    'xapk ipa app dmg pkg mpkg deb rpm snap flatpak appimage appx msix ' +
    'msixbundle sh bash zsh csh ksh fish command tool workflow action lnk url ' +
    'reg inf scf gadget msc iso img vhd vhdx py pyc pyw rb pl php phtml asp ' +
    'aspx jsp cgi lua html htm xhtml shtml mht mhtml svg svgz xsl xslt'
  ).split(' '),
);

/** Video files: only through Sermons & videos. */
const VIDEO = new Set(
  'mp4 m4v mov webm mkv avi wmv flv mpg mpeg mts m2ts 3gp ogv'.split(' '),
);

type Inline = { mime: string; group: 'pdf' | 'image' | 'audio' | 'video' };
/** Types that open in the browser, when their first bytes agree. */
const INLINE: Record<string, Inline> = {
  pdf: { mime: 'application/pdf', group: 'pdf' },
  jpg: { mime: 'image/jpeg', group: 'image' },
  jpeg: { mime: 'image/jpeg', group: 'image' },
  png: { mime: 'image/png', group: 'image' },
  gif: { mime: 'image/gif', group: 'image' },
  webp: { mime: 'image/webp', group: 'image' },
  mp3: { mime: 'audio/mpeg', group: 'audio' },
  m4a: { mime: 'audio/mp4', group: 'audio' },
  wav: { mime: 'audio/wav', group: 'audio' },
  ogg: { mime: 'audio/ogg', group: 'audio' },
  oga: { mime: 'audio/ogg', group: 'audio' },
  mp4: { mime: 'video/mp4', group: 'video' },
  m4v: { mime: 'video/mp4', group: 'video' },
  mov: { mime: 'video/quicktime', group: 'video' },
  webm: { mime: 'video/webm', group: 'video' },
};

export const fileExtension = (name: string) => {
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(name.trim());
  return match ? match[1]!.toLowerCase() : '';
};

/** Accepted by the Sermons & videos recording upload. */
export const SERMON_FILE_ACCEPT =
  '.mp4,.m4v,.mov,.webm,.mp3,.m4a,.wav,.ogg,video/mp4,video/quicktime,video/webm,audio/*';

export const BLOCKED_FILE_MESSAGE =
  'Programs, scripts and web pages can’t be uploaded.';
export const LIBRARY_VIDEO_MESSAGE =
  'Upload videos in Sermons & videos, where the Pastor approves them.';
export const SERMON_FILE_MESSAGE =
  'Upload the recording as MP4, MOV, WebM, MP3, M4A, WAV or OGG.';

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * MB)
    return `${Number((bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0))} MB`;
  return `${Number((bytes / (1024 * MB)).toFixed(1))} GB`;
}

/**
 * Checks a file before anything is uploaded: name, size and purpose.
 * Returns a message for staff, or null when it may be uploaded.
 */
export function checkUpload(file: {
  fileName: string;
  size: number;
  purpose: UploadPurpose;
}): string | null {
  const ext = fileExtension(file.fileName);
  if (BLOCKED.has(ext)) return BLOCKED_FILE_MESSAGE;
  if (file.size <= 0) return 'This file is empty.';
  const max = maxBytesFor(file.purpose);
  if (file.size > max)
    return file.purpose === 'sermon'
      ? `Recordings can be up to ${formatBytes(max)}. Export a smaller file.`
      : `Files can be up to ${formatBytes(max)}.`;
  if (file.purpose === 'library' && VIDEO.has(ext))
    return LIBRARY_VIDEO_MESSAGE;
  if (file.purpose === 'sermon') {
    const group = INLINE[ext]?.group;
    if (group !== 'video' && group !== 'audio') return SERMON_FILE_MESSAGE;
  }
  return null;
}

/**
 * What the first bytes say. Containers that can carry video tracks under
 * any name (the MP4/QuickTime family and Ogg) are marked so their actual
 * tracks are checked before a library file is accepted.
 */
type Sniffed =
  | { group: Inline['group']; container?: 'mp4' | 'ogg' }
  | { executable: true }
  | null;

const startsWith = (bytes: Uint8Array, ...values: number[]) =>
  values.every((value, index) => bytes[index] === value);
const ascii = (bytes: Uint8Array, start: number, text: string) =>
  [...text].every((char, index) => bytes[start + index] === char.charCodeAt(0));
const text4 = (bytes: Uint8Array, start: number) =>
  String.fromCharCode(...bytes.slice(start, start + 4));

/** The first bytes needed to identify a file and read Ogg stream headers. */
export const SNIFF_BYTES = 64 * 1024;

/** Identifies a file from its first bytes. */
export function sniffFile(bytes: Uint8Array): Sniffed {
  if (
    startsWith(bytes, 0x4d, 0x5a) || // Windows program (MZ)
    startsWith(bytes, 0x7f, 0x45, 0x4c, 0x46) || // Linux program (ELF)
    startsWith(bytes, 0xfe, 0xed, 0xfa, 0xce) || // macOS programs (Mach-O)
    startsWith(bytes, 0xfe, 0xed, 0xfa, 0xcf) ||
    startsWith(bytes, 0xce, 0xfa, 0xed, 0xfe) ||
    startsWith(bytes, 0xcf, 0xfa, 0xed, 0xfe) ||
    startsWith(bytes, 0xca, 0xfe, 0xba, 0xbe) || // universal binary / Java
    startsWith(bytes, 0x23, 0x21) // script (#!)
  )
    return { executable: true };
  if (ascii(bytes, 0, '%PDF-')) return { group: 'pdf' };
  if (
    startsWith(bytes, 0xff, 0xd8, 0xff) ||
    startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    ascii(bytes, 0, 'GIF87a') ||
    ascii(bytes, 0, 'GIF89a') ||
    (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP'))
  )
    return { group: 'image' };
  // MP4 family (MP4, MOV, M4A, 3GP), with or without a brand box. The brand
  // is only a hint: a video can carry an audio brand, so tracks decide.
  if (ascii(bytes, 4, 'ftyp')) {
    const brand = text4(bytes, 8);
    return {
      group: /^M4[AB] $/.test(brand) ? 'audio' : 'video',
      container: 'mp4',
    };
  }
  if (/^(moov|mdat|wide|free|skip|pnot)$/.test(text4(bytes, 4)))
    return { group: 'video', container: 'mp4' }; // older QuickTime
  if (ascii(bytes, 0, 'OggS')) return { group: 'audio', container: 'ogg' };
  // Containers that are video (no audio-only use worth allowing in the
  // library): Matroska/WebM, AVI, FLV, Windows Media, MPEG, RealMedia.
  if (
    startsWith(bytes, 0x1a, 0x45, 0xdf, 0xa3) ||
    (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'AVI ')) ||
    ascii(bytes, 0, 'FLV') ||
    startsWith(bytes, 0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11) ||
    startsWith(bytes, 0x00, 0x00, 0x01, 0xba) ||
    startsWith(bytes, 0x00, 0x00, 0x01, 0xb3) ||
    (bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47) ||
    ascii(bytes, 0, '.RMF')
  )
    return { group: 'video' };
  if (
    ascii(bytes, 0, 'ID3') ||
    (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) || // MP3 frame
    (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE'))
  )
    return { group: 'audio' };
  return null;
}

/** Track handler types that are fine in an audio-only file. */
const AUDIO_ONLY_TRACKS = new Set([
  'soun', // audio
  'text', // chapters (audiobooks, podcasts)
  'sbtl',
  'subt',
  'meta',
  'hint',
  'tmcd',
]);
/** True when an MP4-family file's tracks include audio and no video. */
export const isAudioOnlyTracks = (handlers: string[] | null | undefined) =>
  !!handlers?.length &&
  handlers.includes('soun') &&
  handlers.every((handler) => AUDIO_ONLY_TRACKS.has(handler));

const u32 = (bytes: Uint8Array, at: number) =>
  ((bytes[at]! << 24) |
    (bytes[at + 1]! << 16) |
    (bytes[at + 2]! << 8) |
    bytes[at + 3]!) >>>
  0;
/** Child boxes of an MP4 box payload: [type, start, end]. */
function* boxes(bytes: Uint8Array, start: number, end: number) {
  let at = start;
  while (at + 8 <= end) {
    let size = u32(bytes, at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) return;
      size = u32(bytes, at + 8) * 2 ** 32 + u32(bytes, at + 12);
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || at + size > end) return;
    yield [text4(bytes, at + 4), at + header, at + size] as const;
    at += size;
  }
}

/**
 * The handler type of every track in an MP4/QuickTime `moov` box (the
 * whole box, header included): "vide" for video, "soun" for audio, …
 * A track without a readable handler counts as "????" (not audio-only).
 */
export function mp4HandlerTypes(moov: Uint8Array): string[] {
  const top = [...boxes(moov, 0, moov.length)][0];
  if (!top || top[0] !== 'moov') return [];
  const handlers: string[] = [];
  for (const [type, start, end] of boxes(moov, top[1], top[2])) {
    if (type !== 'trak') continue;
    let handler = '????';
    for (const [inner, mStart, mEnd] of boxes(moov, start, end))
      if (inner === 'mdia')
        for (const [leaf, hStart, hEnd] of boxes(moov, mStart, mEnd))
          // hdlr: version/flags (4), pre_defined (4), handler_type (4)
          if (leaf === 'hdlr' && hStart + 12 <= hEnd)
            handler = text4(moov, hStart + 8);
    handlers.push(handler);
  }
  return handlers;
}

/** Ogg codecs that are audio (or stream metadata). */
const OGG_AUDIO = [
  '\x01vorbis',
  'OpusHead',
  '\x7fFLAC',
  'Speex   ',
  'fishead\0', // skeleton (metadata)
  'fisbone\0',
];
/**
 * True when an Ogg file's streams are all audio. Every stream starts with a
 * "beginning of stream" page before any data, so the first bytes show them
 * all; a video codec, an unknown codec, or not reaching the first data
 * page means "not confirmed".
 */
export function oggAudioOnly(bytes: Uint8Array): boolean {
  let at = 0;
  let audio = false;
  while (at + 27 <= bytes.length && ascii(bytes, at, 'OggS')) {
    const segments = bytes[at + 26]!;
    const payload = at + 27 + segments;
    if (payload > bytes.length) return false;
    let length = 0;
    for (let i = 0; i < segments; i++) length += bytes[at + 27 + i]!;
    const beginning = (bytes[at + 5]! & 0x02) !== 0;
    if (!beginning) return audio; // all streams have been declared
    const codec = OGG_AUDIO.find((magic) => ascii(bytes, payload, magic));
    if (!codec) return false;
    if (!codec.startsWith('fis')) audio = true;
    at = payload + length;
  }
  return false;
}

/** A library file in the MP4 family must have its tracks checked. */
export const needsTrackCheck = (file: {
  purpose: UploadPurpose;
  head: Uint8Array;
}) => {
  const sniffed = sniffFile(file.head);
  return (
    file.purpose === 'library' &&
    !!sniffed &&
    'group' in sniffed &&
    sniffed.container === 'mp4'
  );
};

export type StorageDecision =
  | { ok: true; contentType: string; inline: boolean }
  | { ok: false; reason: string };

const NOT_AUDIO_ONLY = `${LIBRARY_VIDEO_MESSAGE} (This file contains video, or it couldn’t be confirmed as audio only.)`;

/**
 * Decides, after upload, how a file is stored and served from its name,
 * purpose and first bytes (and, for MP4-family library files, its tracks).
 * A file whose name says it opens in the browser must really be that type;
 * anything else is served as a download. Video never enters the library
 * under any name: containers that can hold video are accepted there only
 * when their tracks are confirmed to be audio only.
 */
export function decideStorage(file: {
  fileName: string;
  purpose: UploadPurpose;
  head: Uint8Array;
  /** Track handler types, required for MP4-family library files. */
  mp4Tracks?: string[] | null;
}): StorageDecision {
  const sniffed = sniffFile(file.head);
  if (sniffed && 'executable' in sniffed)
    return { ok: false, reason: BLOCKED_FILE_MESSAGE };
  const ext = fileExtension(file.fileName);
  const claimed = INLINE[ext];
  // An MP4-family file can be audio or video whatever its brand says.
  const matches =
    !!claimed &&
    !!sniffed &&
    (sniffed.group === claimed.group ||
      (sniffed.container === 'mp4' && /mp4|quicktime/.test(claimed.mime)));
  if (file.purpose === 'sermon') {
    if (!claimed || (claimed.group !== 'video' && claimed.group !== 'audio'))
      return { ok: false, reason: SERMON_FILE_MESSAGE };
    if (!matches)
      return {
        ok: false,
        reason:
          'This file isn’t the recording type its name says. Export it again and upload that file.',
      };
    return { ok: true, contentType: claimed.mime, inline: true };
  }

  // Library: no video, whatever the name, brand or container.
  if (claimed?.group === 'video')
    return { ok: false, reason: LIBRARY_VIDEO_MESSAGE };
  if (sniffed?.container === 'mp4') {
    if (!isAudioOnlyTracks(file.mp4Tracks))
      return { ok: false, reason: NOT_AUDIO_ONLY };
  } else if (sniffed?.container === 'ogg') {
    if (!oggAudioOnly(file.head)) return { ok: false, reason: NOT_AUDIO_ONLY };
  } else if (sniffed?.group === 'video')
    return { ok: false, reason: LIBRARY_VIDEO_MESSAGE };
  if (claimed) {
    // A confirmed audio-only MP4 or Ogg is served as what it is, so a name
    // like "talk.mp3" on one of them is refused as a mismatch.
    if (
      !matches ||
      (sniffed?.container === 'mp4' && claimed.mime !== 'audio/mp4') ||
      (sniffed?.container === 'ogg' && claimed.mime !== 'audio/ogg')
    )
      return {
        ok: false,
        reason: `This file’s contents don’t match its .${ext} name.`,
      };
    return { ok: true, contentType: claimed.mime, inline: true };
  }
  return { ok: true, contentType: 'application/octet-stream', inline: false };
}

/** Part size for multipart uploads: 10 MB, larger for huge files. */
export function partSizeFor(size: number) {
  return Math.max(10 * MB, Math.ceil(size / 10_000 / MB) * MB);
}

/** A short type label from a file name, for the Gallery's Type column. */
export function fileTypeLabel(fileName: string) {
  const ext = fileExtension(fileName);
  const labels: Record<string, string> = {
    pdf: 'PDF',
    doc: 'Word',
    docx: 'Word',
    odt: 'Document',
    rtf: 'Document',
    txt: 'Text',
    xls: 'Spreadsheet',
    xlsx: 'Spreadsheet',
    ods: 'Spreadsheet',
    csv: 'Spreadsheet',
    ppt: 'Slides',
    pptx: 'Slides',
    odp: 'Slides',
    key: 'Slides',
    zip: 'ZIP archive',
  };
  if (labels[ext]) return labels[ext]!;
  const group = INLINE[ext]?.group;
  if (group === 'image') return 'Image';
  if (group === 'audio') return 'Audio';
  return ext ? ext.toUpperCase() : 'File';
}

/** Where the website opens a stored file (the API checks access). */
export const fileHref = (assetId: string) => `/api/v1/files/${assetId}`;
export const isFileHref = (value: string) =>
  /^\/api\/v1\/files\/[A-Za-z0-9_-]{1,40}$/.test(value);

const fileName = z
  .string()
  .trim()
  .min(1, 'Choose a file.')
  .max(200, 'Rename the file to something shorter first.')
  .refine(
    (value) => !/[\u0000-\u001f\u007f/\\]/.test(value),
    'Rename the file first.',
  );

export const uploadStartSchema = z
  .object({
    fileName,
    size: z.number().int().positive().max(MAX_SERMON_FILE_BYTES),
    purpose: z.enum(uploadPurposes),
  })
  .strict()
  .superRefine((file, context) => {
    const problem = checkUpload(file);
    if (problem)
      context.addIssue({ code: 'custom', path: ['file'], message: problem });
  });
export const uploadPartsSchema = z
  .object({
    partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100),
  })
  .strict();
export const uploadCompleteSchema = z
  .object({
    parts: z
      .array(
        z
          .object({
            partNumber: z.number().int().min(1).max(10_000),
            etag: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(10_000),
  })
  .strict();

export type UploadStart = z.infer<typeof uploadStartSchema>;
export type AssetStatusValue = 'pending' | 'verified' | 'rejected';
/** A stored file as staff see it. */
export type StaffAsset = {
  id: string;
  fileName: string;
  size: number;
  contentType: string;
  purpose: UploadPurpose;
  inline: boolean;
  status: AssetStatusValue;
  rejectReason: string;
  href: string;
  createdAt: string;
};
export type UploadStarted = {
  asset: StaffAsset;
  partSize: number;
  partCount: number;
};
export type UploadsStatus = {
  available: boolean;
  maxLibraryBytes: number;
  maxSermonBytes: number;
};
