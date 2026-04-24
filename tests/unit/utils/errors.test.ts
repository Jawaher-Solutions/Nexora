import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';

describe('custom error classes', () => {
  it('NotFoundError has statusCode 404 and correct message', () => {
    const err = new NotFoundError('Video');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('Video');
  });

  it('UnauthorizedError has statusCode 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it('ForbiddenError has statusCode 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it('ConflictError has statusCode 409', () => {
    const err = new ConflictError('Email');
    expect(err.statusCode).toBe(409);
  });

  it('ValidationError has statusCode 400', () => {
    const err = new ValidationError('bad');
    expect(err.statusCode).toBe(400);
  });

  it('All errors are instanceof AppError', () => {
    expect(new NotFoundError('X')).toBeInstanceOf(AppError);
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
    expect(new ConflictError('X')).toBeInstanceOf(AppError);
    expect(new ValidationError('X')).toBeInstanceOf(AppError);
  });
});
