package com.gymapp.backend.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ProductionSafetyValidatorTest {

    private final ProductionSafetyValidator validator = new ProductionSafetyValidator(null);

    @Test
    void rejectsUnsafeDefaultPasswordForProdLikeMode() {
        assertThrows(IllegalStateException.class, () -> validator.validateOrThrow(
                "jdbc:postgresql://db.internal:5432/gymapp",
                "gymapp",
                "gymapp"));
    }

    @Test
    void acceptsExplicitSafeProdLikeConfiguration() {
        assertDoesNotThrow(() -> validator.validateOrThrow(
                "jdbc:postgresql://db.internal:5432/gymapp",
                "gymapp",
                "a-strong-password"));
    }

    @Test
    void rejectsMissingFirebaseProjectIdForProdLikeMode() {
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> validator.validateOrThrow(
                "jdbc:postgresql://db.internal:5432/gymapp",
                "gymapp",
                "a-strong-password",
                "",
                "https://securetoken.google.com/gym-app-mvp-1d7f0"));

        org.assertj.core.api.Assertions.assertThat(error.getMessage())
                .contains("APP_AUTH_FIREBASE_PROJECT_ID");
    }

    @Test
    void rejectsMissingJwtIssuerForProdLikeMode() {
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> validator.validateOrThrow(
                "jdbc:postgresql://db.internal:5432/gymapp",
                "gymapp",
                "a-strong-password",
                "gym-app-mvp-1d7f0",
                ""));

        org.assertj.core.api.Assertions.assertThat(error.getMessage())
                .contains("SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI");
    }

    @Test
    void acceptsCompleteProdLikeAccountAuthConfiguration() {
        assertDoesNotThrow(() -> validator.validateOrThrow(
                "jdbc:postgresql://db.internal:5432/gymapp",
                "gymapp",
                "a-strong-password",
                "gym-app-mvp-1d7f0",
                "https://securetoken.google.com/gym-app-mvp-1d7f0"));
    }

    @Test
    void rejectsMismatchedFirebaseIssuerForProdLikeMode() {
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> validator.validateOrThrow(
                "jdbc:postgresql://db.internal:5432/gymapp",
                "gymapp",
                "a-strong-password",
                "gym-app-mvp-1d7f0",
                "https://securetoken.google.com/other-project"));

        org.assertj.core.api.Assertions.assertThat(error.getMessage())
                .contains("expected https://securetoken.google.com/gym-app-mvp-1d7f0")
                .contains("configured https://securetoken.google.com/other-project");
    }

    @Test
    void nonProdProfileDoesNotRequireFirebaseConfiguration() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("spring.datasource.url", "jdbc:postgresql://localhost:5432/gymapp")
                .withProperty("spring.datasource.username", "gymapp")
                .withProperty("spring.datasource.password", "gymapp");
        environment.setActiveProfiles("dev");

        assertDoesNotThrow(() -> new ProductionSafetyValidator(environment).validate());
    }
}
