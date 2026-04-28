package com.gymapp.backend.config;

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
            return validateFirebaseSubject(token);
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

    private OAuth2TokenValidatorResult invalidToken(String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", description, null));
    }
}
