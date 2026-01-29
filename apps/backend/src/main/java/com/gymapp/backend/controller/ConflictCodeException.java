package com.gymapp.backend.controller;

import java.util.Map;

public class ConflictCodeException extends ApiException {
    public ConflictCodeException(String code, String message) {
        super(code, message);
    }

    public ConflictCodeException(String code, String message, Map<String, Object> details) {
        super(code, message, details);
    }
}