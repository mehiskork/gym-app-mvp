package com.gymapp.backend.config;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

@Component
public class PrincipalMapper {

    public AccountPrincipal toAccountPrincipal(Jwt jwt) {
        String issuer = jwt.getIssuer() == null ? null : jwt.getIssuer().toString();
        String subject = jwt.getSubject();

        String externalAccountId = issuer == null || issuer.isBlank()
                ? subject
                : issuer + "|" + subject;

        return AccountPrincipal.builder()
                .principalType("account")
                .issuer(issuer)
                .subject(subject)
                .externalAccountId(externalAccountId)
                .build();
    }
}