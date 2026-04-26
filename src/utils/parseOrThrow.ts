// utils/parseOrThrow.ts
// Shared Zod parse helper — eliminates duplicated toValidationError in every route file.

import { ZodError, ZodSchema } from 'zod';
import { ValidationError } from './errors';

/**
 * Parses `input` with `schema`. On failure, throws a `ValidationError` with
 * joined Zod issue messages. Replaces the per-file toValidationError helpers.
 */
export function parseOrThrow<T>(schema: ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      throw new ValidationError(error.issues.map((i) => i.message).join(', '));
    }
    throw new ValidationError('Invalid request data');
  }
}
