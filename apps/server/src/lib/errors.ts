/** Errors with a stable `code` (docs/ARCHITECTURE.md, "API conventions"). */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'invalid_request', message, details);
export const unauthorized = (message = 'Sign in to continue.') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You can’t do that here.') =>
  new AppError(403, 'forbidden', message);
export const notFound = (what = 'That') => new AppError(404, 'not_found', `${what} wasn’t found.`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooMany = (retryAfterSeconds: number) =>
  new AppError(429, 'rate_limited', 'Too many requests. Try again in a moment.', {
    retryAfterSeconds,
  });
/** No `SMTP_URL`: a route that needs mail says so (R48). */
export const mailUnavailable = () =>
  new AppError(
    503,
    'email_unavailable',
    'Caime can’t send email here yet. Use a recovery code instead, or ask whoever runs it.',
  );
