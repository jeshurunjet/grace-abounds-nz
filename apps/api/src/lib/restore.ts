import type { ZodType } from 'zod';
import { AppError, parse } from './errors.js';

/**
 * Validates a revision's data with today's rules before it is restored. An
 * older version can fail a rule added since (for example the strict link
 * check); it is then refused with the reasons, never saved as it was.
 */
export function parseRestored<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return parse(schema, value);
  } catch (error) {
    if (error instanceof AppError && error.code === 'VALIDATION_FAILED')
      throw new AppError(
        422,
        'REVISION_INVALID',
        'This version no longer meets the current rules, so it can’t be restored. Make the change by editing instead.',
        error.fieldErrors,
      );
    throw error;
  }
}
