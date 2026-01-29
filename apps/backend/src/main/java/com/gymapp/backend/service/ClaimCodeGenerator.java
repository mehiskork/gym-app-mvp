package com.gymapp.backend.service;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

@Component
public class ClaimCodeGenerator {
    private static final char[] CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final int CODE_LENGTH = 8;
    private final SecureRandom secureRandom = new SecureRandom();

    public String generateCode() {
        char[] buffer = new char[CODE_LENGTH];
        for (int i = 0; i < CODE_LENGTH; i++) {
            buffer[i] = CROCKFORD_BASE32[secureRandom.nextInt(CROCKFORD_BASE32.length)];
        }
        return new String(buffer);
    }
}