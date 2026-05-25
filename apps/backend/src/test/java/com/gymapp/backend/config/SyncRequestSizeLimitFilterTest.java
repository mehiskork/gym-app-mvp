package com.gymapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

class SyncRequestSizeLimitFilterTest {
    @Test
    void oversizedDeclaredSyncBodyReturnsPayloadTooLargeBeforeChain() throws Exception {
        SyncRequestSizeLimitFilter filter = filterWithMaxBytes(8);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/sync");
        request.setContent("0123456789".getBytes());
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain() {
            @Override
            public void doFilter(ServletRequest request, ServletResponse response) {
                fail("filter chain should not be called");
            }
        });

        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(response.getContentAsString()).contains("PAYLOAD_TOO_LARGE");
    }

    @Test
    void allowedSyncBodyIsCachedAndPassedToChain() throws Exception {
        SyncRequestSizeLimitFilter filter = filterWithMaxBytes(64);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/sync");
        request.setContent("{\"cursor\":null,\"ops\":[]}".getBytes());
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(new String(chain.getRequest().getInputStream().readAllBytes(), StandardCharsets.UTF_8))
                .isEqualTo("{\"cursor\":null,\"ops\":[]}");
    }

    private SyncRequestSizeLimitFilter filterWithMaxBytes(int maxBytes) {
        SyncGuardrailsProperties properties = new SyncGuardrailsProperties();
        properties.setMaxRequestBodyBytes(maxBytes);
        return new SyncRequestSizeLimitFilter(properties, JsonMapper.builder().findAndAddModules().build());
    }
}
