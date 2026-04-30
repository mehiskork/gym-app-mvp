package com.gymapp.backend.config;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ProductionSafetyValidator {
    private static final Set<String> PROD_LIKE_PROFILES = Set.of("prod", "production", "staging");
    private static final Set<String> UNSAFE_PASSWORDS = Set.of("gymapp", "password", "changeme", "test");
    private static final String FIREBASE_ISSUER_PREFIX = "https://securetoken.google.com/";

    private final Environment environment;

    @PostConstruct
    void validate() {
        if (!isProdLike(environment)) {
            return;
        }

        String datasourceUrl = environment.getProperty("spring.datasource.url", "");
        String datasourceUsername = environment.getProperty("spring.datasource.username", "");
        String datasourcePassword = environment.getProperty("spring.datasource.password", "");
        String firebaseProjectId = environment.getProperty("app.auth.firebase.project-id", "");
        String jwtIssuerUri = environment.getProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri", "");

        validateOrThrow(datasourceUrl, datasourceUsername, datasourcePassword, firebaseProjectId, jwtIssuerUri);
    }

    void validateOrThrow(
            String datasourceUrl,
            String datasourceUsername,
            String datasourcePassword) {
        validateDatasourceOrThrow(datasourceUrl, datasourceUsername, datasourcePassword);
    }

    void validateOrThrow(
            String datasourceUrl,
            String datasourceUsername,
            String datasourcePassword,
            String firebaseProjectId,
            String jwtIssuerUri) {
        validateDatasourceOrThrow(datasourceUrl, datasourceUsername, datasourcePassword);
        validateAccountAuthOrThrow(firebaseProjectId, jwtIssuerUri);
    }

    private void validateDatasourceOrThrow(
            String datasourceUrl,
            String datasourceUsername,
            String datasourcePassword) {
        if (datasourceUrl.isBlank() || datasourceUsername.isBlank() || datasourcePassword.isBlank()) {
            throw new IllegalStateException(
                    "Prod-like profile requires explicit spring.datasource.url/username/password");
        }
        if (datasourceUrl.contains("localhost") || datasourceUrl.contains("127.0.0.1")) {
            throw new IllegalStateException(
                    "Prod-like profile cannot use localhost datasource URL");
        }
        if (UNSAFE_PASSWORDS.contains(datasourcePassword.trim().toLowerCase())) {
            throw new IllegalStateException(
                    "Prod-like profile cannot use default/insecure datasource password");
        }
    }

    private void validateAccountAuthOrThrow(String firebaseProjectId, String jwtIssuerUri) {
        String trimmedProjectId = firebaseProjectId == null ? "" : firebaseProjectId.trim();
        String trimmedIssuerUri = jwtIssuerUri == null ? "" : jwtIssuerUri.trim();
        if (trimmedProjectId.isBlank()) {
            throw new IllegalStateException(
                    "Prod-like profile requires app.auth.firebase.project-id / APP_AUTH_FIREBASE_PROJECT_ID");
        }
        if (trimmedIssuerUri.isBlank()) {
            throw new IllegalStateException(
                    "Prod-like profile requires spring.security.oauth2.resourceserver.jwt.issuer-uri / "
                            + "SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI");
        }
        String expectedIssuerUri = FIREBASE_ISSUER_PREFIX + trimmedProjectId;
        if (!expectedIssuerUri.equals(trimmedIssuerUri)) {
            throw new IllegalStateException(
                    "Prod-like profile Firebase issuer URI must match project id: expected "
                            + expectedIssuerUri + " but configured " + trimmedIssuerUri);
        }
    }

    static boolean isProdLike(Environment environment) {
        if (environment == null) {
            return false;
        }
        String[] activeProfiles = environment.getActiveProfiles();
        return Arrays.stream(activeProfiles)
                .map(String::toLowerCase)
                .anyMatch(PROD_LIKE_PROFILES::contains);
    }
}
