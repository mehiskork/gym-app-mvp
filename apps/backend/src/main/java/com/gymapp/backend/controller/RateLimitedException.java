package com.gymapp.backend.controller;

import java.util.Map;

public class RateLimitedException extends ApiException {
    public RateLimitedException(String message) {
        super("RATE_LIMITED", message);
    }

    public RateLimitedException(String message, Map<String, Object> details) {
        super("RATE_LIMITED", message, details);
    }
}