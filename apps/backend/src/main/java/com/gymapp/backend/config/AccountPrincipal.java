package com.gymapp.backend.config;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class AccountPrincipal {
    String principalType;
    String externalAccountId;
    String issuer;
    String subject;
}