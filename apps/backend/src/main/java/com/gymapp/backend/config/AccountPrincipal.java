package com.gymapp.backend.config;

import java.time.Instant;
import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class AccountPrincipal {
    String principalType;
    String externalAccountId;
    String activeAccountOwnerId;
    String issuer;
    String subject;
    Instant authTime;
}
