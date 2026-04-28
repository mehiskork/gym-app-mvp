package com.gymapp.backend.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

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
}
