package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.ClaimProperties;
import com.gymapp.backend.controller.AccountDeletedException;
import com.gymapp.backend.model.ClaimStatus;
import com.gymapp.backend.model.ClaimType;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.repository.ClaimRepository;
import com.gymapp.backend.repository.IdentityLinkRepository;
import com.gymapp.backend.repository.SyncRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class ClaimServiceTombstoneTest {
    @Mock
    private ClaimRepository claimRepository;

    @Mock
    private IdentityLinkRepository identityLinkRepository;

    @Mock
    private SyncRepository syncRepository;

    @Mock
    private AccountDeletionRepository accountDeletionRepository;

    @Mock
    private AccountIdentityService accountIdentityService;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private ClaimCodeGenerator claimCodeGenerator;

    @Test
    void confirmClaimValidatesClaimThenRejectsTombstonedAccountBeforeMutatingGuestData() {
        ClaimService service = new ClaimService(
                claimRepository,
                identityLinkRepository,
                syncRepository,
                accountDeletionRepository,
                accountIdentityService,
                passwordEncoder,
                claimCodeGenerator,
                new ClaimProperties());
        AccountPrincipal principal = AccountPrincipal.builder()
                .principalType("account")
                .externalAccountId("issuer|subject")
                .issuer("issuer")
                .subject("subject")
                .build();
        ClaimRepository.ClaimRecord claim = new ClaimRepository.ClaimRecord(
                UUID.randomUUID(),
                ClaimType.CODE,
                "hash",
                "guest-1",
                "device-1",
                ClaimStatus.PENDING,
                Instant.now(),
                Instant.now().plusSeconds(600),
                null,
                null);
        when(claimRepository.findClaimCandidatesForGuestDevice(
                org.mockito.ArgumentMatchers.eq(ClaimType.CODE),
                org.mockito.ArgumentMatchers.eq("guest-1"),
                org.mockito.ArgumentMatchers.eq("device-1"),
                org.mockito.ArgumentMatchers.any(Instant.class))).thenReturn(List.of(claim));
        when(passwordEncoder.matches("ABCDEFGH", "hash")).thenReturn(true);
        when(accountIdentityService.resolveOrCreateForClaim(principal)).thenThrow(new AccountDeletedException());

        assertThatThrownBy(() -> service.confirmClaim("ABCDEFGH", principal, "guest-1", "device-1"))
                .isInstanceOf(AccountDeletedException.class);

        InOrder inOrder = inOrder(accountIdentityService);
        inOrder.verify(accountIdentityService).resolveOrCreateForClaim(principal);
        verifyNoInteractions(identityLinkRepository, syncRepository, accountDeletionRepository);
    }
}
