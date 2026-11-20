// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { deflateSync } from 'node:zlib';
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
import { checkProfileImage, decodePng } from './lib/profile-image.js';
import {
  PHOTO_SWEEP_GRACE_MS,
  saveProfilePhoto,
  sweepProfilePhotos,
} from './lib/profile-photo.js';
import { allowDeletionExecutionForTests } from './lib/account-deletion.js';
import type { Actor } from './lib/identity.js';

/*
 * Phase 5: profile photos are private files only their owner can read,
 * saved explicitly by the server after checking the bytes (PNG or JPEG
 * only, bounded size and dimensions) and dropping metadata. Saving can't
 * finish for a revoked, suspended or deleted session; replaced, removed,
 * abandoned and deleted accounts' files are always cleaned up; nobody can
 * point their profile at another person's file or any other address.
 */

const SECRET = 'GPS-SECRET-LOCATION';
const DAY = 86_400_000;

// ---- Real, decodable PNGs, built here (no image library needed). ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
/** Deterministic, noisy pixels (like a photo, so filters matter). */
function noise(length: number, seed = 7) {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (state >> 16) & 0xff;
  }
  return out;
}
type PngOptions = {
  colour?: number;
  depth?: number;
  interlace?: number;
  /** Chunks before / after the image data. */
  before?: Buffer[];
  after?: Buffer[];
  /** Splits the image data with this chunk in between. */
  between?: Buffer;
  rows?: Buffer;
  trailing?: Buffer;
  firstFilter?: number;
};
function png(width: number, height: number, options: PngOptions = {}) {
  const colour = options.colour ?? 2;
  const channels = colour === 6 ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([options.depth ?? 8, colour, 0, 0, options.interlace ?? 0], 8);
  let rows = options.rows;
  if (!rows) {
    const pixels = noise(width * height * channels);
    rows = Buffer.alloc(height * (width * channels + 1));
    for (let y = 0; y < height; y++)
      rows.set(
        pixels.subarray(y * width * channels, (y + 1) * width * channels),
        y * (width * channels + 1) + 1,
      );
    if (options.firstFilter !== undefined) rows[0] = options.firstFilter;
  }
  const data = deflateSync(rows);
  const half = Math.floor(data.length / 2);
  const image = options.between
    ? [
        chunk('IDAT', data.subarray(0, half)),
        options.between,
        chunk('IDAT', data.subarray(half)),
      ]
    : [chunk('IDAT', data)];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    ...(options.before ?? []),
    ...image,
    ...(options.after ?? []),
    chunk('IEND', Buffer.alloc(0)),
    ...(options.trailing ? [options.trailing] : []),
  ]);
}
const text = (value: string) =>
  chunk('tEXt', Buffer.from(`Comment\0${value}`, 'binary'));
const dataUrl = (bytes: Buffer, label = 'image/png') =>
  `data:${label};base64,${bytes.toString('base64')}`;
const asText = (bytes: Uint8Array) => Buffer.from(bytes).toString('binary');

describe('profile photo decoding (no database)', () => {
  it('fully decodes, keeps every pixel and writes a fresh metadata-free PNG', () => {
    for (const colour of [2, 6]) {
      const input = png(96, 80, {
        colour,
        before: [text(SECRET), chunk('iCCP', Buffer.from(`icc\0\0${SECRET}`))],
        after: [chunk('eXIf', Buffer.from(SECRET))],
      });
      const checked = checkProfileImage(input);
      if (typeof checked === 'string') throw new Error(checked);
      expect(checked).toMatchObject({ width: 96, height: 80 });
      expect(asText(checked.bytes)).not.toContain(SECRET);
      const before = decodePng(new Uint8Array(input));
      const after = decodePng(checked.bytes);
      expect(after.channels).toBe(colour === 6 ? 4 : 3);
      expect(Buffer.from(after.pixels).equals(Buffer.from(before.pixels))).toBe(
        true,
      );
      // The rewritten file decodes again to the same pixels (all filters).
      const again = checkProfileImage(checked.bytes);
      if (typeof again === 'string') throw new Error(again);
      expect(Buffer.from(decodePng(again.bytes).pixels)).toEqual(
        Buffer.from(before.pixels),
      );
    }
  });

  it('accepts the picker’s own size within the upload limit', () => {
    const input = png(384, 384, { colour: 6 });
    expect(input.length).toBeLessThan(700 * 1024);
    expect(typeof checkProfileImage(input)).toBe('object');
  });

  it('refuses damaged or malformed data', () => {
    const damaged = (bytes: Buffer) =>
      expect(checkProfileImage(bytes)).toBe(
        'This photo is damaged. Choose it again.',
      );
    const good = png(64, 64);
    const badCrc = Buffer.from(good);
    badCrc[29] = badCrc[29]! ^ 0xff; // flips the IHDR checksum
    damaged(badCrc);
    damaged(good.subarray(0, good.length - 20)); // truncated
    damaged(png(64, 64, { between: text('x') })); // image data split
    damaged(png(64, 64, { trailing: Buffer.from('more') })); // after the end
    damaged(png(64, 64, { firstFilter: 5 })); // no such row filter
    damaged(png(64, 64, { rows: Buffer.alloc(100) })); // too little data
    // A decompression bomb: tiny declared image, huge inflated data.
    const bomb = png(64, 64, { rows: Buffer.alloc(10 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(64 * 1024);
    damaged(bomb);
    // Image data before the header.
    const ihdrEnd = 8 + 25;
    damaged(
      Buffer.concat([
        good.subarray(0, 8),
        good.subarray(ihdrEnd, good.length - 12),
        good.subarray(8, ihdrEnd),
        good.subarray(good.length - 12),
      ]),
    );
  });

  it('refuses every other format and PNG mode clearly', () => {
    const unsupported = (bytes: Buffer) =>
      expect(checkProfileImage(bytes)).toMatch(/isn’t supported/);
    unsupported(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(80)])); // JPEG
    unsupported(Buffer.from('GIF89a' + '\0'.repeat(80), 'binary'));
    unsupported(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(80)),
    );
    unsupported(
      Buffer.from('<html><script>alert(1)</script>' + ' '.repeat(80)),
    );
    unsupported(png(64, 64, { depth: 16 }));
    unsupported(png(64, 64, { interlace: 1 }));
    unsupported(
      png(64, 64, {
        colour: 3,
        before: [chunk('PLTE', Buffer.alloc(3))],
        rows: Buffer.alloc(64 * 65),
      }),
    );
    unsupported(png(64, 64, { before: [chunk('ZZZZ', Buffer.alloc(4))] }));
    expect(checkProfileImage(png(32, 32))).toMatch(/between 64 and 1024/);
    expect(checkProfileImage(Buffer.alloc(700 * 1024 + 1))).toMatch(
      /too large/,
    );
  });
});

describe.skipIf(!dbTestsEnabled)('profile photos (PostgreSQL)', () => {
  const app = buildApp();
  let storage: MemoryStorage;
  beforeAll(() => app.ready());
  beforeEach(async () => {
    await resetIdentityTables();
    allowDeletionExecutionForTests(false);
    storage = new MemoryStorage();
    setStorage(storage);
  });
  afterEach(() => {
    allowDeletionExecutionForTests(false);
    setStorage(undefined);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function as(role: 'MEMBER' | 'ADMIN' | 'PASTOR' = 'MEMBER') {
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
    const actor: Actor = {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
      authenticatedAt: session.authenticatedAt,
    };
    return {
      user,
      session,
      actor,
      headers: { authorization: `Bearer ${token}` },
    };
  }
  type Who = Awaited<ReturnType<typeof as>>;
  const call = (method: string, url: string, who?: Who, body?: unknown) =>
    app.inject({
      method: method as never,
      url,
      headers: { ...who?.headers },
      ...(body !== undefined && { payload: body as never }),
    });
  const save = (
    who: Who,
    bytes: Buffer = png(384, 384, { before: [text(SECRET)] }),
    label?: string,
  ) => call('PUT', '/v1/me/photo', who, { image: dataUrl(bytes, label) });
  const idOf = (path: string) => path.split('/').at(-1)!;
  async function drainRemovals() {
    const events = await prisma.outboxEvent.findMany({
      where: { topic: STORAGE_REMOVE, processedAt: null },
    });
    await storageRemover()(
      events.map((event) => ({
        id: event.id,
        topic: event.topic,
        payload: event.payload,
        attempts: event.attempts,
      })),
    );
    await prisma.outboxEvent.updateMany({
      where: { id: { in: events.map((event) => event.id) } },
      data: { processedAt: new Date() },
    });
  }
  const avatars = () =>
    [...storage.objects.keys()].filter((key) => key.startsWith('avatars/'));

  it('the profile can’t be pointed at another file or address', async () => {
    const anna = await as();
    for (const image of [
      'https://evil.example/x.png',
      '/api/v1/me/photo/someone-else',
      null,
    ]) {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/me',
        headers: { ...anna.headers, 'if-match': '"1"' },
        payload: { image },
      });
      expect(response.statusCode).toBe(422);
    }
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: anna.user.id } }))
        .image,
    ).toBeNull();
  });

  it('saves a checked, cleaned private photo that only its owner can open', async () => {
    const [anna, ben, pastor] = [await as(), await as(), await as('PASTOR')];
    const saved = await save(anna);
    expect(saved.statusCode).toBe(200);
    const path = saved.json().data.image as string;
    expect(path).toMatch(/^\/api\/v1\/me\/photo\/[\w-]+$/);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: anna.user.id } }))
        .image,
    ).toBe(path);
    const id = idOf(path);
    const key = `avatars/${anna.user.id}/${id}.png`;
    const stored = storage.objects.get(key)!;
    expect(stored.contentType).toBe('image/png');
    // The stored copy was decoded and written afresh: no metadata.
    expect(decodePng(stored.bytes)).toMatchObject({ width: 384, height: 384 });
    expect(Buffer.from(stored.bytes).toString('binary')).not.toContain(SECRET);

    const own = await call('GET', `/v1/me/photo/${id}`, anna);
    expect(own.statusCode).toBe(200);
    expect(own.headers['content-type']).toBe('image/png');
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(own.headers['cache-control']).toContain('no-store');
    expect(Buffer.from(own.rawPayload)).toEqual(Buffer.from(stored.bytes));
    // Nobody else, staff included; not through staff files either.
    expect((await call('GET', `/v1/me/photo/${id}`, ben)).statusCode).toBe(404);
    expect((await call('GET', `/v1/me/photo/${id}`, pastor)).statusCode).toBe(
      404,
    );
    expect((await call('GET', `/v1/me/photo/${id}`)).statusCode).toBe(401);
    expect((await call('GET', `/v1/files/${id}`, pastor)).statusCode).toBe(404);
    expect((await call('GET', '/v1/me/photo/guessed', anna)).statusCode).toBe(
      404,
    );
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'profile.photo_saved' },
    });
    expect(audit.metadata).toMatchObject({ photoId: id, type: 'image/png' });
  });

  it('refuses unsupported or unsafe uploads and stores nothing', async () => {
    const anna = await as();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const jpegBytes = Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      ...Buffer.alloc(80),
    ]);
    for (const body of [
      { image: dataUrl(svg, 'image/svg+xml') },
      { image: dataUrl(svg) }, // labelled PNG, really SVG
      { image: dataUrl(jpegBytes) }, // labelled PNG, really JPEG
      { image: dataUrl(jpegBytes, 'image/jpeg') },
      { image: dataUrl(png(32, 32)) },
      { image: dataUrl(png(64, 64, { firstFilter: 9 })) }, // damaged rows
      { image: 'https://example.com/photo.jpg' },
      { image: dataUrl(png(128, 128)), extra: true },
    ]) {
      const response = await call('PUT', '/v1/me/photo', anna, body);
      expect(response.statusCode).toBe(422);
    }
    expect(avatars()).toEqual([]);
    expect(await prisma.profilePhoto.count()).toBe(0);
  });

  it('replacing or removing a photo cleans up the old file', async () => {
    const anna = await as();
    const first = idOf((await save(anna)).json().data.image);
    const second = (await save(anna, png(256, 256))).json().data
      .image as string;
    expect((await call('GET', `/v1/me/photo/${first}`, anna)).statusCode).toBe(
      404,
    );
    await drainRemovals();
    expect(avatars()).toEqual([`avatars/${anna.user.id}/${idOf(second)}.png`]);

    expect((await call('DELETE', '/v1/me/photo', anna)).statusCode).toBe(204);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: anna.user.id } }))
        .image,
    ).toBeNull();
    expect(
      (await call('GET', `/v1/me/photo/${idOf(second)}`, anna)).statusCode,
    ).toBe(404);
    await drainRemovals();
    expect(avatars()).toEqual([]);
    // Removing again is fine.
    expect((await call('DELETE', '/v1/me/photo', anna)).statusCode).toBe(204);
  });

  it('a session revoked or an account suspended mid-save keeps the current photo; the upload is removed', async () => {
    for (const stop of ['revoke', 'suspend'] as const) {
      storage = new MemoryStorage();
      setStorage(storage);
      const anna = await as();
      const current = (await save(anna)).json().data.image as string;
      const checked = checkProfileImage(png(128, 128));
      if (typeof checked === 'string') throw new Error(checked);
      await expect(
        saveProfilePhoto(anna.actor, checked, storage, {
          afterUpload: async () => {
            if (stop === 'revoke')
              await prisma.userSession.update({
                where: { id: anna.session.id },
                data: { revokedAt: new Date() },
              });
            else
              await prisma.user.update({
                where: { id: anna.user.id },
                data: { status: 'SUSPENDED' },
              });
          },
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: anna.user.id } }))
          .image,
      ).toBe(current);
      await drainRemovals();
      expect(avatars()).toEqual([
        `avatars/${anna.user.id}/${idOf(current)}.png`,
      ]);
    }
  });

  it('a save the sweep already gave up on is never confirmed', async () => {
    const anna = await as();
    const current = (await save(anna)).json().data.image as string;
    const checked = checkProfileImage(png(200, 200));
    if (typeof checked === 'string') throw new Error(checked);
    await expect(
      saveProfilePhoto(anna.actor, checked, storage, {
        // The save stalls long enough for the sweep to give up on it.
        afterUpload: async () => {
          await sweepProfilePhotos(
            storage,
            new Date(Date.now() + PHOTO_SWEEP_GRACE_MS + 1000),
          );
        },
      }),
    ).rejects.toMatchObject({ code: 'PHOTO_ABANDONED' });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: anna.user.id } }))
        .image,
    ).toBe(current);
    await drainRemovals();
    expect(avatars()).toEqual([`avatars/${anna.user.id}/${idOf(current)}.png`]);
  });

  it('an upload left by a crash is swept once no upload can still land; the current photo never is', async () => {
    const anna = await as();
    const current = idOf((await save(anna)).json().data.image);
    await prisma.profilePhoto.update({
      where: { id: current },
      data: { createdAt: new Date(Date.now() - 2 * DAY) },
    });
    const key = `avatars/${anna.user.id}/crashed.png`;
    await prisma.profilePhoto.create({
      data: {
        userId: anna.user.id,
        storageKey: key,
        contentType: 'image/png',
        size: 10,
        width: 512,
        height: 512,
      },
    });
    await storage.put(key, new Uint8Array(10), 'image/png');
    expect((await sweepProfilePhotos(storage)).abandoned).toBe(0);
    const later = new Date(Date.now() + PHOTO_SWEEP_GRACE_MS + 1000);
    expect((await sweepProfilePhotos(storage, later)).abandoned).toBe(1);
    await drainRemovals();
    expect(storage.objects.has(key)).toBe(false);
    expect(
      (await call('GET', `/v1/me/photo/${current}`, anna)).statusCode,
    ).toBe(200);
    // A removed file that reappears (a very late upload) is removed again.
    await storage.put(key, new Uint8Array(10), 'image/png');
    expect(
      (
        await sweepProfilePhotos(
          storage,
          new Date(later.getTime() + 10 * 60_000),
        )
      ).reappeared,
    ).toBe(1);
  });

  it('deleting the account removes the photo with the other identifiers', async () => {
    allowDeletionExecutionForTests(true);
    const anna = await as();
    const id = idOf((await save(anna)).json().data.image);
    expect(
      (await call('POST', '/v1/me/deletion', anna, { confirm: 'DELETE' }))
        .statusCode,
    ).toBe(200);
    expect(
      await prisma.profilePhoto.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ removedAt: expect.any(Date) });
    await drainRemovals();
    expect(avatars()).toEqual([]);
  });

  it('without file storage, photos are unavailable rather than failing silently', async () => {
    const anna = await as();
    setStorage(null);
    expect((await save(anna)).statusCode).toBe(503);
    expect(await prisma.profilePhoto.count()).toBe(0);
  });
});
