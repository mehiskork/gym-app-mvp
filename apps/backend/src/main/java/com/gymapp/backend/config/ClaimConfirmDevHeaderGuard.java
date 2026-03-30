package com.gymapp.backend.config;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ClaimConfirmDevHeaderGuard {
    private final ClaimProperties claimProperties;
    private final Environment environment;

    @PostConstruct
    void validateConfiguration() {
        if (claimProperties.isDevUserHeaderEnabled() && !isDevOrTestProfileActive()) {
            throw new IllegalStateException(
                    "Unsafe configuration: claim.devUserHeaderEnabled=true is allowed only for dev/test profiles");
        }
    }

    public boolean isDevHeaderAllowed() {
        return claimProperties.isDevUserHeaderEnabled() && isDevOrTestProfileActive();
    }

    private boolean isDevOrTestProfileActive() {
        return Arrays.stream(environment.getActiveProfiles())
                .map(profile -> profile.toLowerCase(Locale.ROOT))
                .anyMatch(profile -> profile.equals("dev") || profile.equals("test"));
    }
}