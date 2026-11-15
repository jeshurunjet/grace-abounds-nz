import { createHash } from 'node:crypto';
import type { Disposition, Storage } from './storage.js';

/*
 * An in-memory Storage for tests: deterministic, no network. It behaves like
 * S3 where the routes depend on it (parts joined in order, ETags checked,
 * unknown uploads refused) and records what the routes asked for.
 */
export class MemoryStorage implements Storage {
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  uploads = new Map<
    string,
    { key: string; parts: Map<number, { bytes: Uint8Array; etag: string }> }
  >();
  removed: string[] = [];
  aborted: string[] = [];
  lastDownload?: {
    key: string;
    fileName: string;
    contentType: string;
    disposition: Disposition;
    expiresIn: number;
  };
  /** Set to make the next call fail like an unreachable provider. */
  failNext = false;
  private counter = 0;

  private check() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated storage outage');
    }
  }

  async createMultipart(key: string) {
    this.check();
    const uploadId = `upload-${++this.counter}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    return uploadId;
  }

  async partUrls(
    key: string,
    uploadId: string,
    partNumbers: number[],
    expiresIn: number,
  ) {
    this.check();
    return partNumbers.map((partNumber) => ({
      partNumber,
      url: `memory://${uploadId}/${partNumber}?key=${encodeURIComponent(key)}&expires=${expiresIn}`,
    }));
  }

  /** What the browser does with a part URL: returns the part's ETag. */
  putPart(uploadId: string, partNumber: number, bytes: Uint8Array) {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error('NoSuchUpload');
    const etag = `"${createHash('md5').update(bytes).digest('hex')}"`;
    upload.parts.set(partNumber, { bytes, etag });
    return etag;
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ) {
    this.check();
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) throw new Error('NoSuchUpload');
    const chunks = parts.map((part) => {
      const stored = upload.parts.get(part.partNumber);
      if (!stored || stored.etag !== part.etag) throw new Error('InvalidPart');
      return stored.bytes;
    });
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    this.objects.set(key, { bytes, contentType: 'application/octet-stream' });
    this.uploads.delete(uploadId);
  }

  async abortMultipart(_key: string, uploadId: string) {
    this.check();
    this.uploads.delete(uploadId);
    this.aborted.push(uploadId);
  }

  async head(key: string) {
    this.check();
    const object = this.objects.get(key);
    return object ? { size: object.bytes.length } : null;
  }

  async readStart(key: string, bytes: number) {
    this.check();
    return (this.objects.get(key)?.bytes ?? new Uint8Array()).slice(0, bytes);
  }

  async copy(from: string, to: string, contentType: string) {
    this.check();
    const object = this.objects.get(from);
    if (!object) throw new Error('NoSuchKey');
    this.objects.set(to, { bytes: object.bytes, contentType });
  }

  async remove(key: string) {
    this.check();
    this.objects.delete(key);
    this.removed.push(key);
  }

  async downloadUrl(
    key: string,
    options: {
      fileName: string;
      contentType: string;
      disposition: Disposition;
      expiresIn: number;
    },
  ) {
    this.check();
    this.lastDownload = { key, ...options };
    return `https://storage.test/${encodeURIComponent(key)}?disposition=${options.disposition}&expires=${options.expiresIn}`;
  }
}
