package com.gymapp.backend.controller;

import java.util.Map;
import lombok.Getter;

@Getter
public class BadRequestException extends RuntimeException {
    private final String code;
    private final Map<String, Object> details;

    public BadRequestException(String code, String message) {
        this(code, message, null);
    }

    public BadRequestException(String code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}