package com.gymapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class ClaimConfirmDevHeaderGuardTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfig.class);

    @Test
    void failsFastWhenDevHeaderEnabledOutsideDevAndTestProfiles() {
        contextRunner
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
                .withPropertyValues("claim.devUserHeaderEnabled=true")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .hasRootCauseMessage(
                                    "Unsafe configuration: claim.devUserHeaderEnabled=true is allowed only for dev/test profiles");
                });
    }

    @Test
    void allowsDevHeaderWhenEnabledInDevProfile() {
        contextRunner
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("dev"))
                .withPropertyValues("claim.devUserHeaderEnabled=true")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(ClaimConfirmDevHeaderGuard.class).isDevHeaderAllowed()).isTrue();
                });
    }

    @Configuration
    @EnableConfigurationProperties(ClaimProperties.class)
    static class TestConfig {
        @Bean
        ClaimConfirmDevHeaderGuard claimConfirmDevHeaderGuard(ClaimProperties claimProperties,
                org.springframework.core.env.Environment environment) {
            return new ClaimConfirmDevHeaderGuard(claimProperties, environment);
        }
    }
}