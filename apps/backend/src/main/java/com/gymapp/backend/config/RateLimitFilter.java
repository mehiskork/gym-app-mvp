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
    private static final String SYNC_PREFIX = "sync:";
    private static final String SYNC_REMOTE_PREFIX = "syncRemote:";

    private final ObjectMapper objectMapper;
    private final DeviceTokenRepository deviceTokenRepository;
    private final ConcurrentHashMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    @Value("${rateLimit.sync.capacity:30}")
    private int syncCapacity;

    @Value("${rateLimit.sync.refillPerSecond:10}")
    private double syncRefillPerSecond;

    @Value("${rateLimit.register.capacity:20}")
    private int registerCapacity;

    @Value("${rateLimit.register.refillPerSecond:5}")
    private double registerRefillPerSecond;

    @Value("${rateLimit.claimConfirm.capacity:5}")
    private int claimConfirmCapacity;

    @Value("${rateLimit.claimConfirm.refillPerSecond:0.1}")
    private double claimConfirmRefillPerSecond;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String key = null;
        RateLimitConfig config = null;

        boolean syncRequest = isSyncRequest(request);
        if (syncRequest
                && isRateLimited(buildSyncRemoteKey(request), syncCapacity, syncRefillPerSecond, response)) {
            return;
        }

        if (syncRequest) {
            String deviceId = resolveDeviceId(request);
            if (deviceId != null
                    && !deviceId.isBlank()
                    && isRateLimited(SYNC_PREFIX + deviceId, syncCapacity, syncRefillPerSecond, response)) {
                return;
            }
        } else if (isRegisterRequest(request)) {
            String remoteAddr = request.getRemoteAddr();
            if (remoteAddr != null && !remoteAddr.isBlank()) {
                key = "register:" + remoteAddr;
                config = new RateLimitConfig(registerCapacity, registerRefillPerSecond);
            }
        } else if (isClaimConfirmRequest(request)) {
            String remoteAddr = request.getRemoteAddr();
            if (remoteAddr != null && !remoteAddr.isBlank()) {
                String userId = request.getHeader("X-User-Id");
                if (userId != null && !userId.isBlank()) {
                    key = "claimConfirm:" + remoteAddr + ":" + userId.trim();
                } else {
                    key = "claimConfirm:" + remoteAddr;
                }
                config = new RateLimitConfig(claimConfirmCapacity, claimConfirmRefillPerSecond);
            }
        }

        if (key != null
                && config != null
                && isRateLimited(key, config.capacity(), config.refillPerSecond(), response)) {
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean isRateLimited(
            String key,
            int capacity,
            double refillPerSecond,
            HttpServletResponse response) throws IOException {
        if (key == null || key.isBlank()) {
            return false;
        }
        TokenBucket bucket = buckets.computeIfAbsent(
                key,
                ignored -> new TokenBucket(capacity, refillPerSecond));
        if (!bucket.tryConsume(System.nanoTime())) {
            writeRateLimited(response);
            return true;
        }
        return false;
    }

    private String buildSyncRemoteKey(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return null;
        }
        return SYNC_REMOTE_PREFIX + remoteAddr;
    }

    private boolean isSyncRequest(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod())
                && "/sync".equals(request.getRequestURI());
    }

    private boolean isRegisterRequest(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod())
                && "/device/register".equals(request.getRequestURI());
    }

    private boolean isClaimConfirmRequest(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod())
                && "/claim/confirm".equals(request.getRequestURI());
    }

    private String resolveDeviceId(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            Object principal = authentication.getPrincipal();
            if (principal instanceof DevicePrincipal devicePrincipal) {
                return devicePrincipal.getDeviceId();
            }
            if (principal instanceof String deviceId) {
                return deviceId;
            }
        }

        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            return null;
        }

        String token = auth.substring("Bearer ".length()).trim();
        if (token.isEmpty()) {
            return null;
        }

        var lookup = deviceTokenRepository.findToken(token, Instant.now());
        if (lookup.status() != DeviceTokenRepository.DeviceTokenStatus.VALID) {
            return null;
        }

        return lookup.deviceId();
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
