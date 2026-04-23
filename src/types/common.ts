// types/common.ts
// Shared TypeScript types used across the application.

import { PaginationMeta } from '../utils/pagination';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    statusCode: number;
  };
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
