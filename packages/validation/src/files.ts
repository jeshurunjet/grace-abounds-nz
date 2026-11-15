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

type Sniffed =
  { group: Inline['group']; mp4?: true } | { executable: true } | null;

const startsWith = (bytes: Uint8Array, ...values: number[]) =>
  values.every((value, index) => bytes[index] === value);
const ascii = (bytes: Uint8Array, start: number, text: string) =>
  [...text].every((char, index) => bytes[start + index] === char.charCodeAt(0));

/** Identifies a file from its first bytes (4 KB is plenty). */
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
  if (ascii(bytes, 4, 'ftyp')) {
    // MP4 family (MP4, MOV, M4A): the brand says audio-only or video.
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return { group: /^M4[AB] $/.test(brand) ? 'audio' : 'video', mp4: true };
  }
  if (startsWith(bytes, 0x1a, 0x45, 0xdf, 0xa3)) return { group: 'video' }; // WebM
  if (
    ascii(bytes, 0, 'ID3') ||
    (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) || // MP3 frame
    (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE')) ||
    ascii(bytes, 0, 'OggS')
  )
    return { group: 'audio' };
  return null;
}

export type StorageDecision =
  | { ok: true; contentType: string; inline: boolean }
  | { ok: false; reason: string };

/**
 * Decides, after upload, how a file is stored and served from its name,
 * purpose and first bytes. A file whose name says it opens in the browser
 * must really be that type; anything else is served as a download, and
 * video never enters the library under any name.
 */
export function decideStorage(file: {
  fileName: string;
  purpose: UploadPurpose;
  head: Uint8Array;
}): StorageDecision {
  const sniffed = sniffFile(file.head);
  if (sniffed && 'executable' in sniffed)
    return { ok: false, reason: BLOCKED_FILE_MESSAGE };
  const ext = fileExtension(file.fileName);
  const claimed = INLINE[ext];
  // MP4-family files are audio or video whatever their brand says.
  const matches =
    !!claimed &&
    !!sniffed &&
    (sniffed.group === claimed.group ||
      (!!sniffed.mp4 && /mp4|quicktime/.test(claimed.mime)));
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
  const audioClaim = claimed?.group === 'audio' && matches;
  if (claimed?.group === 'video' || (sniffed?.group === 'video' && !audioClaim))
    return { ok: false, reason: LIBRARY_VIDEO_MESSAGE };
  if (claimed) {
    if (!matches)
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
