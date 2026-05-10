package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.gymapp.backend.config.ClaimProperties;
import com.gymapp.backend.controller.AccountDeletedException;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.repository.ClaimRepository;
import com.gymapp.backend.repository.IdentityLinkRepository;
import com.gymapp.backend.repository.SyncRepository;
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
    private PasswordEncoder passwordEncoder;

    @Mock
    private ClaimCodeGenerator claimCodeGenerator;

    @Test
    void confirmClaimLocksAndRejectsTombstonedAccountBeforeMutatingGuestData() {
        ClaimService service = new ClaimService(
                claimRepository,
                identityLinkRepository,
                syncRepository,
                accountDeletionRepository,
                passwordEncoder,
                claimCodeGenerator,
                new ClaimProperties());
        when(accountDeletionRepository.isAccountDeleted("issuer|subject")).thenReturn(true);

        assertThatThrownBy(() -> service.confirmClaim("ABCDEFGH", "issuer|subject", "guest-1", "device-1"))
                .isInstanceOf(AccountDeletedException.class);

        InOrder inOrder = inOrder(accountDeletionRepository);
        inOrder.verify(accountDeletionRepository).lockAccountOwnerForTransaction("issuer|subject");
        inOrder.verify(accountDeletionRepository).isAccountDeleted("issuer|subject");
        verifyNoInteractions(claimRepository, identityLinkRepository, syncRepository);
    }
}
