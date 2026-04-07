package com.gymapp.backend.config;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

@Component
public class PrincipalMapper {

    public AccountPrincipal toAccountPrincipal(Jwt jwt) {
        String issuer = jwt.getIssuer() == null ? null : jwt.getIssuer().toString();
        String subject = jwt.getSubject();
        if (subject == null || subject.isBlank()) {
            throw new IllegalArgumentException("Jwt subject is required for account principal mapping");
        }

        String externalAccountId = issuer == null || issuer.isBlank()
                ? subject
                : issuer + "|" + subject;
        if (externalAccountId.isBlank()) {
            throw new IllegalArgumentException("External account id must not be blank");
        }

        return AccountPrincipal.builder()
                .principalType("account")
                .issuer(issuer)
                .subject(subject)
                .externalAccountId(externalAccountId)
                .build();
    }
}