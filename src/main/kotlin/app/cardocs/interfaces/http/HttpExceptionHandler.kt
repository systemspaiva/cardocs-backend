package app.cardocs.interfaces.http

import app.cardocs.application.NotFoundException
import app.cardocs.application.ValidationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class HttpExceptionHandler {
    @ExceptionHandler(ValidationException::class)
    fun validation(error: ValidationException): ResponseEntity<ErrorResponseDto> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponseDto(error = "validation_error", message = error.message ?: "Entrada invalida."))

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun beanValidation(error: MethodArgumentNotValidException): ResponseEntity<ErrorResponseDto> {
        val message = error.bindingResult.fieldErrors.firstOrNull()?.defaultMessage ?: "Entrada invalida."
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponseDto(error = "validation_error", message = message))
    }

    @ExceptionHandler(MissingRequestHeaderException::class)
    fun missingHeader(error: MissingRequestHeaderException): ResponseEntity<ErrorResponseDto> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponseDto(error = "missing_header", message = "Header ${error.headerName} e obrigatorio."))

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun unreadable(error: HttpMessageNotReadableException): ResponseEntity<ErrorResponseDto> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponseDto(error = "invalid_json", message = "JSON invalido ou incompleto."))

    @ExceptionHandler(NotFoundException::class)
    fun notFound(error: NotFoundException): ResponseEntity<ErrorResponseDto> =
        ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ErrorResponseDto(error = "not_found", message = error.message ?: "Recurso nao encontrado."))

    @ExceptionHandler(Exception::class)
    fun unexpected(error: Exception): ResponseEntity<ErrorResponseDto> =
        ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ErrorResponseDto(error = "internal_error", message = "Erro interno."))
}
