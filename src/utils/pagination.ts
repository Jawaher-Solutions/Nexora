// utils/pagination.ts
// RULE: Pure functions only. No I/O.

import { PAGINATION } from '../config/constants';

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Convert page/limit to Prisma skip/take.
 */
export function paginate(page?: number, limit?: number) {
  const p = Math.max(page ?? PAGINATION.DEFAULT_PAGE, 1);
  const l = Math.min(
    Math.max(limit ?? PAGINATION.DEFAULT_LIMIT, 1),
    PAGINATION.MAX_LIMIT
  );

  return {
    skip: (p - 1) * l,
    take: l,
    page: p,
    limit: l,
  };
}

/**
 * Build pagination metadata for API response.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
