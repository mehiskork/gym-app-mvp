package com.gymapp.backend.security;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.DevicePrincipal;
import lombok.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.security.oauth2.jwt.Jwt;

@Component
public class PrincipalOwnerResolver {

    public OwnerScope resolve(@NonNull Object principal) {
        if (principal instanceof DevicePrincipal devicePrincipal) {
            return OwnerScope.guest(devicePrincipal.getGuestUserId());
        }
        if (principal instanceof AccountPrincipal accountPrincipal) {
            return OwnerScope.account(validateAccountOwnerId(accountPrincipal.getExternalAccountId()));
        }
        if (principal instanceof Jwt jwt) {
            String issuer = jwt.getIssuer() == null ? null : jwt.getIssuer().toString();
            String subject = jwt.getSubject();
            if (issuer == null || issuer.isBlank() || subject == null || subject.isBlank()) {
                throw new IllegalArgumentException("Unsupported Jwt principal for owner scope resolution");
            }
            return OwnerScope.account(validateAccountOwnerId(issuer + "|" + subject));
        }
        throw new IllegalArgumentException("Unsupported principal type: " + principal.getClass().getName());
    }

    private String validateAccountOwnerId(String ownerId) {
        if (ownerId == null || ownerId.isBlank()) {
            throw new IllegalArgumentException("Invalid account ownerId: blank");
        }
        if (!ownerId.contains("|")) {
            throw new IllegalArgumentException("Invalid account ownerId: missing issuer-subject delimiter");
        }
        String[] parts = ownerId.split("\\|", 2);
        if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
            throw new IllegalArgumentException("Invalid account ownerId: malformed");
        }
        return ownerId;
    }
}