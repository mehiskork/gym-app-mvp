package com.gymapp.backend.security;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class OwnerScope {
    String type;
    String ownerId;

    public static OwnerScope guest(String ownerId) {
        return OwnerScope.builder()
                .type("guest")
                .ownerId(ownerId)
                .build();
    }

    public static OwnerScope account(String ownerId) {
        return OwnerScope.builder()
                .type("account")
                .ownerId(ownerId)
                .build();
    }
}