package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.gymapp.backend.model.ErrorResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ApiExceptionHandlerTest {

    @Test
    void illegalArgumentResponseUsesGenericClientSafeMessage() {
        ApiExceptionHandler handler = new ApiExceptionHandler();
        IllegalArgumentException exception = new IllegalArgumentException(
                "Unsupported principal type com.gymapp.backend.config.AccountPrincipal; "
                        + "issuer-subject delimiter missing in external account id");

        ResponseEntity<ErrorResponse> response = handler.handleIllegalArgument(exception);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("BAD_REQUEST");
        assertThat(response.getBody().message()).isEqualTo("Bad request");
        assertThat(response.getBody().details()).isNull();
        assertThat(response.getBody().toString())
                .doesNotContain("IllegalArgumentException")
                .doesNotContain("com.gymapp.backend")
                .doesNotContain("AccountPrincipal")
                .doesNotContain("issuer-subject delimiter")
                .doesNotContain("external account id");
    }
}
