package com.gymapp.backend.controller;

import java.util.Map;

public class ForbiddenException extends ApiException {
    public ForbiddenException(String message) {
        super("AUTH_FORBIDDEN", message);
    }

    public ForbiddenException(String message, Map<String, Object> details) {
        super("AUTH_FORBIDDEN", message, details);
    }
}