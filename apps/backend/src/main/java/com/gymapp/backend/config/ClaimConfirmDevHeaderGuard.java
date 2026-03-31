package com.gymapp.backend.config;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ClaimConfirmDevHeaderGuard {
    private static final Set<String> PROD_LIKE_PROFILES = Set.of("prod", "production", "staging");

    private final ClaimProperties claimProperties;
    private final Environment environment;

    @PostConstruct
    void validateConfiguration() {
        if (claimProperties.isDevUserHeaderEnabled() && isProdLikeProfileActive()) {
            throw new IllegalStateException(
                    "Unsafe configuration: claim.devUserHeaderEnabled=true is forbidden for prod-like profiles");
        }
    }

    public boolean isDevHeaderAllowed() {
        return claimProperties.isDevUserHeaderEnabled() && !isProdLikeProfileActive();
    }

    private boolean isProdLikeProfileActive() {
        return Arrays.stream(environment.getActiveProfiles())
                .map(profile -> profile.toLowerCase(Locale.ROOT))
                .anyMatch(PROD_LIKE_PROFILES::contains);
    }
}