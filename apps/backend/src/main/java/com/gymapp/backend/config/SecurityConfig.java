package com.gymapp.backend.config;

import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.model.ErrorResponse;
import com.gymapp.backend.repository.DeviceTokenRepository;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.util.StringUtils;

@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private final DeviceTokenRepository deviceTokenRepository;
    private final RateLimitFilter rateLimitFilter;
    private final ObjectMapper objectMapper;

    @Bean
    @Order(1)
    public SecurityFilterChain accountSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher("/me")
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeUnauthorized(res, e))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden")));

        return http.build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain deviceSecurityFilterChain(HttpSecurity http) throws Exception {

        var bearerFilter = new BearerDeviceAuthFilter(deviceTokenRepository, objectMapper);

        http
                .securityMatcher("/sync", "/claim/start")
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/sync", "/claim/start").hasRole("DEVICE")
                        .anyRequest().denyAll())
                .addFilterBefore(bearerFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(rateLimitFilter, BearerDeviceAuthFilter.class)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeError(res,
                                HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized"))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden")));

        return http.build();
    }

    @Bean
    @Order(3)
    public SecurityFilterChain fallbackSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/health").permitAll()
                        .requestMatchers("/ready").permitAll()
                        .requestMatchers("/device/register").permitAll()
                        .requestMatchers("/claim/confirm").permitAll()
                        .anyRequest().denyAll())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeError(res,
                                HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized"))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden")));

        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder(
            @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}") String issuerUri,
            @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri:}") String jwkSetUri) {
        AtomicReference<JwtDecoder> delegateRef = new AtomicReference<>();
        return token -> {
            JwtDecoder delegate = delegateRef.get();
            if (delegate == null) {
                delegate = buildJwtDecoder(issuerUri, jwkSetUri);
                if (!delegateRef.compareAndSet(null, delegate)) {
                    delegate = delegateRef.get();
                }
            }
            return delegate.decode(token);
        };
    }

    private JwtDecoder buildJwtDecoder(String issuerUri, String jwkSetUri) {

        if (StringUtils.hasText(jwkSetUri)) {
            return NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        }

        if (StringUtils.hasText(issuerUri)) {
            return NimbusJwtDecoder.withIssuerLocation(issuerUri).build();
        }

        return token -> {
            throw new BadJwtException("Invalid token");
        };
    }

    private void writeUnauthorized(jakarta.servlet.http.HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        if (ex instanceof OAuth2AuthenticationException oauth2Ex) {
            writeError(response, HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", oauth2Ex.getError().getDescription());
            return;
        }
        writeError(response, HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized");
    }

    private void writeError(
            jakarta.servlet.http.HttpServletResponse response,
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
