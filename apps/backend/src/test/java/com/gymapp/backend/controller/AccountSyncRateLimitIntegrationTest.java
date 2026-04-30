package com.gymapp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.RateLimitFilter;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.security.OwnerScope;
import com.gymapp.backend.service.SyncService;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AccountSyncRateLimitIntegrationTest {

        @SuppressWarnings("resource")
        @Container
        static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
                        .withDatabaseName("testdb")
                        .withUsername("test")
                        .withPassword("test");

        @DynamicPropertySource
        static void configureProperties(DynamicPropertyRegistry registry) {
                registry.add("spring.datasource.url", postgres::getJdbcUrl);
                registry.add("spring.datasource.username", postgres::getUsername);
                registry.add("spring.datasource.password", postgres::getPassword);
                registry.add("spring.flyway.enabled", () -> "true");
                registry.add("rateLimit.sync.capacity", () -> "20");
                registry.add("rateLimit.sync.refillPerSecond", () -> "0");
                registry.add("rateLimit.sync.account.capacity", () -> "2");
                registry.add("rateLimit.sync.account.refillPerSecond", () -> "0");
        }

        @Autowired
        private MockMvc mockMvc;

        @Autowired
        private DataSource dataSource;

        @Autowired
        private RateLimitFilter rateLimitFilter;

        @MockitoBean
        private SyncService syncService;

        @BeforeEach
        void migrateSchema() {
                reset(syncService);
                clearRateLimitBuckets();
                ReflectionTestUtils.setField(rateLimitFilter, "syncCapacity", 20);
                ReflectionTestUtils.setField(rateLimitFilter, "syncRefillPerSecond", 0d);
                ReflectionTestUtils.setField(rateLimitFilter, "syncAccountCapacity", 2);
                ReflectionTestUtils.setField(rateLimitFilter, "syncAccountRefillPerSecond", 0d);
                Flyway.configure()
                                .dataSource(dataSource)
                                .load()
                                .migrate();
        }

        @Test
        void accountJwtSyncIsRateLimitedByAccountPrincipalAcrossRemoteAddresses() throws Exception {
                String ownerId = "https://issuer.example.test|acct-rate-limited";
                when(syncService.sync(eq(null), eq(OwnerScope.account(ownerId)), any(), any()))
                                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

                mockMvc.perform(accountSync(ownerId, "10.30.0.1")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerId, "10.30.0.2")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerId, "10.30.0.3"))
                                .andExpect(status().isTooManyRequests())
                                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        }

        @Test
        void differentAccountsOnSameRemoteAddressDoNotShareAccountBucket() throws Exception {
                String ownerA = "https://issuer.example.test|acct-a";
                String ownerB = "https://issuer.example.test|acct-b";
                when(syncService.sync(eq(null), eq(OwnerScope.account(ownerA)), any(), any()))
                                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));
                when(syncService.sync(eq(null), eq(OwnerScope.account(ownerB)), any(), any()))
                                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

                mockMvc.perform(accountSync(ownerA, "10.30.1.1")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerA, "10.30.1.1")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerB, "10.30.1.1")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerB, "10.30.1.1")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerB, "10.30.1.1"))
                                .andExpect(status().isTooManyRequests())
                                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        }

        @Test
        void remoteBucketStillAppliesToAccountJwtSync() throws Exception {
                ReflectionTestUtils.setField(rateLimitFilter, "syncCapacity", 2);
                ReflectionTestUtils.setField(rateLimitFilter, "syncAccountCapacity", 20);
                String ownerA = "https://issuer.example.test|acct-remote-a";
                String ownerB = "https://issuer.example.test|acct-remote-b";
                String ownerC = "https://issuer.example.test|acct-remote-c";
                when(syncService.sync(eq(null), any(OwnerScope.class), any(), any()))
                                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

                mockMvc.perform(accountSync(ownerA, "10.30.2.1")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerB, "10.30.2.1")).andExpect(status().isOk());
                mockMvc.perform(accountSync(ownerC, "10.30.2.1"))
                                .andExpect(status().isTooManyRequests())
                                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        }

        @Test
        void invalidAuthDoesNotCreateAccountBucket() throws Exception {
                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer invalid-token")
                                .content("{\"cursor\":null,\"ops\":[]}")
                                .with(req -> {
                                        req.setRemoteAddr("10.30.3.1");
                                        return req;
                                }))
                                .andExpect(status().isUnauthorized());

                org.assertj.core.api.Assertions.assertThat(rateLimitBucketKeys())
                                .noneMatch(key -> key.startsWith("syncAccount:"));
        }

        private MockHttpServletRequestBuilder accountSync(String ownerId, String remoteAddr) {
                AccountPrincipal principal = AccountPrincipal.builder()
                                .principalType("account")
                                .issuer("https://issuer.example.test")
                                .subject(ownerId.substring(ownerId.lastIndexOf('|') + 1))
                                .externalAccountId(ownerId)
                                .build();

                return post("/sync")
                                .with(authentication(new UsernamePasswordAuthenticationToken(
                                                principal,
                                                null,
                                                List.of(new SimpleGrantedAuthority("ROLE_ACCOUNT")))))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"cursor\":null,\"ops\":[]}")
                                .with(req -> {
                                        req.setRemoteAddr(remoteAddr);
                                        return req;
                                });
        }

        private java.util.Set<String> rateLimitBucketKeys() {
                try {
                        Field bucketsField = RateLimitFilter.class.getDeclaredField("buckets");
                        bucketsField.setAccessible(true);
                        @SuppressWarnings("unchecked")
                        Map<String, ?> buckets = (Map<String, ?>) bucketsField.get(rateLimitFilter);
                        return java.util.Set.copyOf(buckets.keySet());
                } catch (ReflectiveOperationException e) {
                        throw new IllegalStateException("Unable to inspect rate limit buckets", e);
                }
        }

        private void clearRateLimitBuckets() {
                try {
                        Field bucketsField = RateLimitFilter.class.getDeclaredField("buckets");
                        bucketsField.setAccessible(true);
                        @SuppressWarnings("unchecked")
                        Map<String, ?> buckets = (Map<String, ?>) bucketsField.get(rateLimitFilter);
                        buckets.clear();
                } catch (ReflectiveOperationException e) {
                        throw new IllegalStateException("Unable to reset rate limit buckets", e);
                }
        }
}
