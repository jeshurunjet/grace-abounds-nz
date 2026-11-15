import { describe, expect, it } from 'vitest';
import {
  checkUpload,
  decideStorage,
  fileTypeLabel,
  formatBytes,
  isFileHref,
  MAX_LIBRARY_FILE_BYTES,
  MAX_SERMON_FILE_BYTES,
  partSizeFor,
} from './files.ts';

/*
 * Phase 2D upload policy (owner decision, 15 Nov): any type except
 * programs and active content; inline only when the first bytes confirm a
 * browser-safe type; video only through Sermons & videos.
 */

const contentHead = (values: number[]) => {
  const out = new Uint8Array(64);
  out.set(values);
  return out;
};
const head = (...parts: (number[] | string)[]) =>
  contentHead(
    parts.flatMap((part) =>
      typeof part === 'string'
        ? [...part].map((char) => char.charCodeAt(0))
        : part,
    ),
  );
const ftyp = (brand: string) => head([0, 0, 0, 0x18], 'ftyp', brand);

describe('checkUpload (before anything is sent)', () => {
  it('refuses programs, scripts and web pages whatever the purpose', () => {
    for (const name of [
      'setup.exe',
      'install.MSI',
      'run.bat',
      'tool.sh',
      'app.js',
      'page.html',
      'logo.svg',
      'Thing.app',
      'pkg.dmg',
    ])
      expect(
        checkUpload({ fileName: name, size: 10, purpose: 'library' }),
      ).toMatch(/can’t be uploaded/);
  });

  it('accepts any other library file up to 500 MB, but no videos', () => {
    for (const name of [
      'notes.docx',
      'plan.key',
      'data.csv',
      'odd.xyz',
      'README',
    ])
      expect(
        checkUpload({
          fileName: name,
          size: MAX_LIBRARY_FILE_BYTES,
          purpose: 'library',
        }),
      ).toBeNull();
    expect(
      checkUpload({
        fileName: 'big.pdf',
        size: MAX_LIBRARY_FILE_BYTES + 1,
        purpose: 'library',
      }),
    ).toMatch(/up to 500 MB/);
    expect(
      checkUpload({ fileName: 'clip.mov', size: 10, purpose: 'library' }),
    ).toMatch(/Sermons & videos/);
    expect(
      checkUpload({ fileName: 'empty.pdf', size: 0, purpose: 'library' }),
    ).toMatch(/empty/);
  });

  it('accepts sermon recordings up to 5 GB as video or audio only', () => {
    for (const name of [
      'Sunday.mp4',
      'Sunday.MOV',
      'talk.mp3',
      'talk.m4a',
      'a.webm',
    ])
      expect(
        checkUpload({
          fileName: name,
          size: MAX_SERMON_FILE_BYTES,
          purpose: 'sermon',
        }),
      ).toBeNull();
    expect(
      checkUpload({
        fileName: 'Sunday.mp4',
        size: MAX_SERMON_FILE_BYTES + 1,
        purpose: 'sermon',
      }),
    ).toMatch(/up to 5 GB/);
    expect(
      checkUpload({ fileName: 'notes.pdf', size: 10, purpose: 'sermon' }),
    ).toMatch(/MP4/);
    expect(
      checkUpload({ fileName: 'raw.mkv', size: 10, purpose: 'sermon' }),
    ).toMatch(/MP4/);
  });
});

describe('decideStorage (after upload, from the first bytes)', () => {
  const decide = (
    fileName: string,
    bytes: Uint8Array,
    purpose: 'library' | 'sermon' = 'library',
  ) => decideStorage({ fileName, purpose, head: bytes });

  it('opens confirmed PDFs, images and audio in the browser', () => {
    expect(decide('a.pdf', head('%PDF-1.7'))).toEqual({
      ok: true,
      contentType: 'application/pdf',
      inline: true,
    });
    expect(decide('a.JPG', head([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({
      contentType: 'image/jpeg',
      inline: true,
    });
    expect(
      decide('a.png', head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toMatchObject({ contentType: 'image/png' });
    expect(decide('a.webp', head('RIFF', [0, 0, 0, 0], 'WEBP'))).toMatchObject({
      contentType: 'image/webp',
    });
    expect(decide('a.mp3', head('ID3'))).toMatchObject({
      contentType: 'audio/mpeg',
    });
    // An M4A with a generic MP4 brand is still audio.
    expect(decide('a.m4a', ftyp('isom'))).toMatchObject({
      contentType: 'audio/mp4',
    });
  });

  it('serves everything else as a download', () => {
    for (const [name, bytes] of [
      ['a.docx', head([0x50, 0x4b, 0x03, 0x04])],
      ['a.txt', head('<html><script>')], // never rendered: attachment, octet-stream
      ['a.xyz', head('hello')],
    ] as const)
      expect(decide(name, bytes)).toEqual({
        ok: true,
        contentType: 'application/octet-stream',
        inline: false,
      });
  });

  it('refuses programs under any name', () => {
    for (const bytes of [
      head('MZ'),
      head([0x7f], 'ELF'),
      head([0xcf, 0xfa, 0xed, 0xfe]),
      head([0xca, 0xfe, 0xba, 0xbe]),
      head('#!/bin/sh'),
    ]) {
      expect(decide('notes.pdf', bytes).ok).toBe(false);
      expect(decide('notes.txt', bytes).ok).toBe(false);
      expect(decide('Sunday.mp4', bytes, 'sermon').ok).toBe(false);
    }
  });

  it('refuses a file whose contents don’t match its name', () => {
    expect(decide('photo.png', head('%PDF-1.4'))).toEqual({
      ok: false,
      reason: 'This file’s contents don’t match its .png name.',
    });
    expect(decide('notes.pdf', head([0xff, 0xd8, 0xff])).ok).toBe(false);
  });

  it('keeps video out of the library under any name', () => {
    expect(decide('service.dat', ftyp('mp42')).ok).toBe(false);
    expect(decide('service.mp3', ftyp('mp42')).ok).toBe(false);
    expect(decide('service', head([0x1a, 0x45, 0xdf, 0xa3])).ok).toBe(false);
  });

  it('accepts real recordings for sermons and refuses anything else', () => {
    expect(decide('Sunday.mp4', ftyp('mp42'), 'sermon')).toEqual({
      ok: true,
      contentType: 'video/mp4',
      inline: true,
    });
    expect(decide('Sunday.mov', ftyp('qt  '), 'sermon')).toMatchObject({
      contentType: 'video/quicktime',
    });
    expect(
      decide('Sunday.webm', head([0x1a, 0x45, 0xdf, 0xa3]), 'sermon').ok,
    ).toBe(true);
    expect(decide('Sunday.mp4', head('%PDF-1.7'), 'sermon').ok).toBe(false);
    expect(decide('notes.pdf', head('%PDF-1.7'), 'sermon').ok).toBe(false);
  });
});

describe('helpers', () => {
  it('sizes parts so a 5 GB file stays under 10,000 parts', () => {
    expect(partSizeFor(1)).toBe(10 * 1024 * 1024);
    expect(
      Math.ceil(MAX_SERMON_FILE_BYTES / partSizeFor(MAX_SERMON_FILE_BYTES)),
    ).toBeLessThanOrEqual(10_000);
    expect(
      Math.ceil((200 * 1024 ** 3) / partSizeFor(200 * 1024 ** 3)),
    ).toBeLessThanOrEqual(10_000);
  });
  it('labels and formats', () => {
    expect(fileTypeLabel('Plan.PPTX')).toBe('Slides');
    expect(fileTypeLabel('photo.jpeg')).toBe('Image');
    expect(fileTypeLabel('README')).toBe('File');
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
    expect(isFileHref('/api/v1/files/abc123')).toBe(true);
    expect(isFileHref('/api/v1/files/../x')).toBe(false);
  });
});
