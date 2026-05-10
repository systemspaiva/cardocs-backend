package com.cardocs.api.common;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiErrorResponse> validation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
            .map(this::formatFieldError)
            .toList();
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Campo obrigatório inválido", request, details);
    }

    @ExceptionHandler(BadRequestException.class)
    ResponseEntity<ApiErrorResponse> badRequest(BadRequestException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "BAD_REQUEST", ex.getMessage(), request, List.of());
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    ResponseEntity<ApiErrorResponse> notFound(ResourceNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, "NOT_FOUND", ex.getMessage(), request, List.of());
    }

    @ExceptionHandler({ForbiddenException.class, AccessDeniedException.class})
    ResponseEntity<ApiErrorResponse> forbidden(Exception ex, HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN, "FORBIDDEN", ex.getMessage(), request, List.of());
    }

    @ExceptionHandler(BadCredentialsException.class)
    ResponseEntity<ApiErrorResponse> credentials(BadCredentialsException ex, HttpServletRequest request) {
        return build(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Credenciais inválidas", request, List.of());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiErrorResponse> internal(Exception ex, HttpServletRequest request) {
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Erro interno", request, List.of());
    }

    private ResponseEntity<ApiErrorResponse> build(
        HttpStatus status,
        String error,
        String message,
        HttpServletRequest request,
        List<String> details
    ) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(
            Instant.now(),
            status.value(),
            error,
            message,
            request.getRequestURI(),
            details
        ));
    }

    private String formatFieldError(FieldError error) {
        return error.getField() + ": " + error.getDefaultMessage();
    }
}
