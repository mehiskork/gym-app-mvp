package com.gymapp.backend.service;

import com.gymapp.backend.controller.BadRequestException;
import com.gymapp.backend.controller.ConflictCodeException;
import com.gymapp.backend.model.ClaimConfirmResponse;
import com.gymapp.backend.model.ClaimStartResponse;
import com.gymapp.backend.model.ClaimStatus;
import com.gymapp.backend.model.ClaimType;
import com.gymapp.backend.repository.ClaimRepository;
import com.gymapp.backend.repository.IdentityLinkRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ClaimService {
    private static final Duration CLAIM_LOOKBACK = Duration.ofDays(1);

    private final ClaimRepository claimRepository;
    private final IdentityLinkRepository identityLinkRepository;
    private final PasswordEncoder passwordEncoder;
    private final ClaimCodeGenerator claimCodeGenerator;

    @Value("${claim.codeTtlMinutes:10}")
    private long codeTtlMinutes;

    public ClaimStartResponse startClaim(String deviceId, String guestUserId) {
        Instant now = Instant.now();
        claimRepository.expirePendingClaimsForGuestDevice(guestUserId, deviceId, ClaimType.CODE);

        String code = claimCodeGenerator.generateCode();
        String secretHash = passwordEncoder.encode(code);
        Instant expiresAt = now.plus(Duration.ofMinutes(codeTtlMinutes));
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

        claimRepository.markClaimed(match.claimId(), userId, now);

        return new ClaimConfirmResponse(match.guestUserId(), userId, ClaimStatus.CLAIMED.name());
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
