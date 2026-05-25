package com.gymapp.backend.config;

import com.gymapp.backend.model.ErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class SyncRequestSizeLimitFilter extends OncePerRequestFilter {
    private final SyncGuardrailsProperties syncGuardrailsProperties;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if (!isSyncPost(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        int maxBytes = syncGuardrailsProperties.getMaxRequestBodyBytes();
        long declaredLength = request.getContentLengthLong();
        if (declaredLength > maxBytes) {
            writePayloadTooLarge(response, maxBytes, declaredLength);
            return;
        }

        BodyReadResult body = readBody(request, maxBytes);
        if (body.tooLarge()) {
            writePayloadTooLarge(response, maxBytes, body.bytesRead());
            return;
        }
        filterChain.doFilter(new CachedBodyRequestWrapper(request, body.body()), response);
    }

    private boolean isSyncPost(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod()) && "/sync".equals(request.getRequestURI());
    }

    private void writePayloadTooLarge(HttpServletResponse response, int maxBytes, long actualBytes)
            throws IOException {
        response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        String requestId = MDC.get("requestId");
        if (requestId == null || requestId.isBlank()) {
            requestId = "unknown";
        }
        ErrorResponse body = new ErrorResponse(
                "PAYLOAD_TOO_LARGE",
                "Request body exceeds max allowed size",
                requestId,
                Map.of("field", "body", "maxAllowed", maxBytes, "actual", actualBytes));
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }

    private BodyReadResult readBody(HttpServletRequest request, int maxBytes) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(Math.min(maxBytes, 8192));
        byte[] chunk = new byte[8192];
        long bytesRead = 0L;
        int read;
        ServletInputStream input = request.getInputStream();
        while ((read = input.read(chunk)) != -1) {
            bytesRead += read;
            if (bytesRead > maxBytes) {
                return new BodyReadResult(buffer.toByteArray(), true, bytesRead);
            }
            buffer.write(chunk, 0, read);
        }
        return new BodyReadResult(buffer.toByteArray(), false, bytesRead);
    }

    private record BodyReadResult(byte[] body, boolean tooLarge, long bytesRead) {
    }

    private static class CachedBodyRequestWrapper extends HttpServletRequestWrapper {
        private final byte[] body;

        CachedBodyRequestWrapper(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            return new CachedBodyServletInputStream(body);
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }

    private static class CachedBodyServletInputStream extends ServletInputStream {
        private final ByteArrayInputStream delegate;

        CachedBodyServletInputStream(byte[] body) {
            this.delegate = new ByteArrayInputStream(body);
        }

        @Override
        public int read() throws IOException {
            return delegate.read();
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            return delegate.read(b, off, len);
        }

        @Override
        public boolean isFinished() {
            return delegate.available() == 0;
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            if (readListener != null) {
                try {
                    readListener.onDataAvailable();
                    if (isFinished()) {
                        readListener.onAllDataRead();
                    }
                } catch (IOException ex) {
                    readListener.onError(ex);
                }
            }
        }
    }
}
