package com.gymapp.backend.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.config.ClaimConfirmDevHeaderGuard;
import com.gymapp.backend.model.ClaimConfirmResponse;
import com.gymapp.backend.service.ClaimService;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class ClaimControllerTest {

    @Mock
    private ClaimService claimService;

    @Mock
    private ClaimConfirmDevHeaderGuard claimConfirmDevHeaderGuard;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ClaimController controller = new ClaimController(claimService, claimConfirmDevHeaderGuard);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void confirmRejectsDevHeaderPathWhenDisabledAtRuntime() throws Exception {
        when(claimConfirmDevHeaderGuard.isDevHeaderAllowed()).thenReturn(false);

        mockMvc.perform(post("/claim/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-User-Id", UUID.randomUUID().toString())
                .content("{\"code\":\"ABC12345\"}"))
                .andExpect(status().isNotImplemented())
                .andExpect(jsonPath("$.code").value("AUTH_NOT_CONFIGURED"));
    }

    @Test
    void confirmAllowsDevHeaderPathWhenExplicitlyEnabled() throws Exception {
        String guestUserId = UUID.randomUUID().toString();
        String userId = UUID.randomUUID().toString();

        when(claimConfirmDevHeaderGuard.isDevHeaderAllowed()).thenReturn(true);
        when(claimService.confirmClaim("ABC12345", userId))
                .thenReturn(new ClaimConfirmResponse(guestUserId, userId, "CLAIMED"));

        mockMvc.perform(post("/claim/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-User-Id", userId)
                .content("{\"code\":\"ABC12345\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guestUserId").value(guestUserId))
                .andExpect(jsonPath("$.userId").value(userId))
                .andExpect(jsonPath("$.status").value("CLAIMED"));
    }
}