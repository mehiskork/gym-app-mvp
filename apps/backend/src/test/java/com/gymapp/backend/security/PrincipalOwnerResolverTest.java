package com.gymapp.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.DevicePrincipal;
import org.junit.jupiter.api.Test;

class PrincipalOwnerResolverTest {

    private final PrincipalOwnerResolver resolver = new PrincipalOwnerResolver();

    @Test
    void resolvesDevicePrincipalToGuestOwnerScope() {
        OwnerScope ownerScope = resolver.resolve(new DevicePrincipal("device-1", "guest-1"));

        assertThat(ownerScope.getType()).isEqualTo("guest");
        assertThat(ownerScope.getOwnerId()).isEqualTo("guest-1");
    }

    @Test
    void resolvesAccountPrincipalToAccountOwnerScope() {
        AccountPrincipal principal = AccountPrincipal.builder()
                .principalType("account")
                .externalAccountId("issuer-a|sub-a")
                .issuer("issuer-a")
                .subject("sub-a")
                .build();

        OwnerScope ownerScope = resolver.resolve(principal);

        assertThat(ownerScope.getType()).isEqualTo("account");
        assertThat(ownerScope.getOwnerId()).isEqualTo("issuer-a|sub-a");
    }

    @Test
    void rejectsUnsupportedPrincipalType() {
        assertThatThrownBy(() -> resolver.resolve("not-a-principal"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported principal type");
    }

    @Test
    void rejectsBlankAccountOwnerId() {
        AccountPrincipal principal = AccountPrincipal.builder()
                .principalType("account")
                .externalAccountId("  ")
                .issuer("issuer-a")
                .subject("sub-a")
                .build();

        assertThatThrownBy(() -> resolver.resolve(principal))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid account ownerId");
    }

    @Test
    void rejectsMalformedAccountOwnerId() {
        AccountPrincipal principal = AccountPrincipal.builder()
                .principalType("account")
                .externalAccountId("subject-only")
                .issuer("issuer-a")
                .subject("sub-a")
                .build();

        assertThatThrownBy(() -> resolver.resolve(principal))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid account ownerId");
    }
}