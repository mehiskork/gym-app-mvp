package com.gymapp.backend.controller;

import java.util.Map;

public class ValidationException extends ApiException {
    public ValidationException(String message) {
        super("SYNC_VALIDATION_ERROR", message);
    }

    public ValidationException(String message, Map<String, Object> details) {
        super("SYNC_VALIDATION_ERROR", message, details);
    }
}
