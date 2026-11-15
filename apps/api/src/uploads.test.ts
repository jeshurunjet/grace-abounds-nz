// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';
import { buildApp } from './app.js';
import { setStorage } from './lib/storage.js';
import { MemoryStorage } from './lib/storage-memory.js';
import { STORAGE_REMOVE, storageRemover } from './lib/assets.js';
import { drainOutbox } from './lib/outbox.js';
import { CONTENT_CHANGED } from './lib/content-change.js';
import { publicSermons } from './routes/sermons.js';

/*
 * Phase 2D verified uploads, against an in-memory store (no network):
 * - only Pastor and Admin upload; members never do;
 * - a file is checked (size, first bytes) before it is served, and refused
 *   programs or mismatched types are never served to anyone;
 * - who may open a file comes from what refers to it: a published library
 *   item (public or members), or a sermon the Pastor approved;
 * - files in use are not deleted; removing a library item removes its file
 *   after the change commits.
 */

const MB = 1024 * 1024;
const bytes = (head: number[] | string, total = 2048) => {
  const out = new Uint8Array(total);
  const start =
    typeof head === 'string'
      ? [...head].map((char) => char.charCodeAt(0))
      : head;
  out.set(start);
  return out;
};
const PDF = bytes('%PDF-1.7\n');
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04]);
const EXE = bytes('MZ\x90\x00');
const MP4 = bytes(
  [0, 0, 0, 0x18, ...'ftypmp42'].map((c) =>
    typeof c === 'string' ? c.charCodeAt(0) : c,
  ),
);

/** Real media made with ffmpeg (packages/validation/fixtures/media). */
const media = (name: string) =>
  new Uint8Array(
    readFileSync(
      join(__dirname, '../../../packages/validation/fixtures/media', name),
    ),
  );

const resource = {
  title: 'Guide',
  description: '',
  type: 'PDF',
  url: '',
  sermonId: null,
  folderId: null,
  visibility: 'members',
  status: 'published',
};
const sermon = {
  title: 'Walking in the Spirit',
  series: '',
  speaker: 'Pastor Example',
  date: '2026-10-04',
  duration: '45 min',
  image: '',
  summary: '',
  mediaUrl: '',
};

describe.skipIf(!dbTestsEnabled)('verified uploads (PostgreSQL)', () => {
  const app = buildApp();
  let storage: MemoryStorage;
  beforeAll(() => app.ready());
  beforeEach(async () => {
    await resetIdentityTables();
    storage = new MemoryStorage();
    setStorage(storage);
  });
  afterAll(async () => {
    setStorage(undefined);
    await app.close();
    await prisma.$disconnect();
  });

  async function as(role: 'MEMBER' | 'ADMIN' | 'PASTOR') {
    const user = await createUser({ role });
    const session = await createSession(user.id);
    const token = await new SignJWT({ sid: session.id, sv: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('grace-web')
      .setAudience('grace-api')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode(process.env.API_ASSERTION_SECRET!));
    return { user, headers: { authorization: `Bearer ${token}` } };
  }
  type Who = Awaited<ReturnType<typeof as>>;
  const call = (
    method: string,
    url: string,
    who?: Who,
    version?: number,
    body?: unknown,
  ) =>
    app.inject({
      method: method as never,
      url,
      headers: {
        ...who?.headers,
        ...(version !== undefined && { 'if-match': `"${version}"` }),
      },
      ...(body !== undefined && { payload: body as never }),
    });

  /** Starts an upload and sends its parts the way the browser does. */
  async function send(
    who: Who,
    fileName: string,
    content: Uint8Array,
    purpose: 'library' | 'sermon' = 'library',
    declared = content.length,
  ) {
    const started = await call('POST', '/v1/staff/uploads', who, undefined, {
      fileName,
      size: declared,
      purpose,
    });
    expect(started.statusCode).toBe(201);
    const { asset, partSize, partCount } = started.json().data;
    const parts: { partNumber: number; etag: string }[] = [];
    for (let n = 1; n <= partCount; n++) {
      const urls = await call(
        'POST',
        `/v1/staff/uploads/${asset.id}/parts`,
        who,
        undefined,
        { partNumbers: [n] },
      );
      const url = new URL(urls.json().data.urls[0].url);
      const etag = storage.putPart(
        url.host,
        n,
        content.slice((n - 1) * partSize, n * partSize),
      );
      parts.push({ partNumber: n, etag });
    }
    return { id: asset.id as string, parts };
  }
  async function upload(
    who: Who,
    fileName: string,
    content: Uint8Array,
    purpose: 'library' | 'sermon' = 'library',
  ) {
    const { id, parts } = await send(who, fileName, content, purpose);
    const done = await call(
      'POST',
      `/v1/staff/uploads/${id}/complete`,
      who,
      undefined,
      { parts },
    );
    return { id, done };
  }
  const open = (id: string, who?: Who, query = '') =>
    call('GET', `/v1/files/${id}${query}`, who);

  it('checks a file, moves it out of incoming/ and serves it only through its library item', async () => {
    const [admin, member] = [await as('ADMIN'), await as('MEMBER')];
    const { id, done } = await upload(admin, 'Study guide.pdf', PDF);
    expect(done.statusCode).toBe(200);
    expect(done.json().data).toMatchObject({
      status: 'verified',
      contentType: 'application/pdf',
      inline: true,
      href: `/api/v1/files/${id}`,
    });
    const row = (await prisma.asset.findUnique({ where: { id } }))!;
    expect(row.storageKey).toBe(`files/library/${id}/Study-guide.pdf`);
    expect([...storage.objects.keys()]).toEqual([row.storageKey]);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'files.upload_verified', entityId: id },
      }),
    ).toBe(1);

    // Not referenced yet: nobody but staff can open it.
    expect((await open(id)).statusCode).toBe(404);
    expect((await open(id, member)).statusCode).toBe(404);
    expect((await open(id, admin)).statusCode).toBe(302);

    // A draft library item still keeps it private.
    const draft = await call('POST', '/v1/staff/resources', admin, undefined, {
      ...resource,
      assetId: id,
      status: 'draft',
    });
    expect(draft.statusCode).toBe(201);
    expect((await open(id, member)).statusCode).toBe(404);

    // Published for members: members open it; signed-out visitors sign in.
    const itemId = draft.json().data.id;
    await call('PATCH', `/v1/staff/resources/${itemId}`, admin, 1, {
      ...resource,
      assetId: id,
    });
    const opened = await open(id, member);
    expect(opened.statusCode).toBe(302);
    expect(opened.headers.location).toContain('disposition=inline');
    expect(opened.headers.location).toContain('expires=300');
    expect(opened.headers['cache-control']).toBe('private, no-store');
    expect((await open(id)).statusCode).toBe(401);
    const library = (await call('GET', '/v1/member/library', member)).json()
      .data.resources;
    expect(library[0].href).toBe(`/api/v1/files/${id}`);

    // ?download asks for an attachment.
    expect((await open(id, member, '?download=1')).headers.location).toContain(
      'disposition=attachment',
    );

    // Public: anyone.
    await call('PATCH', `/v1/staff/resources/${itemId}`, admin, 2, {
      ...resource,
      assetId: id,
      visibility: 'public',
    });
    expect((await open(id)).statusCode).toBe(302);
  });

  it('serves other file types as downloads only', async () => {
    const admin = await as('ADMIN');
    const { id, done } = await upload(admin, 'Roster.xlsx', ZIP);
    expect(done.json().data).toMatchObject({
      contentType: 'application/octet-stream',
      inline: false,
    });
    await open(id, admin);
    expect(storage.lastDownload).toMatchObject({
      disposition: 'attachment',
      contentType: 'application/octet-stream',
      fileName: 'Roster.xlsx',
    });
  });

  it('refuses programs, videos and mismatched types, and never serves them', async () => {
    const admin = await as('ADMIN');
    for (const [fileName, purpose] of [
      ['setup.exe', 'library'],
      ['page.html', 'library'],
      ['clip.mp4', 'library'],
      ['notes.pdf', 'sermon'],
    ] as const) {
      const response = await call(
        'POST',
        '/v1/staff/uploads',
        admin,
        undefined,
        {
          fileName,
          size: 1000,
          purpose,
        },
      );
      expect(response.statusCode).toBe(422);
      expect(response.json().error.fieldErrors.file).toBeTruthy();
    }
    expect(await prisma.asset.count()).toBe(0);

    for (const [fileName, content] of [
      ['notes.pdf', EXE], // a program renamed
      ['photo.png', PDF], // contents don't match the name
      ['service.dat', MP4], // a video under another name
    ] as const) {
      const { id, done } = await upload(admin, fileName, content);
      expect(done.statusCode).toBe(422);
      expect(done.json().error.code).toBe('FILE_REJECTED');
      const row = (await prisma.asset.findUnique({ where: { id } }))!;
      expect(row.status).toBe('REJECTED');
      expect(storage.objects.has(row.storageKey)).toBe(false);
      // Not even staff can open a refused file.
      expect((await open(id, admin)).statusCode).toBe(404);
    }
    expect(
      await prisma.auditEvent.count({
        where: { action: 'files.upload_rejected' },
      }),
    ).toBe(3);
  });

  it('members cannot upload, and uploads are unavailable without storage', async () => {
    const [admin, member] = [await as('ADMIN'), await as('MEMBER')];
    const body = { fileName: 'a.pdf', size: 10, purpose: 'library' };
    expect(
      (await call('POST', '/v1/staff/uploads', member, undefined, body))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('GET', '/v1/staff/uploads/status', member)).statusCode,
    ).toBe(403);
    expect(
      (await call('GET', '/v1/staff/uploads/status', admin)).json().data
        .available,
    ).toBe(true);

    setStorage(null);
    const response = await call(
      'POST',
      '/v1/staff/uploads',
      admin,
      undefined,
      body,
    );
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('UPLOADS_UNAVAILABLE');
    expect(
      (await call('GET', '/v1/staff/uploads/status', admin)).json().data
        .available,
    ).toBe(false);
    expect(await prisma.asset.count()).toBe(0);
  });

  it('only the uploader continues an upload; parts and size are checked', async () => {
    const [admin, other] = [await as('ADMIN'), await as('PASTOR')];
    const big = bytes('%PDF-1.7\n', 10 * MB + 5);
    const { id, parts } = await send(admin, 'big.pdf', big);
    expect(parts).toHaveLength(2);

    expect(
      (
        await call('POST', `/v1/staff/uploads/${id}/parts`, other, undefined, {
          partNumbers: [1],
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call('POST', `/v1/staff/uploads/${id}/parts`, admin, undefined, {
          partNumbers: [3],
        })
      ).statusCode,
    ).toBe(422);
    const missing = await call(
      'POST',
      `/v1/staff/uploads/${id}/complete`,
      admin,
      undefined,
      { parts: parts.slice(0, 1) },
    );
    expect(missing.statusCode).toBe(409);
    expect(missing.json().error.code).toBe('UPLOAD_INCOMPLETE');

    // A wrong ETag (a part that never arrived) can be sent again.
    const wrong = await call(
      'POST',
      `/v1/staff/uploads/${id}/complete`,
      admin,
      undefined,
      { parts: [parts[0], { partNumber: 2, etag: '"nope"' }] },
    );
    expect(wrong.statusCode).toBe(409);
    const done = await call(
      'POST',
      `/v1/staff/uploads/${id}/complete`,
      admin,
      undefined,
      { parts },
    );
    expect(done.statusCode).toBe(200);

    // Declared bigger than what arrived: refused.
    const short = await send(
      admin,
      'short.pdf',
      PDF,
      'library',
      PDF.length + 1,
    );
    const refused = await call(
      'POST',
      `/v1/staff/uploads/${short.id}/complete`,
      admin,
      undefined,
      { parts: short.parts },
    );
    expect(refused.statusCode).toBe(422);
  });

  it('completing is safe to retry after a storage failure', async () => {
    const admin = await as('ADMIN');
    const { id, parts } = await send(admin, 'guide.pdf', PDF);
    storage.failNext = true;
    const failed = await call(
      'POST',
      `/v1/staff/uploads/${id}/complete`,
      admin,
      undefined,
      { parts },
    );
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.code).toBe('STORAGE_UNAVAILABLE');
    const retried = await call(
      'POST',
      `/v1/staff/uploads/${id}/complete`,
      admin,
      undefined,
      { parts },
    );
    expect(retried.statusCode).toBe(200);
    expect(retried.json().data.status).toBe('verified');

    // An outage when starting leaves nothing behind.
    storage.failNext = true;
    const start = await call('POST', '/v1/staff/uploads', admin, undefined, {
      fileName: 'b.pdf',
      size: 10,
      purpose: 'library',
    });
    expect(start.statusCode).toBe(502);
    expect(await prisma.asset.count()).toBe(1);
  });

  it('cancelling stops the upload in storage', async () => {
    const admin = await as('ADMIN');
    const { id } = await send(admin, 'guide.pdf', PDF);
    const uploadId = (await prisma.asset.findUnique({ where: { id } }))!
      .uploadId;
    expect(
      (await call('DELETE', `/v1/staff/uploads/${id}`, admin)).statusCode,
    ).toBe(204);
    expect(storage.aborted).toEqual([uploadId]);
    expect(await prisma.asset.count()).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'files.upload_cancelled' },
      }),
    ).toBe(1);
  });

  it('a sermon recording stays staff-only until the Pastor approves the sermon', async () => {
    const [admin, pastor, member] = [
      await as('ADMIN'),
      await as('PASTOR'),
      await as('MEMBER'),
    ];
    const { id, done } = await upload(admin, 'Sunday.mp4', MP4, 'sermon');
    expect(done.json().data).toMatchObject({
      purpose: 'sermon',
      contentType: 'video/mp4',
      inline: true,
    });
    expect(
      (await prisma.asset.findUnique({ where: { id } }))!.storageKey,
    ).toMatch(/^files\/sermons\//);

    // A recording can't go into the library, and a library file can't be
    // a recording; a sermon can't have both an upload and a link.
    expect(
      (
        await call('POST', '/v1/staff/resources', admin, undefined, {
          ...resource,
          assetId: id,
        })
      ).json().error.fieldErrors.assetId,
    ).toBeTruthy();
    const pdf = await upload(admin, 'notes.pdf', PDF);
    expect(
      (
        await call('POST', '/v1/staff/sermons', admin, undefined, {
          ...sermon,
          mediaAssetId: pdf.id,
        })
      ).json().error.fieldErrors.mediaAssetId,
    ).toBeTruthy();
    expect(
      (
        await call('POST', '/v1/staff/sermons', admin, undefined, {
          ...sermon,
          mediaAssetId: id,
          mediaUrl: 'https://media.example.org/a.mp4',
        })
      ).statusCode,
    ).toBe(422);

    const created = await call('POST', '/v1/staff/sermons', admin, undefined, {
      ...sermon,
      mediaAssetId: id,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.mediaFile).toEqual({
      fileName: 'Sunday.mp4',
      size: MP4.length,
    });
    const sermonId = created.json().data.id;

    // Before approval: staff can play it; nobody else can.
    expect((await open(id)).statusCode).toBe(404);
    expect((await open(id, member)).statusCode).toBe(404);
    const staffPlay = await open(id, pastor);
    expect(staffPlay.statusCode).toBe(302);
    // Playback links outlast a service; downloads stay short.
    expect(staffPlay.headers.location).toContain('expires=14400');

    await call('POST', `/v1/staff/sermons/${sermonId}/submit`, admin, 1);
    expect((await open(id)).statusCode).toBe(404);
    const approved = await call(
      'POST',
      `/v1/staff/sermons/${sermonId}/approve`,
      pastor,
      2,
    );
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.live.mediaAssetId).toBe(id);
    expect((await open(id)).statusCode).toBe(302);
    expect((await publicSermons())[0]!.mediaAssetId).toBe(id);

    // Taken down: private again.
    await call('POST', `/v1/staff/sermons/${sermonId}/unpublish`, pastor, 3);
    expect((await open(id)).statusCode).toBe(404);
  });

  it('files in use are kept; deleting a library item removes its file after commit', async () => {
    const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
    const { id } = await upload(admin, 'guide.pdf', PDF);
    const key = (await prisma.asset.findUnique({ where: { id } }))!.storageKey;
    const item = await call('POST', '/v1/staff/resources', admin, undefined, {
      ...resource,
      assetId: id,
      status: 'draft',
    });
    const inUse = await call('DELETE', `/v1/staff/uploads/${id}`, admin);
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json().error.code).toBe('IN_USE');

    expect(
      (
        await call(
          'DELETE',
          `/v1/staff/resources/${item.json().data.id}`,
          admin,
          1,
        )
      ).statusCode,
    ).toBe(204);
    expect(await prisma.asset.count({ where: { id } })).toBe(0);
    // The stored object goes once the outbox runs (after the commit).
    expect(storage.objects.has(key)).toBe(true);
    await drainOutbox({
      [STORAGE_REMOVE]: storageRemover(),
      [CONTENT_CHANGED]: async () => undefined,
    });
    expect(storage.objects.has(key)).toBe(false);

    // A recording the Pastor approved stays while the live copy uses it,
    // even after the working copy drops it.
    const recording = await upload(admin, 'Sunday.mp4', MP4, 'sermon');
    const created = (
      await call('POST', '/v1/staff/sermons', admin, undefined, {
        ...sermon,
        mediaAssetId: recording.id,
      })
    ).json().data;
    await call('POST', `/v1/staff/sermons/${created.id}/submit`, admin, 1);
    await call('POST', `/v1/staff/sermons/${created.id}/approve`, pastor, 2);
    await call('PATCH', `/v1/staff/sermons/${created.id}`, admin, 3, {
      ...sermon,
      mediaUrl: 'https://media.example.org/other.mp4',
    });
    const kept = await call(
      'DELETE',
      `/v1/staff/uploads/${recording.id}`,
      admin,
    );
    expect(kept.statusCode).toBe(409);
  });

  // Codex Phase 2D review [P1]: a video renamed .m4a (or carrying an audio
  // brand) must not become a library file an Admin can publish.
  it('a real video renamed .m4a is refused and cannot be published from the library', async () => {
    const [admin, member] = [await as('ADMIN'), await as('MEMBER')];
    for (const name of ['video.mp4', 'video-m4a-brand.m4a', 'video.mov']) {
      const { id, done } = await upload(admin, 'Sunday clip.m4a', media(name));
      expect(done.statusCode).toBe(422);
      expect(done.json().error.code).toBe('FILE_REJECTED');
      expect(done.json().error.message).toMatch(/Sermons & videos/);
      expect((await prisma.asset.findUnique({ where: { id } }))!.status).toBe(
        'REJECTED',
      );
      const publish = await call(
        'POST',
        '/v1/staff/resources',
        admin,
        undefined,
        {
          ...resource,
          assetId: id,
        },
      );
      expect(publish.statusCode).toBe(422);
      expect(publish.json().error.fieldErrors.assetId).toBeTruthy();
      expect((await open(id, member)).statusCode).toBe(404);
    }
    expect(await prisma.resource.count()).toBe(0);

    // The track list was found with small ranged reads, even at the end.
    const reads = storage.reads.filter((read) => read.start > 0);
    expect(reads.length).toBeGreaterThan(0);
    expect(Math.max(...reads.map((read) => read.length))).toBeLessThan(4096);
  });

  it('real audio-only M4A files are accepted and open for members once published', async () => {
    const [admin, member] = [await as('ADMIN'), await as('MEMBER')];
    for (const name of ['audio.m4a', 'audio-isom.m4a']) {
      const { id, done } = await upload(admin, 'Podcast.m4a', media(name));
      expect(done.statusCode).toBe(200);
      expect(done.json().data).toMatchObject({
        contentType: 'audio/mp4',
        inline: true,
      });
      const item = await call('POST', '/v1/staff/resources', admin, undefined, {
        ...resource,
        assetId: id,
      });
      expect(item.statusCode).toBe(201);
      expect((await open(id, member)).statusCode).toBe(302);
    }
    // A sermon recording may still be any real video.
    const recording = await upload(
      admin,
      'Sunday.m4v',
      media('video.mp4'),
      'sermon',
    );
    expect(recording.done.statusCode).toBe(200);
  });

  // Codex Phase 2D review [P2]: completion succeeded but the response was
  // lost; Retry must get the same verified file back.
  it('completing again after a lost response returns the same verified file', async () => {
    const [admin, other] = [await as('ADMIN'), await as('PASTOR')];
    const { id, parts } = await send(admin, 'guide.pdf', PDF);
    const complete = (who: Who) =>
      call('POST', `/v1/staff/uploads/${id}/complete`, who, undefined, {
        parts,
      });
    const first = await complete(admin);
    expect(first.statusCode).toBe(200);
    const objects = [...storage.objects.keys()];
    const reads = storage.reads.length;

    const again = await complete(admin);
    expect(again.statusCode).toBe(200);
    expect(again.json().data).toEqual(first.json().data);
    // Nothing was read, copied or audited a second time.
    expect([...storage.objects.keys()]).toEqual(objects);
    expect(storage.reads.length).toBe(reads);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'files.upload_verified', entityId: id },
      }),
    ).toBe(1);

    // Still refused for anyone else, and parts stay pending-only.
    expect((await complete(other)).statusCode).toBe(404);
    const parts2 = await call(
      'POST',
      `/v1/staff/uploads/${id}/parts`,
      admin,
      undefined,
      { partNumbers: [1] },
    );
    expect(parts2.statusCode).toBe(409);
    expect(parts2.json().error.code).toBe('UPLOAD_FINISHED');
  });

  it('a repeated completion of a refused or cancelled upload stays refused', async () => {
    const admin = await as('ADMIN');
    const refused = await send(admin, 'notes.pdf', EXE);
    const body = { parts: refused.parts };
    const url = `/v1/staff/uploads/${refused.id}/complete`;
    const first = await call('POST', url, admin, undefined, body);
    expect(first.statusCode).toBe(422);
    const again = await call('POST', url, admin, undefined, body);
    expect(again.statusCode).toBe(422);
    expect(again.json().error.message).toBe(first.json().error.message);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'files.upload_rejected', entityId: refused.id },
      }),
    ).toBe(1);

    const cancelled = await send(admin, 'guide.pdf', PDF);
    await call('DELETE', `/v1/staff/uploads/${cancelled.id}`, admin);
    expect(
      (
        await call(
          'POST',
          `/v1/staff/uploads/${cancelled.id}/complete`,
          admin,
          undefined,
          { parts: cancelled.parts },
        )
      ).statusCode,
    ).toBe(404);
  });
});
