import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';

/** An expected failure with a stable code the frontend can act on. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const unauthenticated = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
export const forbidden = () =>
  new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
/** Also used for private records the caller may not see, to avoid leaking existence. */
export const notFound = (what = 'Record') =>
  new AppError(404, 'NOT_FOUND', `${what} not found.`);

/** Validates input with a Zod schema, returning 422 with per-field messages. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fieldErrors[key] ??= issue.message;
  }
  throw new AppError(
    422,
    'VALIDATION_FAILED',
    'Some fields need attention.',
    fieldErrors,
  );
}

/** Reads an If-Match header ("3" or 3) as a record version. */
export function requireVersion(header: string | string[] | undefined) {
  const value = Number(
    String(header ?? '')
      .replace(/^W\//, '')
      .replace(/"/g, ''),
  );
  if (!Number.isInteger(value) || value < 1)
    throw new AppError(
      428,
      'VERSION_REQUIRED',
      'Send the If-Match header with the record version.',
    );
  return value;
}
export const versionConflict = () =>
  new AppError(
    412,
    'VERSION_CONFLICT',
    'This record was changed by someone else. Reload to see the latest version.',
  );

/** Error envelope: { error: { code, message, fieldErrors?, requestId } }. */
export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof AppError)
      return reply.status(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
          requestId,
        },
      });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500)
      return reply.status(status).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'The request could not be read.',
          requestId,
        },
      });
    request.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong. Please try again.',
        requestId,
      },
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        requestId: request.id,
      },
    }),
  );
}
