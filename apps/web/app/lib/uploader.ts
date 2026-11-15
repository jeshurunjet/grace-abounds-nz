import type {
  StaffAsset,
  UploadPurpose,
  UploadStarted,
} from '@grace-abounds/validation';
import { api, ApiError } from './api-client';

/*
 * Browser side of verified uploads (Phase 2D). The file goes straight to
 * storage in parts, each with its own short-lived presigned URL from the
 * API; the API then checks the whole file before anyone can open it.
 *
 * A dropped connection doesn't start over: each part is retried, and if the
 * upload still stops, Retry continues from the parts that already arrived
 * (while the page stays open).
 */

/** Sends one part; resolves with the ETag storage returned. */
export type PartSender = (
  url: string,
  body: Blob,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
) => Promise<string>;

export type UploadState = {
  assetId: string;
  partSize: number;
  partCount: number;
  etags: Record<number, string>;
};

export class UploadFailure extends Error {
  constructor(
    message: string,
    /** Where to continue from; null when the upload must start again. */
    public state: UploadState | null,
    /** True when trying again may work (connection, storage busy). */
    public retryable: boolean,
    public cancelled = false,
  ) {
    super(message);
  }
}

/** The real part sender: XMLHttpRequest, for upload progress events. */
export const sendPart: PartSender = (url, body, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      const etag = request.getResponseHeader('ETag');
      if (request.status >= 200 && request.status < 300 && etag) resolve(etag);
      else reject(new Error(`Part upload failed (${request.status}).`));
    };
    request.onerror = () => reject(new Error('Network error.'));
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.send(body);
  });

const STOPPED =
  'The upload stopped. Check your connection, then select Retry to continue.';
const isAbort = (error: unknown) =>
  (error as { name?: string })?.name === 'AbortError';
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function uploadFile(
  file: File,
  purpose: UploadPurpose,
  options: {
    state?: UploadState | null;
    onProgress?: (sent: number, total: number) => void;
    /** Called once every part has arrived and the server is checking. */
    onChecking?: () => void;
    signal?: AbortSignal;
    send?: PartSender;
    concurrency?: number;
    attempts?: number;
    wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<StaffAsset> {
  const send = options.send ?? sendPart;
  const wait = options.wait ?? sleep;
  const attempts = options.attempts ?? 3;
  const cancelled = (state: UploadState | null) =>
    new UploadFailure('Upload cancelled.', state, false, true);

  let state = options.state ?? null;
  if (!state) {
    try {
      const started = (
        await api<UploadStarted>('/staff/uploads', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            size: file.size,
            purpose,
          }),
          signal: options.signal,
        })
      ).data;
      state = {
        assetId: started.asset.id,
        partSize: started.partSize,
        partCount: started.partCount,
        etags: {},
      };
    } catch (error) {
      if (options.signal?.aborted) throw cancelled(null);
      if (error instanceof ApiError)
        throw new UploadFailure(
          error.fieldErrors?.file ?? error.message,
          null,
          error.status === 0 || error.status >= 500,
        );
      throw new UploadFailure(STOPPED, null, true);
    }
  }
  const current = state;

  // Progress: bytes of finished parts plus what is in flight.
  const sizeOf = (n: number) =>
    Math.min(current.partSize, file.size - (n - 1) * current.partSize);
  const inFlight = new Map<number, number>();
  const report = () => {
    let sent = 0;
    for (const n of Object.keys(current.etags)) sent += sizeOf(Number(n));
    for (const loaded of inFlight.values()) sent += loaded;
    options.onProgress?.(Math.min(sent, file.size), file.size);
  };
  report();

  const queue = Array.from(
    { length: current.partCount },
    (_, i) => i + 1,
  ).filter((n) => !current.etags[n]);
  let failure: UploadFailure | null = null;

  async function sendOne(n: number) {
    const start = (n - 1) * current.partSize;
    const body = file.slice(start, start + sizeOf(n));
    for (let attempt = 1; ; attempt++) {
      try {
        // A fresh URL each attempt: an old one may have expired.
        const { urls } = (
          await api<{ urls: { partNumber: number; url: string }[] }>(
            `/staff/uploads/${current.assetId}/parts`,
            {
              method: 'POST',
              body: JSON.stringify({ partNumbers: [n] }),
              signal: options.signal,
            },
          )
        ).data;
        const etag = await send(
          urls[0]!.url,
          body,
          (loaded) => {
            inFlight.set(n, loaded);
            report();
          },
          options.signal,
        );
        inFlight.delete(n);
        current.etags[n] = etag;
        report();
        return;
      } catch (error) {
        inFlight.delete(n);
        report();
        if (options.signal?.aborted || isAbort(error)) throw cancelled(current);
        // The server refused (upload finished or stopped): don't retry.
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        )
          throw new UploadFailure(error.message, null, false);
        if (attempt >= attempts)
          throw new UploadFailure(STOPPED, current, true);
        await wait(1000 * 2 ** (attempt - 1));
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(options.concurrency ?? 3, queue.length) },
    async () => {
      while (queue.length && !failure) {
        const n = queue.shift()!;
        try {
          await sendOne(n);
        } catch (error) {
          failure ??=
            error instanceof UploadFailure
              ? error
              : new UploadFailure(STOPPED, current, true);
        }
      }
    },
  );
  await Promise.all(workers);
  if (failure) throw failure;

  options.onChecking?.();
  try {
    return (
      await api<StaffAsset>(`/staff/uploads/${current.assetId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          parts: Object.entries(current.etags).map(([n, etag]) => ({
            partNumber: Number(n),
            etag,
          })),
        }),
        signal: options.signal,
      })
    ).data;
  } catch (error) {
    if (options.signal?.aborted) throw cancelled(current);
    if (error instanceof ApiError) {
      if (error.code === 'UPLOAD_INCOMPLETE')
        // Send every part again on Retry; storage didn't accept them.
        throw new UploadFailure(error.message, { ...current, etags: {} }, true);
      if (error.status === 0 || error.status >= 500)
        throw new UploadFailure(STOPPED, current, true);
      throw new UploadFailure(
        error.fieldErrors?.file ?? error.message,
        null,
        false,
      );
    }
    throw new UploadFailure(STOPPED, current, true);
  }
}

/** Cancels an upload on the server (best effort; storage also expires it). */
export async function cancelUpload(assetId: string) {
  try {
    await api(`/staff/uploads/${assetId}`, { method: 'DELETE' });
  } catch {
    /* Unfinished uploads are discarded by storage after a day anyway. */
  }
}
