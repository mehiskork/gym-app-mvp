package com.gymapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @Test
    void echoesValidRequestId() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader(RequestIdFilter.REQUEST_ID_HEADER, "req-123_ABC.trace");

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader(RequestIdFilter.REQUEST_ID_HEADER)).isEqualTo("req-123_ABC.trace");
        assertThat(request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE)).isEqualTo("req-123_ABC.trace");
        assertThat(MDC.get(RequestIdFilter.REQUEST_ID_ATTRIBUTE)).isNull();
    }

    @Test
    void replacesTooLongRequestId() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader(RequestIdFilter.REQUEST_ID_HEADER, "a".repeat(65));

        filter.doFilter(request, response, new MockFilterChain());

        assertGeneratedSafeRequestId(response);
    }

    @Test
    void replacesUnsafeRequestIdCharacters() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader(RequestIdFilter.REQUEST_ID_HEADER, "req-1\nInjected: yes");

        filter.doFilter(request, response, new MockFilterChain());

        assertGeneratedSafeRequestId(response);
    }

    @Test
    void generatesRequestIdWhenMissing() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertGeneratedSafeRequestId(response);
    }

    private void assertGeneratedSafeRequestId(MockHttpServletResponse response) {
        String requestId = response.getHeader(RequestIdFilter.REQUEST_ID_HEADER);
        assertThat(requestId)
                .isNotBlank()
                .hasSizeLessThanOrEqualTo(64)
                .matches("[A-Za-z0-9._-]+");
    }
}
