export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "validation_error");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Firebase ID token obrigatorio.") {
    super(message, 401, "unauthorized");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "not_found");
  }
}

export class ProviderNotConfiguredError extends AppError {
  constructor(message: string) {
    super(message, 501, "provider_not_configured");
  }
}
