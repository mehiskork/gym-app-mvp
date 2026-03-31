package com.gymapp.backend.controller;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.PrincipalMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class MeController {

    private final PrincipalMapper principalMapper;

    @GetMapping("/me")
    public ResponseEntity<AccountPrincipal> me(JwtAuthenticationToken authentication) {
        Jwt jwt = authentication.getToken();
        return ResponseEntity.ok(principalMapper.toAccountPrincipal(jwt));
    }
}