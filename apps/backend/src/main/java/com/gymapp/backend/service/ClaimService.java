package com.gymapp.backend.service;

import com.gymapp.backend.config.ClaimProperties;
import com.gymapp.backend.controller.BadRequestException;
import com.gymapp.backend.controller.ConflictCodeException;
import com.gymapp.backend.model.ClaimConfirmResponse;
import com.gymapp.backend.model.ClaimStartResponse;
import com.gymapp.backend.model.ClaimStatus;
import com.gymapp.backend.model.ClaimType;
import com.gymapp.backend.repository.ClaimRepository;
import com.gymapp.backend.repository.IdentityLinkRepository;
import com.gymapp.backend.repository.SyncRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class ClaimService {
    private static final Duration CLAIM_LOOKBACK = Duration.ofDays(1);

    private final ClaimRepository claimRepository;
    private final IdentityLinkRepository identityLinkRepository;
    private final SyncRepository syncRepository;
    private final PasswordEncoder passwordEncoder;
    private final ClaimCodeGenerator claimCodeGenerator;

    private final ClaimProperties claimProperties;

    public ClaimStartResponse startClaim(String deviceId, String guestUserId) {
        Instant now = Instant.now();
        claimRepository.expirePendingClaimsForGuestDevice(guestUserId, deviceId, ClaimType.CODE);

        String code = claimCodeGenerator.generateCode();
        String secretHash = passwordEncoder.encode(code);
        Instant expiresAt = now.plus(Duration.ofMinutes(claimProperties.getCodeTtlMinutes()));
        UUID claimId = UUID.randomUUID();

        claimRepository.insertClaim(
                claimId,
                ClaimType.CODE,
                secretHash,
                guestUserId,
                deviceId,
                ClaimStatus.PENDING,
                now,
                expiresAt);

        return new ClaimStartResponse(
                claimId.toString(),
                code,
                OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC));
    }

    @Transactional(noRollbackFor = BadRequestException.class)
    public ClaimConfirmResponse confirmClaim(String codeInput, String userId) {
        String code = normalizeCode(codeInput);
        Instant now = Instant.now();
        Instant createdAfter = now.minus(CLAIM_LOOKBACK);

        List<ClaimRepository.ClaimRecord> candidates = claimRepository.findClaimCandidates(ClaimType.CODE,
                createdAfter);

        ClaimRepository.ClaimRecord match = null;
        for (ClaimRepository.ClaimRecord candidate : candidates) {
            if (passwordEncoder.matches(code, candidate.secretHash())) {
                match = candidate;
                break;
            }
        }

        if (match == null) {
            throw new BadRequestException("CLAIM_INVALID", "Invalid claim code");
        }

        if (match.status() == ClaimStatus.CLAIMED) {
            String linkedUserId = resolveLinkedUserId(match);
            if (linkedUserId != null && !linkedUserId.equals(userId)) {
                throw new ConflictCodeException("CLAIM_CONFLICT", "Guest user already claimed by another user");
            }
            migrateGuestSyncOwnershipIfNeeded(match.guestUserId(), linkedUserId, now);
            return new ClaimConfirmResponse(match.guestUserId(), linkedUserId, ClaimStatus.CLAIMED.name());
        }

        if (now.isAfter(match.expiresAt())) {
            claimRepository.markExpired(match.claimId());
            throw new BadRequestException("CLAIM_EXPIRED", "Claim code expired");
        }

        IdentityLinkRepository.UpsertResult upsertResult = identityLinkRepository.upsertLink(match.guestUserId(),
                userId, now);

        if (upsertResult == IdentityLinkRepository.UpsertResult.CONFLICT) {
            throw new ConflictCodeException("CLAIM_CONFLICT", "Guest user already claimed by another user");
        }

        migrateGuestSyncOwnershipIfNeeded(match.guestUserId(), userId, now);
        claimRepository.markClaimed(match.claimId(), userId, now);

        return new ClaimConfirmResponse(match.guestUserId(), userId, ClaimStatus.CLAIMED.name());
    }

    private void migrateGuestSyncOwnershipIfNeeded(String guestUserId, String userId, Instant now) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        SyncRepository.MigrationAuditState auditState = syncRepository.registerGuestToAccountMigrationAttempt(
                guestUserId,
                userId,
                now);

        if (!userId.equals(auditState.linkedUserId())) {
            throw new ConflictCodeException("CLAIM_CONFLICT", "Guest user already claimed by another user");
        }
        if (auditState.completed()) {
            log.info(
                    "guest->account migration already completed ownerScopeFrom=guest ownerScopeTo=account attemptCount={}",
                    auditState.attemptCount());
            return;
        }

        SyncRepository.GuestToAccountMigrationCounts counts = syncRepository.migrateGuestOwnedSyncDataToAccountOwner(
                guestUserId,
                userId);
        syncRepository.markGuestToAccountMigrationCompleted(guestUserId, userId, now, counts);
        log.info(
                "guest->account migration completed ownerScopeFrom=guest ownerScopeTo=account entityStateRowsMoved={} changeLogRowsMoved={} opLedgerRowsMoved={} entityConflictsResolved={}",
                counts.entityStateRowsMoved(),
                counts.changeLogRowsMoved(),
                counts.opLedgerRowsMoved(),
                counts.entityConflictsResolved());
    }

    private String resolveLinkedUserId(ClaimRepository.ClaimRecord match) {
        if (match.claimedByUserId() != null && !match.claimedByUserId().isBlank()) {
            return match.claimedByUserId();
        }
        Optional<String> existing = identityLinkRepository.findUserId(match.guestUserId());
        return existing.orElse(match.claimedByUserId());
    }

    private String normalizeCode(String codeInput) {
        if (codeInput == null) {
            return "";
        }
        return codeInput.trim().toUpperCase();
    }
}
