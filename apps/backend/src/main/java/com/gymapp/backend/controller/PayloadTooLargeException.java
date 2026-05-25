package com.gymapp.backend.controller;

import java.util.Map;

public class PayloadTooLargeException extends ApiException {
    public PayloadTooLargeException(String message, Map<String, Object> details) {
        super("PAYLOAD_TOO_LARGE", message, details);
    }
}
