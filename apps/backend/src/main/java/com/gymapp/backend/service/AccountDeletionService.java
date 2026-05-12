package com.gymapp.backend.service;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.controller.AccountDeletedException;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.service.AccountIdentityService.AccountDeletionResolution;
import com.gymapp.backend.security.OwnerScope;
import com.gymapp.backend.security.PrincipalOwnerResolver;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccountDeletionService {
    private final AccountDeletionRepository accountDeletionRepository;
    private final PrincipalOwnerResolver principalOwnerResolver;
    private final AccountIdentityService accountIdentityService;

    /**
     * Deletes backend rows visible to this transaction for the authenticated
     * account owner and linked claimed guest scopes.
     *
     * <p>
     * Account deletion writes a durable tombstone before removing sync data so later
     * authenticated sync from stale devices cannot recreate deleted rows.
     */
    @Transactional
    public void deleteAccount(Object principal) {
        if (!(principal instanceof AccountPrincipal accountPrincipal)) {
            OwnerScope ownerScope = principalOwnerResolver.resolve(principal);
            if (!"account".equals(ownerScope.getType())) {
                throw new IllegalArgumentException("Account principal required for account deletion");
            }
            deleteActiveOwner(null, ownerScope.getOwnerId());
            return;
        }

        AccountDeletionResolution deletionResolution = accountIdentityService.resolveForAccountDeletion(accountPrincipal);
        if (deletionResolution.alreadyDeleted()) {
            log.info("account deletion already completed");
            return;
        }
        deleteActiveOwner(accountPrincipal, deletionResolution.activeAccountOwnerId());
    }

    private void deleteActiveOwner(AccountPrincipal accountPrincipal, String accountOwnerId) {
        accountDeletionRepository.lockAccountOwnerForTransaction(accountOwnerId);
        List<String> linkedGuestScopes = accountDeletionRepository.findLinkedGuestScopes(accountOwnerId);
        accountDeletionRepository.markAccountDeleted(accountOwnerId);
        if (accountPrincipal != null) {
            accountIdentityService.recordActiveAccountDeleted(accountPrincipal, accountOwnerId,
                    accountDeletionRepository.findActiveTombstoneDeletedAt(accountOwnerId).orElse(null));
        }
        AccountDeletionRepository.AccountDeletionResult result = accountDeletionRepository
                .deleteAccountData(accountOwnerId, linkedGuestScopes);

        log.info(
                "account deletion completed linkedGuestScopes={} deviceTokensDeleted={} opLedgerDeleted={} changeLogDeleted={} entityStateDeleted={} claimsDeleted={} identityLinksDeleted={} migrationAuditsDeleted={} devicesDeleted={}",
                result.linkedGuestScopeCount(),
                result.deviceTokenRowsDeleted(),
                result.opLedgerRowsDeleted(),
                result.changeLogRowsDeleted(),
                result.entityStateRowsDeleted(),
                result.claimRowsDeleted(),
                result.identityLinkRowsDeleted(),
                result.migrationAuditRowsDeleted(),
                result.deviceRowsDeleted());
    }

    public void rejectIfAccountDeleted(Object principal) {
        OwnerScope ownerScope = principalOwnerResolver.resolve(principal);
        if (!"account".equals(ownerScope.getType())) {
            throw new IllegalArgumentException("Account principal required");
        }
        rejectIfAccountDeleted(ownerScope.getOwnerId());
    }

    public void rejectIfAccountDeleted(String accountOwnerId) {
        if (accountDeletionRepository.isAccountDeleted(accountOwnerId)) {
            throw new AccountDeletedException();
        }
    }
}
