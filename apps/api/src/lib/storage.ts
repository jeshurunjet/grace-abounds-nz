import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from './errors.js';

/*
 * File storage (Phase 2D). The routes use this interface only, so tests run
 * against an in-memory store and another S3-compatible provider is a
 * configuration change. The browser never receives credentials: it gets
 * single-purpose presigned URLs (one upload part, or one download).
 */

export type Disposition = 'inline' | 'attachment';
/** A server-side upload (data export) is abandoned after this long. */
export const PUT_TIMEOUT_MS = 2 * 60_000;
export interface Storage {
  createMultipart(key: string): Promise<string>;
  partUrls(
    key: string,
    uploadId: string,
    partNumbers: number[],
    expiresIn: number,
  ): Promise<{ partNumber: number; url: string }[]>;
  completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  /** The object's size, or null when it is not there. */
  head(key: string): Promise<{ size: number } | null>;
  /** Up to `length` bytes of an object from `start` (fewer at its end). */
  readRange(key: string, start: number, length: number): Promise<Uint8Array>;
  copy(from: string, to: string, contentType: string): Promise<void>;
  /** Writes a small private object the server made (data exports). */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  downloadUrl(
    key: string,
    options: {
      fileName: string;
      contentType: string;
      disposition: Disposition;
      expiresIn: number;
    },
  ): Promise<string>;
}

/** RFC 6266/5987 Content-Disposition with a safe ASCII fallback name. */
export function contentDisposition(disposition: Disposition, fileName: string) {
  const fallback =
    fileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\;]/g, '')
      .trim() || 'download';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** A storage key segment from a file name (letters, digits, . _ -). */
export const keySafeName = (fileName: string) =>
  fileName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 100) || 'file';

const statusOf = (error: unknown) =>
  (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;

class S3Storage implements Storage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async createMultipart(key: string) {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'application/octet-stream',
      }),
    );
    if (!result.UploadId) throw new Error('S3 returned no upload id.');
    return result.UploadId;
  }

  partUrls(
    key: string,
    uploadId: string,
    partNumbers: number[],
    expiresIn: number,
  ) {
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          this.client,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn },
        ),
      })),
    );
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
          })),
        },
      }),
    );
  }

  async abortMultipart(key: string, uploadId: string) {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      // Already completed or aborted: nothing to clean up.
      if (statusOf(error) !== 404) throw error;
    }
  }

  async head(key: string) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { size: Number(result.ContentLength ?? 0) };
    } catch (error) {
      // Without s3:ListBucket, a missing object answers 403, not 404.
      const status = statusOf(error);
      if (status === 404 || status === 403) return null;
      throw error;
    }
  }

  async readRange(key: string, start: number, length: number) {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${start}-${start + Math.max(1, length) - 1}`,
      }),
    );
    return result.Body
      ? await result.Body.transformToByteArray()
      : new Uint8Array();
  }

  async copy(from: string, to: string, contentType: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: to,
        CopySource: `${this.bucket}/${encodeURI(from)}`,
        ContentType: contentType,
        MetadataDirective: 'REPLACE',
      }),
    );
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    // Bounded, so an upload can't land long after its attempt was given up.
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(PUT_TIMEOUT_MS) },
    );
  }

  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  downloadUrl(
    key: string,
    options: {
      fileName: string;
      contentType: string;
      disposition: Disposition;
      expiresIn: number;
    },
  ) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(
          options.disposition,
          options.fileName,
        ),
        ResponseContentType: options.contentType,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: options.expiresIn },
    );
  }
}

/** Builds S3 storage from the environment, or null when not configured. */
export function storageFromEnv(env = process.env): Storage | null {
  const region = env.S3_REGION?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if (!region || !bucket || !accessKeyId || !secretAccessKey) return null;
  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: !!endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Presigned part URLs must not carry SDK checksum parameters the
    // browser cannot supply.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return new S3Storage(client, bucket);
}

let current: Storage | null | undefined;
/** The configured storage (created once), or null when uploads are off. */
export function getStorage(): Storage | null {
  if (current === undefined) current = storageFromEnv();
  return current;
}
/** Tests swap in an in-memory store (or null for "not configured"). */
export function setStorage(storage: Storage | null | undefined) {
  current = storage;
}

export function requireStorage(): Storage {
  const storage = getStorage();
  if (!storage)
    throw new AppError(
      503,
      'UPLOADS_UNAVAILABLE',
      'File uploads aren’t set up on this server yet.',
    );
  return storage;
}

type Log = { warn: (object: object, message: string) => void };
/**
 * Runs a storage call; a provider failure becomes a retryable 502. Only the
 * error's name and status are logged (never URLs, which carry signatures).
 */
export async function stored<T>(log: Log, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn(
      {
        storageError: (error as Error)?.name ?? 'Error',
        status: statusOf(error),
      },
      'File storage call failed.',
    );
    throw new AppError(
      502,
      'STORAGE_UNAVAILABLE',
      'File storage couldn’t be reached. Try again in a moment.',
    );
  }
}
