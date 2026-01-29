package com.gymapp.backend.config;

import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.model.ErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {
    private static final String RATE_LIMITED_CODE = "RATE_LIMITED";
    private static final String RATE_LIMITED_MESSAGE = "Too many requests";

    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    @Value("${rateLimit.sync.capacity:30}")
    private int syncCapacity;

    @Value("${rateLimit.sync.refillPerSecond:10}")
    private double syncRefillPerSecond;

    @Value("${rateLimit.register.capacity:20}")
    private int registerCapacity;

    @Value("${rateLimit.register.refillPerSecond:5}")
    private double registerRefillPerSecond;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String key = null;
        RateLimitConfig config = null;

        if (isSyncRequest(request)) {
            String deviceId = resolveDeviceId();
            if (deviceId != null && !deviceId.isBlank()) {
                key = "sync:" + deviceId;
                config = new RateLimitConfig(syncCapacity, syncRefillPerSecond);
            }
        } else if (isRegisterRequest(request)) {
            String remoteAddr = request.getRemoteAddr();
            if (remoteAddr != null && !remoteAddr.isBlank()) {
                key = "register:" + remoteAddr;
                config = new RateLimitConfig(registerCapacity, registerRefillPerSecond);
            }
        }

        if (key != null && config != null) {
            int capacity = config.capacity();
            double refillPerSecond = config.refillPerSecond();
            TokenBucket bucket = buckets.computeIfAbsent(
                    key,
                    ignored -> new TokenBucket(capacity, refillPerSecond));
            if (!bucket.tryConsume(System.nanoTime())) {
                writeRateLimited(response);
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean isSyncRequest(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod()) && "/sync".equals(request.getRequestURI());
    }

    private boolean isRegisterRequest(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod()) && "/device/register".equals(request.getRequestURI());
    }

    private String resolveDeviceId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof DevicePrincipal devicePrincipal) {
            return devicePrincipal.getDeviceId();
        }
        if (principal instanceof String deviceId) {
            return deviceId;
        }
        return null;
    }

    private void writeRateLimited(HttpServletResponse response) throws IOException {
        String requestId = MDC.get("requestId");
        if (requestId == null || requestId.isBlank()) {
            requestId = "unknown";
        }

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(RequestIdFilter.REQUEST_ID_HEADER, requestId);

        objectMapper.writeValue(
                response.getWriter(),
                new ErrorResponse(RATE_LIMITED_CODE, RATE_LIMITED_MESSAGE, requestId, null));
    }

    private record RateLimitConfig(int capacity, double refillPerSecond) {
    }

    private static final class TokenBucket {
        private final int capacity;
        private final double refillPerSecond;
        private double tokens;
        private long lastRefillNanos;

        private TokenBucket(int capacity, double refillPerSecond) {
            this.capacity = capacity;
            this.refillPerSecond = refillPerSecond;
            this.tokens = capacity;
            this.lastRefillNanos = System.nanoTime();
        }

        private synchronized boolean tryConsume(long nowNanos) {
            refill(nowNanos);
            if (tokens >= 1d) {
                tokens -= 1d;
                return true;
            }
            return false;
        }

        private void refill(long nowNanos) {
            if (refillPerSecond <= 0d) {
                return;
            }
            long elapsedNanos = nowNanos - lastRefillNanos;
            if (elapsedNanos <= 0L) {
                return;
            }
            double tokensToAdd = (elapsedNanos / 1_000_000_000d) * refillPerSecond;
            if (tokensToAdd <= 0d) {
                return;
            }
            tokens = Math.min(capacity, tokens + tokensToAdd);
            lastRefillNanos = nowNanos;
        }
    }
}