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

    private final Environment environment;
    private final ClaimProperties claimProperties;

    @PostConstruct
    void validate() {
        String[] activeProfiles = environment.getActiveProfiles();
        boolean prodLike = Arrays.stream(activeProfiles)
                .map(String::toLowerCase)
                .anyMatch(PROD_LIKE_PROFILES::contains);

        if (!prodLike) {
            return;
        }

        String datasourceUrl = environment.getProperty("spring.datasource.url", "");
        String datasourceUsername = environment.getProperty("spring.datasource.username", "");
        String datasourcePassword = environment.getProperty("spring.datasource.password", "");

        validateOrThrow(datasourceUrl, datasourceUsername, datasourcePassword,
                claimProperties.isDevUserHeaderEnabled());
    }

    void validateOrThrow(
            String datasourceUrl,
            String datasourceUsername,
            String datasourcePassword,
            boolean devUserHeaderEnabled) {
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
        if (devUserHeaderEnabled) {
            throw new IllegalStateException(
                    "Prod-like profile cannot enable claim.devUserHeaderEnabled");
        }
    }
}