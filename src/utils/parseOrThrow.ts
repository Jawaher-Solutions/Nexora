// utils/parseOrThrow.ts
// Shared Zod parse helper — eliminates duplicated toValidationError in every route file.

import { ZodError, ZodType } from 'zod';
import { ValidationError } from './errors';

/**
 * Parses `input` with `schema`. On failure, throws a `ValidationError` with
 * joined Zod issue messages. Replaces the per-file toValidationError helpers.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      const messages = error.issues.map((i) => {
        const path = i.path.join('.');
        return path ? `${path}: ${i.message}` : i.message;
      });
      throw new ValidationError(messages.join(', '));
    }
    throw new ValidationError('Invalid request data');
  }
}
