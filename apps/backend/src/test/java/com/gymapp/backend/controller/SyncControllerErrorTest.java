package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.gymapp.backend.config.BearerDeviceAuthFilter;
import com.gymapp.backend.config.RequestIdFilter;
import com.gymapp.backend.config.SyncGuardrailsProperties;
import com.gymapp.backend.model.ErrorResponse;
import com.gymapp.backend.repository.DeviceTokenRepository;
import com.gymapp.backend.security.PrincipalOwnerResolver;
import com.gymapp.backend.service.SyncService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

class SyncControllerErrorTest {

        private MockMvc mockMvc;
        private ObjectMapper objectMapper;
        private SyncService syncService;
        private DeviceTokenRepository deviceTokenRepository;
        private SyncGuardrailsProperties syncGuardrailsProperties;
        private PrincipalOwnerResolver principalOwnerResolver;

        @BeforeEach
        void setUp() {
                SecurityContextHolder.clearContext();
                objectMapper = JsonMapper.builder().findAndAddModules().build();
                syncService = mock(SyncService.class);
                deviceTokenRepository = mock(DeviceTokenRepository.class);
                syncGuardrailsProperties = mock(SyncGuardrailsProperties.class);
                principalOwnerResolver = mock(PrincipalOwnerResolver.class);

                mockMvc = MockMvcBuilders
                                .standaloneSetup(new SyncController(
                                                syncService,
                                                syncGuardrailsProperties,
                                                principalOwnerResolver))
                                .setControllerAdvice(new ApiExceptionHandler())
                                .addFilters(
                                                new RequestIdFilter(),
                                                new BearerDeviceAuthFilter(deviceTokenRepository, objectMapper),
                                                new SyncAuthenticationRequiredFilter(objectMapper))
                                .build();
        }

        @Test
        void missingRequestIdHeaderGeneratesOneOnBadJson_whenAuthorized() throws Exception {
                // Arrange: pass security so we can test JSON parsing behavior
                when(deviceTokenRepository.findToken(any(), any()))
                                .thenReturn(DeviceTokenRepository.DeviceTokenLookupResult.valid("device-1", "guest-1"));

                MvcResult result = mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer good-token")
                                .content("{bad"))
                                .andExpect(status().isBadRequest())
                                .andExpect(header().exists(RequestIdFilter.REQUEST_ID_HEADER))
                                .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                                .andReturn();

                String requestId = result.getResponse().getHeader(RequestIdFilter.REQUEST_ID_HEADER);
                JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
                assertThat(body.get("requestId").asString()).isEqualTo(requestId);
        }

        @Test
        void providedRequestIdIsEchoedOnUnauthorized_whenMissingBearer() throws Exception {
                String requestId = "req-123";

                MvcResult result = mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header(RequestIdFilter.REQUEST_ID_HEADER, requestId)
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(header().string(RequestIdFilter.REQUEST_ID_HEADER, requestId))
                                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"))
                                .andReturn();

                JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
                assertThat(body.get("requestId").asString()).isEqualTo(requestId);
        }

        @Test
        void invalidBearerReturnsUnauthorized_withStructuredError() throws Exception {
                String requestId = "req-456";
                when(deviceTokenRepository.findToken(any(), any()))
                                .thenReturn(DeviceTokenRepository.DeviceTokenLookupResult.notFound());

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header(RequestIdFilter.REQUEST_ID_HEADER, requestId)
                                .header("Authorization", "Bearer bad-token")
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(header().string(RequestIdFilter.REQUEST_ID_HEADER, requestId))
                                .andExpect(jsonPath("$.code").value("AUTH_INVALID_TOKEN"))
                                .andExpect(jsonPath("$.details.authMode").value("device_token"))
                                .andExpect(jsonPath("$.requestId").value(requestId));
        }

        private static final class SyncAuthenticationRequiredFilter extends OncePerRequestFilter {
                private final ObjectMapper objectMapper;

                private SyncAuthenticationRequiredFilter(ObjectMapper objectMapper) {
                        this.objectMapper = objectMapper;
                }

                @Override
                protected void doFilterInternal(
                                HttpServletRequest request,
                                HttpServletResponse response,
                                FilterChain filterChain) throws ServletException, IOException {
                        if (!"POST".equalsIgnoreCase(request.getMethod()) || !"/sync".equals(request.getRequestURI())) {
                                filterChain.doFilter(request, response);
                                return;
                        }

                        if (SecurityContextHolder.getContext().getAuthentication() != null) {
                                filterChain.doFilter(request, response);
                                return;
                        }

                        String requestId = MDC.get(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
                        if (requestId == null || requestId.isBlank()) {
                                requestId = "unknown";
                        }

                        response.setStatus(HttpStatus.UNAUTHORIZED.value());
                        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                        response.setHeader(RequestIdFilter.REQUEST_ID_HEADER, requestId);
                        objectMapper.writeValue(response.getWriter(),
                                        new ErrorResponse("AUTH_UNAUTHORIZED", "Unauthorized", requestId, null));
                }
        }
}
