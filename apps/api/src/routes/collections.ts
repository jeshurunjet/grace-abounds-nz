import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  folderInputSchema,
  isOutsideLink,
  locationInputSchema,
  nextStepInputSchema,
  PASTOR_LINK_MESSAGE,
  resourceInputSchema,
  teamMemberInputSchema,
  type ContentStatusValue,
  type FolderInput,
  type LocationInput,
  type NextStepInput,
  type PublicCollections,
  type ResourceInput,
  type TeamMemberInput,
} from '@grace-abounds/validation';
import {
  prisma,
  recordAudit,
  Role,
  type ContentStatus,
  type Prisma,
} from '@grace-abounds/database';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { requireActor, requireRole, type Actor } from '../lib/identity.js';
import { publicSermons } from './sermons.js';

/*
 * Phase 2B editorial collections. Every record saves on its own:
 *   POST   /v1/staff/:collection            create (status chosen in the body)
 *   PATCH  /v1/staff/:collection/:id        replace, If-Match: "<version>"
 *   DELETE /v1/staff/:collection/:id        If-Match; drafts/archived only
 *   PUT    /v1/staff/:collection/order      explicit "Save order"
 * Each write records a ContentRevision and an AuditEvent in one transaction.
 * Public and member responses contain published records only.
 */

type Tx = Prisma.TransactionClient;
type Row = {
  id: string;
  version: number;
  position: number;
  updatedAt: Date;
  status?: ContentStatus;
  [key: string]: unknown;
};
/** The small slice of a Prisma model delegate these routes use. */
type Delegate = {
  findMany(args: object): Promise<Row[]>;
  findUnique(args: object): Promise<Row | null>;
  create(args: object): Promise<Row>;
  updateMany(args: object): Promise<{ count: number }>;
  update(args: object): Promise<Row>;
  deleteMany(args: object): Promise<{ count: number }>;
  aggregate(args: object): Promise<{ _max: { position: number | null } }>;
};
type ModelName =
  'location' | 'nextStep' | 'teamMember' | 'resource' | 'resourceFolder';
const delegate = (client: Tx | typeof prisma, model: ModelName) =>
  (client as unknown as Record<ModelName, Delegate>)[model];

const toStatus = (value: ContentStatusValue) =>
  value.toUpperCase() as ContentStatus;
const fromStatus = (value: ContentStatus | undefined) =>
  (value ?? 'DRAFT').toLowerCase() as ContentStatusValue;

type Collection<I> = {
  model: ModelName;
  /** Used in audit actions, e.g. content.location_saved. */
  noun: string;
  schema: ZodType<I>;
  hasStatus: boolean;
  /** Database fields from validated input (key/derived fields on create). */
  toData(
    input: I,
    tx: Tx,
    existing: Row | undefined,
    actor: Actor,
  ): Promise<Record<string, unknown>>;
  /** The record as the editor sees it (input shape plus `key` where used). */
  toApi(row: Row): Record<string, unknown>;
  /** A reason the record cannot be deleted, or null. */
  blockDelete?(row: Row, tx: Tx): Promise<string | null>;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'campus';

async function assertFolder(tx: Tx, id: string | null, field: string) {
  if (!id) return;
  if (!(await tx.resourceFolder.findUnique({ where: { id } })))
    throw new AppError(
      422,
      'VALIDATION_FAILED',
      'Some fields need attention.',
      {
        [field]: 'That folder no longer exists.',
      },
    );
}

const collections: Record<string, Collection<never>> = {
  locations: {
    model: 'location',
    noun: 'location',
    schema: locationInputSchema,
    hasStatus: true,
    async toData(input: LocationInput, tx, existing) {
      const data: Record<string, unknown> = {
        name: input.name,
        kind: input.kind,
        address: input.address,
        image: input.image,
        status: toStatus(input.status),
      };
      // The key is fixed once created: activities refer to it.
      if (!existing) {
        const base = slugify(input.name.split(' — ').pop() ?? input.name);
        let key = base;
        for (let n = 2; await tx.location.findUnique({ where: { key } }); n++)
          key = `${base}-${n}`;
        data.key = key;
      }
      return data;
    },
    toApi: (row) => ({
      key: row.key,
      name: row.name,
      kind: row.kind,
      address: row.address,
      image: row.image,
      status: fromStatus(row.status),
    }),
    async blockDelete(row, tx) {
      // Activities (still browser-kept until Phase 3) may point at any campus
      // that was ever published, so only never-published drafts are removed.
      const everPublished = await tx.contentRevision.findFirst({
        where: {
          entityType: 'locations',
          entityKey: row.id,
          data: { path: ['status'], equals: 'published' },
        },
      });
      return everPublished
        ? 'This campus has been published and may be used by activities. Archive it instead.'
        : null;
    },
  } satisfies Collection<LocationInput> as never,
  'next-steps': {
    model: 'nextStep',
    noun: 'next_step',
    schema: nextStepInputSchema,
    hasStatus: true,
    toData: async (input: NextStepInput) => ({
      title: input.title,
      subtitle: input.subtitle,
      heading: input.heading,
      body: input.body,
      icon: input.icon,
      ctaKind: input.cta.kind,
      ctaLabel: input.cta.label,
      ctaTarget: input.cta.target,
      path: input.path,
      status: toStatus(input.status),
    }),
    toApi: (row) => ({
      title: row.title,
      subtitle: row.subtitle,
      heading: row.heading,
      body: row.body,
      icon: row.icon,
      cta: { kind: row.ctaKind, label: row.ctaLabel, target: row.ctaTarget },
      path: row.path,
      status: fromStatus(row.status),
    }),
  } satisfies Collection<NextStepInput> as never,
  team: {
    model: 'teamMember',
    noun: 'team_member',
    schema: teamMemberInputSchema,
    hasStatus: true,
    toData: async (input: TeamMemberInput) => ({
      name: input.name,
      role: input.role,
      bio: input.bio,
      image: input.image,
      status: toStatus(input.status),
    }),
    toApi: (row) => ({
      name: row.name,
      role: row.role,
      bio: row.bio,
      image: row.image,
      status: fromStatus(row.status),
    }),
  } satisfies Collection<TeamMemberInput> as never,
  resources: {
    model: 'resource',
    noun: 'resource',
    schema: resourceInputSchema,
    hasStatus: true,
    async toData(input: ResourceInput, tx, existing, actor) {
      await assertFolder(tx, input.folderId, 'folderId');
      if (
        input.sermonId &&
        !(await tx.sermon.findUnique({ where: { id: input.sermonId } }))
      )
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Some fields need attention.',
          { sermonId: 'That sermon no longer exists.' },
        );
      // A link to another website could serve anything, video included, so
      // only the Pastor publishes one (see PASTOR_LINK_MESSAGE). Admin may
      // keep a link the Pastor already published, unchanged.
      const unchangedPublished =
        existing?.status === 'PUBLISHED' && existing.url === input.url;
      if (
        input.status === 'published' &&
        isOutsideLink(input.url) &&
        actor.role !== Role.PASTOR &&
        !unchangedPublished
      )
        throw new AppError(403, 'PASTOR_REVIEW_REQUIRED', PASTOR_LINK_MESSAGE, {
          status: PASTOR_LINK_MESSAGE,
        });
      return {
        title: input.title,
        description: input.description,
        type: input.type || 'Document',
        url: input.url,
        sermonId: input.sermonId,
        folderId: input.folderId,
        visibility: input.visibility.toUpperCase(),
        status: toStatus(input.status),
      };
    },
    toApi: (row) => ({
      title: row.title,
      description: row.description,
      type: row.type,
      url: row.url,
      sermonId: row.sermonId ?? null,
      folderId: row.folderId,
      visibility: String(row.visibility).toLowerCase(),
      status: fromStatus(row.status),
    }),
  } satisfies Collection<ResourceInput> as never,
  folders: {
    model: 'resourceFolder',
    noun: 'folder',
    schema: folderInputSchema,
    hasStatus: false,
    async toData(input: FolderInput, tx, existing) {
      await assertFolder(tx, input.parentId, 'parentId');
      // A folder cannot sit inside itself or one of its own subfolders.
      for (let id = input.parentId; id && existing;) {
        if (id === existing.id)
          throw new AppError(
            422,
            'VALIDATION_FAILED',
            'Some fields need attention.',
            { parentId: 'A folder can’t go inside itself.' },
          );
        id =
          (await tx.resourceFolder.findUnique({ where: { id } }))?.parentId ??
          null;
      }
      return { name: input.name, parentId: input.parentId };
    },
    toApi: (row) => ({ name: row.name, parentId: row.parentId }),
    async blockDelete(row, tx) {
      const [children, resources] = await Promise.all([
        tx.resourceFolder.count({ where: { parentId: row.id } }),
        tx.resource.count({ where: { folderId: row.id } }),
      ]);
      return children || resources
        ? 'Move or delete what is inside this folder first.'
        : null;
    },
  } satisfies Collection<FolderInput> as never,
};

const staffRecord = (def: Collection<never>, row: Row) => ({
  id: row.id,
  ...def.toApi(row),
  position: row.position,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});
const ordered = { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] };

function collectionFor(
  request: FastifyRequest<{ Params: { collection: string } }>,
) {
  const def = Object.prototype.hasOwnProperty.call(
    collections,
    request.params.collection,
  )
    ? collections[request.params.collection]
    : undefined;
  if (!def) throw notFound('Collection');
  return { def, name: request.params.collection };
}

/** Published campuses, journeys and leadership for the public bundle. */
export async function publicCollections(): Promise<PublicCollections> {
  const published = { where: { status: 'PUBLISHED' }, ...ordered };
  const [locations, steps, team, sermons] = await Promise.all([
    delegate(prisma, 'location').findMany(published),
    delegate(prisma, 'nextStep').findMany(published),
    delegate(prisma, 'teamMember').findMany(published),
    publicSermons(),
  ]);
  const strip = (def: Collection<never>, row: Row) => {
    const { status: _status, ...rest } = def.toApi(row);
    void _status;
    return { id: row.id, ...rest };
  };
  return {
    locations: locations.map((row) => strip(collections.locations!, row)),
    steps: steps.map((row) => strip(collections['next-steps']!, row)),
    team: team.map((row) => strip(collections.team!, row)),
    sermons,
  } as PublicCollections;
}

export function registerCollectionRoutes(app: FastifyInstance) {
  const requireStaff = (request: FastifyRequest) =>
    requireRole(request, Role.PASTOR, Role.ADMIN);

  // ---------- Members: the shared library (read-only) ----------
  app.get('/v1/member/library', async (request, reply) => {
    requireActor(request);
    const [folders, resources] = await Promise.all([
      delegate(prisma, 'resourceFolder').findMany(ordered),
      prisma.resource.findMany({
        // A sermon reference is listed only while that sermon is approved
        // and live; nothing else about a sermon reaches the library.
        where: {
          status: 'PUBLISHED',
          OR: [
            { sermonId: null },
            { sermon: { liveVersion: { not: null }, archivedAt: null } },
          ],
        },
        include: { sermon: { select: { slug: true } } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    reply.header('cache-control', 'private, no-store');
    return {
      data: {
        folders: folders.map((row) => ({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
        })),
        resources: resources.map(({ sermon, ...row }) => {
          const { status: _status, ...rest } = collections.resources!.toApi(
            row as unknown as Row,
          );
          void _status;
          return {
            id: row.id,
            ...rest,
            href: sermon ? `/sermons/${sermon.slug}` : row.url,
          };
        }),
      },
    };
  });

  // ---------- Staff ----------
  app.get<{ Params: { collection: string } }>(
    '/v1/staff/:collection',
    async (request, reply) => {
      requireStaff(request);
      const { def } = collectionFor(request);
      const rows = await delegate(prisma, def.model).findMany(ordered);
      reply.header('cache-control', 'private, no-store');
      return { data: rows.map((row) => staffRecord(def, row)) };
    },
  );

  app.post<{ Params: { collection: string } }>(
    '/v1/staff/:collection',
    async (request, reply) => {
      const actor = requireStaff(request);
      const { def, name } = collectionFor(request);
      const input = parse(def.schema, request.body ?? {});
      const row = await prisma.$transaction(async (tx) => {
        const model = delegate(tx, def.model);
        const max = await model.aggregate({ _max: { position: true } });
        const created = await model.create({
          data: {
            ...(await def.toData(input, tx, undefined, actor)),
            position: (max._max.position ?? -1) + 1,
            updatedById: actor.id,
          },
        });
        await tx.contentRevision.create({
          data: {
            entityType: name,
            entityKey: created.id,
            version: 1,
            data: def.toApi(created) as Prisma.InputJsonValue,
            actorId: actor.id,
          },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: `content.${def.noun}_created`,
          entityType: def.model,
          entityId: created.id,
          requestId: request.id,
          metadata: def.hasStatus ? { status: fromStatus(created.status) } : {},
        });
        return created;
      });
      reply.status(201).header('etag', `"${row.version}"`);
      reply.header('cache-control', 'private, no-store');
      return { data: staffRecord(def, row), version: row.version };
    },
  );

  // Registered before /:id so "order" is never taken as an id.
  app.put<{ Params: { collection: string } }>(
    '/v1/staff/:collection/order',
    async (request) => {
      const actor = requireStaff(request);
      const { def } = collectionFor(request);
      const body = request.body as { ids?: unknown } | undefined;
      const ids = Array.isArray(body?.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string')
        : [];
      await prisma.$transaction(async (tx) => {
        const model = delegate(tx, def.model);
        const current = await model.findMany({
          select: { id: true },
        } as object);
        const same =
          ids.length === current.length &&
          new Set(ids).size === ids.length &&
          current.every((row) => ids.includes(row.id));
        if (!same)
          throw new AppError(
            409,
            'ORDER_STALE',
            'This list changed since you opened it. Reload to see the latest order.',
          );
        for (const [position, id] of ids.entries())
          await model.update({ where: { id }, data: { position } });
        await recordAudit(tx, {
          actorId: actor.id,
          action: `content.${def.noun}_reordered`,
          entityType: def.model,
          entityId: 'order',
          requestId: request.id,
        });
      });
      return { data: { ids } };
    },
  );

  app.patch<{ Params: { collection: string; id: string } }>(
    '/v1/staff/:collection/:id',
    async (request, reply) => {
      const actor = requireStaff(request);
      const { def, name } = collectionFor(request);
      const expected = requireVersion(request.headers['if-match']);
      const input = parse(def.schema, request.body ?? {});
      const row = await prisma.$transaction(async (tx) => {
        const model = delegate(tx, def.model);
        const existing = await model.findUnique({
          where: { id: request.params.id },
        });
        if (!existing) throw notFound('Record');
        if (existing.version !== expected) throw versionConflict();
        const data = await def.toData(input, tx, existing, actor);
        const result = await model.updateMany({
          where: { id: existing.id, version: expected },
          data: { ...data, version: { increment: 1 }, updatedById: actor.id },
        });
        if (result.count === 0) throw versionConflict();
        const saved = (await model.findUnique({ where: { id: existing.id } }))!;
        await tx.contentRevision.create({
          data: {
            entityType: name,
            entityKey: saved.id,
            version: saved.version,
            data: def.toApi(saved) as Prisma.InputJsonValue,
            actorId: actor.id,
          },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: `content.${def.noun}_saved`,
          entityType: def.model,
          entityId: saved.id,
          requestId: request.id,
          metadata: {
            version: saved.version,
            ...(def.hasStatus && {
              status: fromStatus(saved.status),
              previousStatus: fromStatus(existing.status),
            }),
          },
        });
        return saved;
      });
      reply.header('etag', `"${row.version}"`);
      reply.header('cache-control', 'private, no-store');
      return { data: staffRecord(def, row), version: row.version };
    },
  );

  app.delete<{ Params: { collection: string; id: string } }>(
    '/v1/staff/:collection/:id',
    async (request, reply) => {
      const actor = requireStaff(request);
      const { def } = collectionFor(request);
      const expected = requireVersion(request.headers['if-match']);
      await prisma.$transaction(async (tx) => {
        const model = delegate(tx, def.model);
        const existing = await model.findUnique({
          where: { id: request.params.id },
        });
        if (!existing) throw notFound('Record');
        if (existing.version !== expected) throw versionConflict();
        if (def.hasStatus && existing.status === 'PUBLISHED')
          throw new AppError(
            409,
            'ARCHIVE_FIRST',
            'Published items are archived, not deleted. Archive it first.',
          );
        const blocked = await def.blockDelete?.(existing, tx);
        if (blocked) throw new AppError(409, 'IN_USE', blocked);
        // The checks above give a helpful reason; this conditional delete is
        // what makes them hold. A save or publish that committed meanwhile
        // changed the version (or status), so nothing is deleted.
        let deleted: { count: number };
        try {
          deleted = await model.deleteMany({
            where: {
              id: existing.id,
              version: expected,
              ...(def.hasStatus && { status: { not: 'PUBLISHED' } }),
            },
          });
        } catch (error) {
          // Something now refers to it (e.g. a resource added to a folder).
          if ((error as { code?: string }).code === 'P2003')
            throw new AppError(
              409,
              'IN_USE',
              'Something now uses this. Reload and try again.',
            );
          throw error;
        }
        if (deleted.count === 0) throw versionConflict();
        await recordAudit(tx, {
          actorId: actor.id,
          action: `content.${def.noun}_deleted`,
          entityType: def.model,
          entityId: existing.id,
          requestId: request.id,
          metadata: { version: existing.version, record: def.toApi(existing) },
        });
      });
      reply.header('cache-control', 'private, no-store');
      return reply.status(204).send();
    },
  );
}
