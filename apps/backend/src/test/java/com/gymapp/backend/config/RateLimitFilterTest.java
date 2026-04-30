package com.gymapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.repository.DeviceTokenRepository;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

class RateLimitFilterTest {
    private RateLimitFilter filter;

    @BeforeEach
    void setUp() {
        filter = new RateLimitFilter(new ObjectMapper(), mock(DeviceTokenRepository.class));
        ReflectionTestUtils.setField(filter, "syncMaxBuckets", 100);
        ReflectionTestUtils.setField(filter, "syncCleanupBatchSize", 20);
        ReflectionTestUtils.setField(filter, "syncStaleAfterSeconds", 0L);
        ReflectionTestUtils.setField(filter, "syncCapacity", 100);
        ReflectionTestUtils.setField(filter, "syncRefillPerSecond", 0d);
        ReflectionTestUtils.setField(filter, "syncAccountCapacity", 100);
        ReflectionTestUtils.setField(filter, "syncAccountRefillPerSecond", 0d);
        ReflectionTestUtils.setField(filter, "registerCapacity", 100);
        ReflectionTestUtils.setField(filter, "registerRefillPerSecond", 0d);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void boundedCleanupRemovesStaleSyncAccountDeviceAndRemoteBucketsButPreservesProtectedAndUnrelated()
            throws Exception {
        hitAccountSync("old-account");
        hitAccountSync("protected-account");
        hitDeviceSync("old-device", "10.40.0.1");
        hitRemoteSync("10.40.0.2");
        hitRegister("10.40.0.3");

        ReflectionTestUtils.setField(filter, "syncMaxBuckets", 1);
        ReflectionTestUtils.invokeMethod(
                filter,
                "boundedCleanup",
                System.nanoTime(),
                "syncAccount:protected-account");

        assertThat(bucketKeys())
                .contains("syncAccount:protected-account", "register:10.40.0.3")
                .doesNotContain(
                        "syncAccount:old-account",
                        "sync:old-device",
                        "syncRemote:10.40.0.1",
                        "syncRemote:10.40.0.2");
    }

    private void hitAccountSync(String ownerId) throws Exception {
        AccountPrincipal principal = AccountPrincipal.builder()
                .principalType("account")
                .issuer("https://securetoken.google.com/gym-app-mvp-1d7f0")
                .subject(ownerId)
                .externalAccountId(ownerId)
                .build();

        filter.rateLimitAccountSync(principal, new MockHttpServletResponse());
    }

    private void hitDeviceSync(String deviceId, String remoteAddr) throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(deviceId, null, List.of()));
        doFilter("POST", "/sync", remoteAddr);
        SecurityContextHolder.clearContext();
    }

    private void hitRemoteSync(String remoteAddr) throws Exception {
        doFilter("POST", "/sync", remoteAddr);
    }

    private void hitRegister(String remoteAddr) throws Exception {
        doFilter("POST", "/device/register", remoteAddr);
    }

    private void doFilter(String method, String requestUri, String remoteAddr) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, requestUri);
        request.setRemoteAddr(remoteAddr);
        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
    }

    private Set<String> bucketKeys() {
        @SuppressWarnings("unchecked")
        Map<String, ?> buckets = (Map<String, ?>) ReflectionTestUtils.getField(filter, "buckets");
        return buckets.keySet();
    }
}
