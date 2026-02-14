package com.gymapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.filter.CommonsRequestLoggingFilter;

class RequestLoggingConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(RequestLoggingConfig.class);

    @Test
    void payloadLoggingIsDisabledByDefault() {
        contextRunner.run(context -> {
            CommonsRequestLoggingFilter filter = context.getBean(CommonsRequestLoggingFilter.class);
            assertThat(readIncludePayload(filter)).isFalse();
        });
    }

    @Test
    void payloadLoggingCanBeEnabledWithProperty() {
        contextRunner
                .withPropertyValues("app.logging.request.include-payload=true")
                .run(context -> {
                    CommonsRequestLoggingFilter filter = context.getBean(CommonsRequestLoggingFilter.class);
                    assertThat(readIncludePayload(filter)).isTrue();
                });
    }

    private boolean readIncludePayload(CommonsRequestLoggingFilter filter) {
        Object includePayload = ReflectionTestUtils.getField(filter, "includePayload");
        return includePayload instanceof Boolean value && value;
    }
}