package com.gymapp.backend.controller;

import java.util.Map;

public class NotImplementedException extends ApiException {
    public NotImplementedException(String code, String message) {
        super(code, message);
    }

    public NotImplementedException(String code, String message, Map<String, Object> details) {
        super(code, message, details);
    }
}