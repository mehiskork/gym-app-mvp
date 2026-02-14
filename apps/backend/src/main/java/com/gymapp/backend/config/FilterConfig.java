package com.gymapp.backend.config;

import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.repository.DeviceTokenRepository;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration
public class FilterConfig {
    @Bean
    public FilterRegistrationBean<RequestIdFilter> requestIdFilterRegistration(RequestIdFilter filter) {
        FilterRegistrationBean<RequestIdFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return reg;
    }

    @Bean
    public com.gymapp.backend.config.RateLimitFilter rateLimitFilter(
            ObjectMapper objectMapper, DeviceTokenRepository deviceTokenRepository) {
        return new com.gymapp.backend.config.RateLimitFilter(objectMapper, deviceTokenRepository);
    }

    @Bean
    public FilterRegistrationBean<com.gymapp.backend.config.RateLimitFilter> rateLimitFilterRegistration(
            com.gymapp.backend.config.RateLimitFilter filter) {
        FilterRegistrationBean<com.gymapp.backend.config.RateLimitFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }
}
