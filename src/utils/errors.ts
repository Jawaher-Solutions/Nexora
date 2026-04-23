export class AppError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) { super(`${resource} not found`, 404); }
}

export class UnauthorizedError extends AppError {
  constructor(msg='Unauthorized') { super(msg, 401); }
}

export class ForbiddenError extends AppError {
  constructor(msg='Forbidden') { super(msg, 403); }
}

export class ConflictError extends AppError {
  constructor(resource: string) { super(`${resource} already exists`, 409); }
}

export class ValidationError extends AppError {
  constructor(msg: string) { super(msg, 400); }
}
