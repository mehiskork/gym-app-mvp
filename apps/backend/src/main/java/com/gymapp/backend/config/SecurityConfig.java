package com.gymapp.backend.config;

import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.model.ErrorResponse;
import com.gymapp.backend.repository.DeviceTokenRepository;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.core.convert.converter.Converter;
import org.springframework.util.StringUtils;

@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private final DeviceTokenRepository deviceTokenRepository;
    private final RateLimitFilter rateLimitFilter;
    private final ObjectMapper objectMapper;
    private final PrincipalMapper principalMapper;
    private final FirebaseJwtValidator firebaseJwtValidator;

    @Bean
    @Order(1)
    public SecurityFilterChain accountSecurityFilterChain(
            HttpSecurity http,
            Converter<org.springframework.security.oauth2.jwt.Jwt, JwtAuthenticationToken> accountJwtAuthenticationConverter)
            throws Exception {
        http
                .securityMatcher("/me")
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(accountJwtAuthenticationConverter))
                        .authenticationEntryPoint((req, res, e) -> writeUnauthorized(res, e))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden", null)))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeUnauthorized(res, e))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden", null)));

        return http.build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain claimStartSecurityFilterChain(HttpSecurity http) throws Exception {

        var bearerFilter = new BearerDeviceAuthFilter(deviceTokenRepository, objectMapper);

        http
                .securityMatcher("/claim/start")
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/claim/start").hasRole("DEVICE")
                        .anyRequest().denyAll())
                .addFilterBefore(bearerFilter, BearerTokenAuthenticationFilter.class)
                .addFilterBefore(rateLimitFilter, BearerDeviceAuthFilter.class)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeError(res,
                                HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized", null))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden", null)));

        return http.build();
    }

    @Bean
    @Order(3)
    public SecurityFilterChain syncSecurityFilterChain(
            HttpSecurity http,
            Converter<org.springframework.security.oauth2.jwt.Jwt, JwtAuthenticationToken> accountJwtAuthenticationConverter)
            throws Exception {
        var bearerFilter = new BearerDeviceAuthFilter(deviceTokenRepository, objectMapper);

        http
                .securityMatcher("/sync")
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/sync").authenticated()
                        .anyRequest().denyAll())
                .addFilterBefore(bearerFilter, BearerTokenAuthenticationFilter.class)
                .addFilterBefore(rateLimitFilter, BearerDeviceAuthFilter.class)
                .oauth2ResourceServer(oauth2 -> oauth2
                        .bearerTokenResolver(jwtLikeBearerTokenResolver())
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(accountJwtAuthenticationConverter))
                        .authenticationEntryPoint((req, res, e) -> writeUnauthorized(res, e))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden", null)))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeError(res,
                                HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized", null))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden", null)));

        return http.build();
    }

    @Bean
    @Order(4)
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
                                HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized", null))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                                "AUTH_FORBIDDEN", "Forbidden", null)));

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
        if (!StringUtils.hasText(issuerUri)) {
            return token -> {
                throw new BadJwtException("Account JWT issuer is not configured");
            };
        }

        NimbusJwtDecoder decoder;

        if (StringUtils.hasText(jwkSetUri)) {
            decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        } else {
            decoder = NimbusJwtDecoder.withIssuerLocation(issuerUri).build();
        }

        decoder.setJwtValidator(firebaseJwtValidator.validator(issuerUri));
        return decoder;
    }

    @Bean
    public Converter<org.springframework.security.oauth2.jwt.Jwt, JwtAuthenticationToken> accountJwtAuthenticationConverter() {
        return jwt -> {
            AccountPrincipal accountPrincipal = principalMapper.toAccountPrincipal(jwt);
            GrantedAuthority authority = new SimpleGrantedAuthority("ROLE_ACCOUNT");
            return new JwtAuthenticationToken(jwt, java.util.List.of(authority),
                    accountPrincipal.getExternalAccountId()) {
                @Override
                public Object getPrincipal() {
                    return accountPrincipal;
                }
            };
        };
    }

    private BearerTokenResolver jwtLikeBearerTokenResolver() {
        DefaultBearerTokenResolver defaultResolver = new DefaultBearerTokenResolver();
        return request -> {
            String token = defaultResolver.resolve(request);
            if (token == null) {
                return null;
            }
            return isJwtLikeToken(token) ? token : null;
        };
    }

    private boolean isJwtLikeToken(String token) {
        int firstDot = token.indexOf('.');
        if (firstDot <= 0) {
            return false;
        }
        int secondDot = token.indexOf('.', firstDot + 1);
        if (secondDot <= firstDot + 1 || secondDot == token.length() - 1) {
            return false;
        }
        return token.indexOf('.', secondDot + 1) == -1;
    }

    private void writeUnauthorized(jakarta.servlet.http.HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        if (ex instanceof OAuth2AuthenticationException oauth2Ex) {
            writeError(response, HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", oauth2Ex.getError().getDescription(),
                    Map.of("authMode", "account_jwt"));
            return;
        }
        writeError(response, HttpStatus.UNAUTHORIZED, "AUTH_UNAUTHORIZED", "Unauthorized", null);
    }

    private void writeError(
            jakarta.servlet.http.HttpServletResponse response,
            HttpStatus status,
            String code,
            String message,
            Map<String, Object> details) throws IOException {

        String requestId = MDC.get("requestId");
        if (requestId == null || requestId.isBlank())
            requestId = "unknown";

        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(RequestIdFilter.REQUEST_ID_HEADER, requestId);

        objectMapper.writeValue(response.getWriter(), new ErrorResponse(code, message, requestId, details));
    }
}
