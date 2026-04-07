package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.DevicePrincipal;
import com.gymapp.backend.config.SyncGuardrailsProperties;
import com.gymapp.backend.model.SyncRequest;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.security.OwnerScope;
import com.gymapp.backend.security.PrincipalOwnerResolver;
import com.gymapp.backend.service.SyncService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
class SyncControllerOwnerScopeTest {

    @Mock
    private SyncService syncService;

    @Mock
    private PrincipalOwnerResolver principalOwnerResolver;

    @Test
    void syncUsesGuestOwnerScopeForDevicePrincipal() {
        SyncGuardrailsProperties guardrailsProperties = new SyncGuardrailsProperties();
        SyncController controller = new SyncController(syncService, guardrailsProperties, principalOwnerResolver);

        DevicePrincipal principal = new DevicePrincipal("device-1", "guest-1");
        Authentication authentication = new UsernamePasswordAuthenticationToken(principal, null, List.of());
        SyncRequest request = new SyncRequest("0", List.of());
        OwnerScope ownerScope = OwnerScope.guest("guest-1");

        when(principalOwnerResolver.resolve(principal)).thenReturn(ownerScope);
        when(syncService.sync(eq("device-1"), eq("guest-1"), eq("0"), eq(List.of())))
                .thenReturn(new SyncResponse(List.of(), "0", List.of(), false));

        SyncResponse response = controller.sync(authentication, request).getBody();

        assertThat(response).isNotNull();
        verify(principalOwnerResolver).resolve(principal);
        verify(syncService).sync("device-1", "guest-1", "0", List.of());
    }

    @Test
    void syncUsesAccountOwnerScopeWhenPrincipalIsAccount() {
        SyncGuardrailsProperties guardrailsProperties = new SyncGuardrailsProperties();
        SyncController controller = new SyncController(syncService, guardrailsProperties, principalOwnerResolver);

        AccountPrincipal principal = AccountPrincipal.builder()
                .principalType("account")
                .externalAccountId("issuer-a|sub-a")
                .issuer("issuer-a")
                .subject("sub-a")
                .build();
        Authentication authentication = new UsernamePasswordAuthenticationToken(principal, null, List.of());
        SyncRequest request = new SyncRequest("0", List.of());
        OwnerScope ownerScope = OwnerScope.account("issuer-a|sub-a");

        when(principalOwnerResolver.resolve(principal)).thenReturn(ownerScope);
        when(syncService.sync(eq(null), eq(ownerScope), eq("0"), eq(List.of())))
                .thenReturn(new SyncResponse(List.of(), "0", List.of(), false));

        SyncResponse response = controller.sync(authentication, request).getBody();

        assertThat(response).isNotNull();
        verify(principalOwnerResolver).resolve(principal);
        verify(syncService).sync(null, ownerScope, "0", List.of());
    }
}