package com.gymapp.backend.controller;

import java.util.Map;

public class ConflictException extends ApiException {
    public ConflictException(String message) {
        super("IMMUTABLE_ENTITY", message);
    }

    public ConflictException(String message, Map<String, Object> details) {
        super("IMMUTABLE_ENTITY", message, details);
    }
}