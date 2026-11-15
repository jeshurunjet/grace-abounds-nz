import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFile, UploadFailure, type PartSender } from './uploader';

/*
 * Browser upload engine (Phase 2D): parts go straight to storage with their
 * own presigned URLs; a failing part is retried, a stopped upload resumes
 * from the parts that arrived, and the server's refusal is final.
 */

const MB = 1024 * 1024;
type Call = { method: string; url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let completeResponse: { status: number; body: unknown };

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
const asset = {
  id: 'a1',
  fileName: 'Sunday.mp4',
  size: 25 * MB,
  contentType: 'video/mp4',
  purpose: 'sermon',
  inline: true,
  status: 'verified',
  rejectReason: '',
  href: '/api/v1/files/a1',
  createdAt: '2026-11-15T00:00:00.000Z',
};

beforeEach(() => {
  calls = [];
  completeResponse = { status: 200, body: { data: asset } };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init?.method ?? 'GET', url, body });
      if (url === '/api/v1/staff/uploads')
        return json(201, {
          data: {
            asset: { ...asset, status: 'pending' },
            partSize: 10 * MB,
            partCount: 3,
          },
        });
      if (url.endsWith('/parts'))
        return json(200, {
          data: {
            urls: body.partNumbers.map((n: number) => ({
              partNumber: n,
              url: `https://storage.test/part-${n}`,
            })),
          },
        });
      if (url.endsWith('/complete'))
        return json(completeResponse.status, completeResponse.body);
      return json(404, {});
    }),
  );
});

const file = () =>
  new File([new Uint8Array(25 * MB)], 'Sunday.mp4', { type: 'video/mp4' });
const noWait = () => Promise.resolve();

describe('uploadFile', () => {
  it('sends every part straight to storage, reports progress, then asks the server to check it', async () => {
    const sent: { url: string; size: number }[] = [];
    const send: PartSender = async (url, body, onProgress) => {
      onProgress(body.size / 2);
      sent.push({ url, size: body.size });
      return `"etag-${url.slice(-1)}"`;
    };
    const progress: number[] = [];
    let checking = false;
    const result = await uploadFile(file(), 'sermon', {
      send,
      concurrency: 1,
      onProgress: (bytes) => progress.push(bytes),
      onChecking: () => (checking = true),
    });
    expect(result.status).toBe('verified');
    expect(checking).toBe(true);
    expect(sent).toEqual([
      { url: 'https://storage.test/part-1', size: 10 * MB },
      { url: 'https://storage.test/part-2', size: 10 * MB },
      { url: 'https://storage.test/part-3', size: 5 * MB },
    ]);
    expect(progress.at(-1)).toBe(25 * MB);
    expect(calls[0]).toMatchObject({
      url: '/api/v1/staff/uploads',
      body: { fileName: 'Sunday.mp4', size: 25 * MB, purpose: 'sermon' },
    });
    expect(calls.at(-1)).toMatchObject({
      url: '/api/v1/staff/uploads/a1/complete',
      body: {
        parts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' },
          { partNumber: 3, etag: '"etag-3"' },
        ],
      },
    });
  });

  it('retries a failing part with a fresh link', async () => {
    let failures = 1;
    const send: PartSender = async (url) => {
      if (url.endsWith('part-2') && failures-- > 0) throw new Error('reset');
      return `"etag-${url.slice(-1)}"`;
    };
    await uploadFile(file(), 'sermon', { send, concurrency: 1, wait: noWait });
    // Part 2 asked for a link twice.
    expect(
      calls.filter(
        (call) =>
          call.url.endsWith('/parts') &&
          (call.body?.partNumbers as number[])[0] === 2,
      ),
    ).toHaveLength(2);
  });

  it('stops after repeated failures, then Retry continues from the parts that arrived', async () => {
    const broken: PartSender = async (url) => {
      if (url.endsWith('part-3')) throw new Error('offline');
      return `"etag-${url.slice(-1)}"`;
    };
    const failure = await uploadFile(file(), 'sermon', {
      send: broken,
      concurrency: 1,
      attempts: 2,
      wait: noWait,
    }).catch((error) => error);
    expect(failure).toBeInstanceOf(UploadFailure);
    expect(failure.retryable).toBe(true);
    expect(failure.state.etags).toEqual({ 1: '"etag-1"', 2: '"etag-2"' });
    expect(calls.some((call) => call.url.endsWith('/complete'))).toBe(false);

    calls = [];
    const resent: string[] = [];
    await uploadFile(file(), 'sermon', {
      state: failure.state,
      send: async (url) => {
        resent.push(url);
        return '"etag-3"';
      },
    });
    // No new upload was started and only the missing part was sent.
    expect(calls.some((call) => call.url === '/api/v1/staff/uploads')).toBe(
      false,
    );
    expect(resent).toEqual(['https://storage.test/part-3']);
  });

  it('a file the server refuses is final, with the server’s reason', async () => {
    completeResponse = {
      status: 422,
      body: {
        error: {
          code: 'FILE_REJECTED',
          message: 'Programs, scripts and web pages can’t be uploaded.',
          fieldErrors: {
            file: 'Programs, scripts and web pages can’t be uploaded.',
          },
        },
      },
    };
    const failure = await uploadFile(file(), 'sermon', {
      send: async () => '"e"',
    }).catch((error) => error);
    expect(failure.retryable).toBe(false);
    expect(failure.state).toBeNull();
    expect(failure.message).toMatch(/can’t be uploaded/);
  });

  it('cancelling stops sending and says so', async () => {
    const controller = new AbortController();
    const failure = await uploadFile(file(), 'sermon', {
      signal: controller.signal,
      send: async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
    }).catch((error) => error);
    expect(failure.cancelled).toBe(true);
    expect(failure.state.assetId).toBe('a1');
  });
});
