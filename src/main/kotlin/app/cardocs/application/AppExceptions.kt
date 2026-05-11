package app.cardocs.application

class ValidationException(message: String) : RuntimeException(message)

class NotFoundException(message: String) : RuntimeException(message)

class ProviderUnavailableException(message: String) : RuntimeException(message)
