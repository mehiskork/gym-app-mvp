package com.gymapp.backend.config;

import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.model.ErrorResponse;
import com.gymapp.backend.repository.DeviceTokenRepository;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            DeviceTokenRepository deviceTokenRepository,
            ObjectMapper objectMapper) throws Exception {

        var bearerFilter = new BearerDeviceAuthFilter(deviceTokenRepository, objectMapper);

        http
                .csrf(csrf -> csrf.disable())
                .httpBasic(h -> h.disable())
                .formLogin(f -> f.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/health").permitAll()
                        .requestMatchers("/device/register").permitAll()
                        .requestMatchers("/sync").hasRole("DEVICE")
                        .anyRequest().denyAll())
                .addFilterBefore(bearerFilter, UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeError(res, objectMapper,
                                HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized"))
                        .accessDeniedHandler((req, res, e) -> writeError(res, objectMapper, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden")));

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    private void writeError(
            jakarta.servlet.http.HttpServletResponse response,
            ObjectMapper objectMapper,
            HttpStatus status,
            String code,
            String message) throws IOException {

        String requestId = MDC.get("requestId");
        if (requestId == null || requestId.isBlank())
            requestId = "unknown";

        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(RequestIdFilter.REQUEST_ID_HEADER, requestId);

        objectMapper.writeValue(response.getWriter(), new ErrorResponse(code, message, requestId, null));
    }
}
