package com.gymapp.backend.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.model.ClaimConfirmResponse;
import com.gymapp.backend.service.ClaimService;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class ClaimControllerTest {

    @Mock
    private ClaimService claimService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ClaimController controller = new ClaimController(claimService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void confirmRequiresAccountPrincipal() throws Exception {
        TestingAuthenticationToken authentication = new TestingAuthenticationToken("device-1", null);

        mockMvc.perform(post("/claim/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .principal(authentication)
                .content("{\"code\":\"ABC12345\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void confirmUsesAccountPrincipalExternalAccountId() throws Exception {
        String guestUserId = UUID.randomUUID().toString();
        String accountOwnerId = "https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-user-1";
        AccountPrincipal accountPrincipal = AccountPrincipal.builder()
                .principalType("account")
                .issuer("https://securetoken.google.com/gym-app-mvp-1d7f0")
                .subject("firebase-user-1")
                .externalAccountId(accountOwnerId)
                .build();
        TestingAuthenticationToken authentication = new TestingAuthenticationToken(accountPrincipal, null);

        when(claimService.confirmClaim("ABC12345", accountOwnerId))
                .thenReturn(new ClaimConfirmResponse(guestUserId, accountOwnerId, "CLAIMED"));

        mockMvc.perform(post("/claim/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .principal(authentication)
                .header("X-User-Id", "00000000-0000-0000-0000-000000000000")
                .content("{\"code\":\"ABC12345\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guestUserId").value(guestUserId))
                .andExpect(jsonPath("$.userId").value(accountOwnerId))
                .andExpect(jsonPath("$.status").value("CLAIMED"));
    }
}
