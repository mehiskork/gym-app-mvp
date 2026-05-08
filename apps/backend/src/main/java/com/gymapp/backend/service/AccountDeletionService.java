package com.gymapp.backend.service;

import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.security.OwnerScope;
import com.gymapp.backend.security.PrincipalOwnerResolver;
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

    /**
     * Deletes backend rows visible to this transaction for the authenticated
     * account owner and linked claimed guest scopes.
     *
     * <p>
     * There is intentionally no tombstone or account-state table in this PR. A
     * concurrent or later authenticated /sync using the same Firebase subject can
     * write fresh rows after this transaction commits. Mobile account deletion must
     * pause sync, call DELETE /me, and clear or rotate local SQLite, account session,
     * and device credentials only after the 204 response.
     */
    @Transactional
    public void deleteAccount(Object principal) {
        OwnerScope ownerScope = principalOwnerResolver.resolve(principal);
        if (!"account".equals(ownerScope.getType())) {
            throw new IllegalArgumentException("Account principal required for account deletion");
        }

        AccountDeletionRepository.AccountDeletionResult result = accountDeletionRepository
                .deleteAccountData(ownerScope.getOwnerId());

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
}
