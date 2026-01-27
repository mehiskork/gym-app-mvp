package com.gymapp.backend.controller;

import java.util.Map;

public class ApiException extends RuntimeException {
    private final String code;
    private final Map<String, Object> details;

    public ApiException(String code, String message) {
        this(code, message, null);
    }

    public ApiException(String code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> getDetails() {
        return details;
    }
}