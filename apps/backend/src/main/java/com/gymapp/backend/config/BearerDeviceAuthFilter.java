package com.gymapp.backend.config;

import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.model.ErrorResponse;
import com.gymapp.backend.repository.DeviceTokenRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

@Slf4j
@RequiredArgsConstructor
public class BearerDeviceAuthFilter extends OncePerRequestFilter {

    private final DeviceTokenRepository deviceTokenRepository;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        // Only enforce on device-auth endpoints (keep register + health public)
        if (!isDeviceProtectedPath(request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }

        String auth = request.getHeader("Authorization");

        // Missing / non-bearer: let Spring Security entrypoint produce the 401
        if (auth == null || !auth.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = auth.substring("Bearer ".length()).trim();
        if (token.isEmpty()) {
            writeUnauthorized(response, "AUTH_UNAUTHORIZED", "Missing Bearer token");
            return;
        }

        if ("/sync".equals(request.getRequestURI()) && isJwtLikeToken(token)) {
            filterChain.doFilter(request, response);
            return;
        }

        var lookup = resolveLookup(request, token);
        if (lookup.status() == DeviceTokenRepository.DeviceTokenStatus.NOT_FOUND) {

            writeUnauthorized(response, "AUTH_INVALID_TOKEN", "Invalid token");
            return;
        }
        if (lookup.status() == DeviceTokenRepository.DeviceTokenStatus.EXPIRED) {
            writeUnauthorized(response, "AUTH_TOKEN_EXPIRED", "Expired token");
            return;
        }

        var authn = new UsernamePasswordAuthenticationToken(
                new DevicePrincipal(lookup.deviceId(), lookup.guestUserId()),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_DEVICE")));
        SecurityContextHolder.getContext().setAuthentication(authn);

        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"/sync".equals(request.getRequestURI())) {
            return false;
        }

        Authentication existingAuthentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = existingAuthentication != null ? existingAuthentication.getPrincipal() : null;

        return existingAuthentication != null
                && existingAuthentication.isAuthenticated()
                && !(existingAuthentication instanceof AnonymousAuthenticationToken)
                && principal instanceof AccountPrincipal;
    }

    private DeviceTokenRepository.DeviceTokenLookupResult resolveLookup(HttpServletRequest request, String token) {
        Object existingLookup = request.getAttribute(DeviceTokenRepository.TOKEN_LOOKUP_RESULT_REQUEST_ATTRIBUTE);
        if (existingLookup instanceof DeviceTokenRepository.DeviceTokenLookupResult lookupResult) {
            return lookupResult;
        }

        var lookup = deviceTokenRepository.findToken(token, Instant.now());
        request.setAttribute(DeviceTokenRepository.TOKEN_LOOKUP_RESULT_REQUEST_ATTRIBUTE, lookup);
        return lookup;
    }

    private boolean isDeviceProtectedPath(String requestUri) {
        return "/sync".equals(requestUri) || "/claim/start".equals(requestUri);
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

    private void writeUnauthorized(HttpServletResponse response, String code, String message) throws IOException {
        String requestId = MDC.get("requestId");
        if (requestId == null || requestId.isBlank())
            requestId = "unknown";

        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(RequestIdFilter.REQUEST_ID_HEADER, requestId);

        objectMapper.writeValue(response.getWriter(), new ErrorResponse(code, message, requestId, null));
    }
}
