package com.gymapp.backend.controller;

import com.gymapp.backend.config.AccountPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeController {

    @GetMapping("/me")
    public ResponseEntity<AccountPrincipal> me(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof AccountPrincipal accountPrincipal) {
            return ResponseEntity.ok(accountPrincipal);
        }
        throw new IllegalArgumentException("Unsupported principal for /me: " + principal.getClass().getName());
    }
}