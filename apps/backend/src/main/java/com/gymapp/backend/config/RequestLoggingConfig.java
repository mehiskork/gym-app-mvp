package com.gymapp.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.web.filter.CommonsRequestLoggingFilter;

@Configuration
public class RequestLoggingConfig {
    @Value("${app.logging.request.include-payload:false}")
    private boolean includePayload;

    @Bean
    public CommonsRequestLoggingFilter requestLoggingFilter(Environment environment) {
        if (includePayload && ProductionSafetyValidator.isProdLike(environment)) {
            throw new IllegalStateException(
                    "Prod-like profile cannot enable app.logging.request.include-payload");
        }

        CommonsRequestLoggingFilter filter = new CommonsRequestLoggingFilter();
        filter.setIncludeClientInfo(true);
        filter.setIncludeQueryString(true);
        filter.setIncludeHeaders(false);
        filter.setIncludePayload(includePayload);
        filter.setMaxPayloadLength(5000);
        return filter;
    }
}
