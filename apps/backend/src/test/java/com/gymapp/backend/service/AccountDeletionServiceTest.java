package com.gymapp.backend.service;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.service.AccountIdentityService.AccountDeletionResolution;
import com.gymapp.backend.security.PrincipalOwnerResolver;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AccountDeletionServiceTest {
    @Mock
    private AccountDeletionRepository accountDeletionRepository;

    @Mock
    private PrincipalOwnerResolver principalOwnerResolver;

    @Mock
    private AccountIdentityService accountIdentityService;

    @Test
    void deleteAccountLocksReadsLinkedScopesMarksTombstoneThenDeletesRows() {
        AccountDeletionService service = new AccountDeletionService(accountDeletionRepository, principalOwnerResolver,
                accountIdentityService);
        AccountPrincipal principal = AccountPrincipal.builder()
                .principalType("account")
                .issuer("issuer")
                .subject("subject")
                .externalAccountId("issuer|subject")
                .build();
        List<String> linkedGuestScopes = List.of("guest-1");

        when(accountIdentityService.resolveForAccountDeletion(principal))
                .thenReturn(new AccountDeletionResolution("issuer|subject", "issuer|subject", false));
        when(accountDeletionRepository.findLinkedGuestScopes("issuer|subject")).thenReturn(linkedGuestScopes);
        when(accountDeletionRepository.deleteAccountData("issuer|subject", linkedGuestScopes))
                .thenReturn(new AccountDeletionRepository.AccountDeletionResult(
                        1,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0));

        service.deleteAccount(principal);

        InOrder inOrder = inOrder(accountDeletionRepository);
        inOrder.verify(accountDeletionRepository).lockAccountOwnerForTransaction("issuer|subject");
        inOrder.verify(accountDeletionRepository).findLinkedGuestScopes("issuer|subject");
        inOrder.verify(accountDeletionRepository).markAccountDeleted("issuer|subject");
        inOrder.verify(accountDeletionRepository).deleteAccountData("issuer|subject", linkedGuestScopes);
    }
}
