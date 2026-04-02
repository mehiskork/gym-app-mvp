package com.gymapp.backend.security;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.DevicePrincipal;
import lombok.NonNull;
import org.springframework.stereotype.Component;

@Component
public class PrincipalOwnerResolver {

    public OwnerScope resolve(@NonNull Object principal) {
        if (principal instanceof DevicePrincipal devicePrincipal) {
            return OwnerScope.guest(devicePrincipal.getGuestUserId());
        }
        if (principal instanceof AccountPrincipal accountPrincipal) {
            return OwnerScope.account(accountPrincipal.getExternalAccountId());
        }
        throw new IllegalArgumentException("Unsupported principal type: " + principal.getClass().getName());
    }
}