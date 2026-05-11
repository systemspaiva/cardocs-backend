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

export class ProviderLimitExceededError extends AppError {
  constructor(message = "Limite de consultas do provedor atingido.") {
    super(message, 429, "provider_limit_exceeded");
  }
}

export class ExternalProviderError extends AppError {
  constructor(message: string) {
    super(message, 502, "external_provider_error");
  }
}
