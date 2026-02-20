export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, message);
}

export function unauthorized(message = "未授权"): AppError {
  return new AppError(401, message);
}

export function forbidden(message = "权限不足"): AppError {
  return new AppError(403, message);
}

export function notFound(message = "资源不存在"): AppError {
  return new AppError(404, message);
}

export function conflict(message: string): AppError {
  return new AppError(409, message);
}
