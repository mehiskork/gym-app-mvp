package com.gymapp.backend.controller;

import java.util.Map;

public class UnauthorizedException extends ApiException {
    public UnauthorizedException(String message) {
        super("AUTH_UNAUTHORIZED", message);
    }

    public UnauthorizedException(String code, String message, Map<String, Object> details) {
        super(code, message, details);
    }
}