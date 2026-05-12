package com.gymapp.backend.service;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.controller.AccountDeletedException;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.repository.AccountIdentityRepository;
import com.gymapp.backend.repository.AccountIdentityRepository.AccountIdentityRecord;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AccountIdentityService {
    private final AccountIdentityRepository accountIdentityRepository;
    private final AccountDeletionRepository accountDeletionRepository;

    @Transactional
    public AccountPrincipal resolveActivePrincipal(AccountPrincipal firebasePrincipal) {
        AccountIdentityRecord identity = resolveActiveIdentity(firebasePrincipal, false);
        return withActiveOwner(firebasePrincipal, identity.activeAccountOwnerId());
    }

    @Transactional
    public AccountIdentityRecord resolveActiveIdentity(AccountPrincipal firebasePrincipal) {
        return resolveActiveIdentity(firebasePrincipal, false);
    }

    @Transactional
    public AccountIdentityRecord resolveOrCreateForClaim(AccountPrincipal firebasePrincipal) {
        return resolveActiveIdentity(firebasePrincipal, true);
    }

    @Transactional
    public void recordActiveAccountDeleted(AccountPrincipal firebasePrincipal, String activeAccountOwnerId,
            Instant deletedAt) {
        String firebaseSubjectId = validateFirebaseSubjectId(firebasePrincipal);
        accountIdentityRepository.lockFirebaseSubjectForTransaction(firebaseSubjectId);
        Instant cutoff = deletedAt == null ? Instant.now() : deletedAt;
        accountIdentityRepository.updateAuthTimeCutoff(firebaseSubjectId, cutoff, Instant.now());
    }

    private AccountIdentityRecord resolveActiveIdentity(AccountPrincipal firebasePrincipal, boolean allowRecreate) {
        String firebaseSubjectId = validateFirebaseSubjectId(firebasePrincipal);
        Instant now = Instant.now();
        accountIdentityRepository.lockFirebaseSubjectForTransaction(firebaseSubjectId);

        Optional<AccountIdentityRecord> existing = accountIdentityRepository.findByFirebaseSubjectId(firebaseSubjectId);
        if (existing.isEmpty()) {
            Optional<Instant> legacyDeletedAt = accountDeletionRepository.findActiveTombstoneDeletedAt(firebaseSubjectId);
            if (legacyDeletedAt.isPresent()) {
                if (!allowRecreate) {
                    throw new AccountDeletedException();
                }
                assertFreshEnough(firebasePrincipal, legacyDeletedAt.get());
                return accountIdentityRepository.createRecreatedIdentity(
                        firebaseSubjectId,
                        newAccountOwnerId(),
                        2,
                        legacyDeletedAt.get(),
                        now);
            }
            return accountIdentityRepository.createLegacyIdentityIfAbsent(firebaseSubjectId, now);
        }

        AccountIdentityRecord identity = existing.get();
        assertFreshEnough(firebasePrincipal, identity.authTimeCutoff());
        if (!accountDeletionRepository.isAccountDeleted(identity.activeAccountOwnerId())) {
            return identity;
        }

        Instant deletedAt = accountDeletionRepository.findActiveTombstoneDeletedAt(identity.activeAccountOwnerId())
                .orElse(identity.authTimeCutoff() == null ? now : identity.authTimeCutoff());
        if (!allowRecreate) {
            throw new AccountDeletedException();
        }
        assertFreshEnough(firebasePrincipal, deletedAt);
        return accountIdentityRepository.createRecreatedIdentity(
                firebaseSubjectId,
                newAccountOwnerId(),
                identity.generation() + 1,
                deletedAt,
                now);
    }

    private void assertFreshEnough(AccountPrincipal principal, Instant cutoff) {
        if (cutoff == null) {
            return;
        }
        Instant authTime = principal.getAuthTime();
        if (authTime == null || !authTime.isAfter(cutoff)) {
            throw new AccountDeletedException();
        }
    }

    private AccountPrincipal withActiveOwner(AccountPrincipal principal, String activeAccountOwnerId) {
        return AccountPrincipal.builder()
                .principalType(principal.getPrincipalType())
                .externalAccountId(activeAccountOwnerId)
                .activeAccountOwnerId(activeAccountOwnerId)
                .issuer(principal.getIssuer())
                .subject(principal.getSubject())
                .authTime(principal.getAuthTime())
                .build();
    }

    private String validateFirebaseSubjectId(AccountPrincipal principal) {
        String firebaseSubjectId = principal.getExternalAccountId();
        if (firebaseSubjectId == null || firebaseSubjectId.isBlank() || !firebaseSubjectId.contains("|")) {
            throw new IllegalArgumentException("Invalid Firebase subject id");
        }
        return firebaseSubjectId;
    }

    private String newAccountOwnerId() {
        return "account|" + UUID.randomUUID();
    }
}
