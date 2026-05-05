package com.gymapp.backend.config;

import java.time.Instant;
import java.util.Date;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class FirebaseJwtValidator {
    private final FirebaseAuthProperties firebaseAuthProperties;

    public OAuth2TokenValidator<Jwt> validator(String issuerUri) {
        OAuth2TokenValidator<Jwt> defaultValidator = JwtValidators.createDefaultWithIssuer(issuerUri);
        return token -> {
            OAuth2TokenValidatorResult defaultResult = defaultValidator.validate(token);
            if (defaultResult.hasErrors()) {
                return defaultResult;
            }
            OAuth2TokenValidatorResult audienceResult = validateFirebaseAudience(token);
            if (audienceResult.hasErrors()) {
                return audienceResult;
            }
            OAuth2TokenValidatorResult subjectResult = validateFirebaseSubject(token);
            if (subjectResult.hasErrors()) {
                return subjectResult;
            }
            return validateFirebaseAuthTime(token);
        };
    }

    private OAuth2TokenValidatorResult validateFirebaseAudience(Jwt jwt) {
        String projectId = firebaseAuthProperties.getProjectId();
        if (!StringUtils.hasText(projectId)) {
            return invalidToken("Firebase project ID is not configured");
        }
        if (!jwt.getAudience().contains(projectId)) {
            return invalidToken("Firebase token audience is invalid");
        }
        return OAuth2TokenValidatorResult.success();
    }

    private OAuth2TokenValidatorResult validateFirebaseSubject(Jwt jwt) {
        if (!StringUtils.hasText(jwt.getSubject())) {
            return invalidToken("Firebase token subject is required");
        }
        return OAuth2TokenValidatorResult.success();
    }

    private OAuth2TokenValidatorResult validateFirebaseAuthTime(Jwt jwt) {
        Object rawAuthTime = jwt.getClaim("auth_time");
        if (rawAuthTime == null) {
            return invalidToken("Firebase token auth_time is required");
        }

        Instant authTime = parseAuthTime(rawAuthTime);
        if (authTime == null) {
            return invalidToken("Firebase token auth_time is invalid");
        }
        if (authTime.isAfter(Instant.now())) {
            return invalidToken("Firebase token auth_time must be in the past");
        }
        return OAuth2TokenValidatorResult.success();
    }

    private Instant parseAuthTime(Object rawAuthTime) {
        if (rawAuthTime instanceof Instant instant) {
            return instant;
        }
        if (rawAuthTime instanceof Date date) {
            return date.toInstant();
        }
        if (rawAuthTime instanceof Number number) {
            return Instant.ofEpochSecond(number.longValue());
        }
        if (rawAuthTime instanceof String value) {
            String trimmed = value.trim();
            if (trimmed.isBlank()) {
                return null;
            }
            try {
                return Instant.ofEpochSecond(Long.parseLong(trimmed));
            } catch (NumberFormatException ignored) {
                try {
                    return Instant.parse(trimmed);
                } catch (RuntimeException ignoredAgain) {
                    return null;
                }
            }
        }
        return null;
    }

    private OAuth2TokenValidatorResult invalidToken(String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", description, null));
    }
}
