package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.config.RequestIdFilter;
import com.gymapp.backend.repository.DeviceTokenRepository;
import com.gymapp.backend.service.SyncService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class SyncControllerErrorTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private SyncService syncService;
    @MockitoBean
    private DeviceTokenRepository deviceTokenRepository;

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
                .andExpect(jsonPath("$.requestId").value(requestId));
    }
}
