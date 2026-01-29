package com.gymapp.backend.controller;

import com.gymapp.backend.model.ErrorResponse;
import jakarta.validation.ConstraintViolationException;
import java.util.Map;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
// Error code taxonomy:
// - AUTH_UNAUTHORIZED / AUTH_TOKEN_EXPIRED: authentication failures (401)
// - AUTH_FORBIDDEN / SYNC_FORBIDDEN: authorization failures (403)
// - BAD_REQUEST: malformed/invalid request bodies (400)
// - SYNC_VALIDATION_ERROR: sync validation issues (400)
// - IMMUTABLE_ENTITY: conflict/immutability violations (409)
// - RATE_LIMITED: throttling (429)
// - INTERNAL_ERROR: unexpected server errors (500)
public class ApiExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .orElse("Invalid request");
        return buildResponse(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message, null);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraint(ConstraintViolationException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "BAD_REQUEST", ex.getMessage(), null);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "BAD_REQUEST", ex.getMessage(), null);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(ForbiddenException ex) {
        return buildResponse(HttpStatus.FORBIDDEN, ex.getCode(), ex.getMessage(), ex.getDetails());
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ErrorResponse> handleUnauthorized(UnauthorizedException ex) {
        return buildResponse(HttpStatus.UNAUTHORIZED, ex.getCode(), ex.getMessage(), ex.getDetails());
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleSyncValidation(ValidationException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, ex.getCode(), ex.getMessage(), ex.getDetails());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(ConflictException ex) {
        return buildResponse(HttpStatus.CONFLICT, ex.getCode(), ex.getMessage(), ex.getDetails());
    }

    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<ErrorResponse> handleRateLimited(RateLimitedException ex) {
        return buildResponse(HttpStatus.TOO_MANY_REQUESTS, ex.getCode(), ex.getMessage(), ex.getDetails());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleBadJson(HttpMessageNotReadableException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Malformed JSON request", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "Unexpected server error", null);
    }

    private ResponseEntity<ErrorResponse> buildResponse(
            HttpStatus status,
            String code,
            String message,
            Map<String, Object> details) {
        String requestId = MDC.get("requestId");
        if (requestId == null || requestId.isBlank()) {
            requestId = "unknown";
        }
        ErrorResponse response = new ErrorResponse(code, message, requestId, details);
        return ResponseEntity.status(status).body(response);
    }
}