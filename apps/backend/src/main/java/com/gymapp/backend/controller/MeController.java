package com.gymapp.backend.controller;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.service.AccountDeletionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class MeController {
    private final AccountDeletionService accountDeletionService;

    @GetMapping("/me")
    public ResponseEntity<AccountPrincipal> me(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof AccountPrincipal accountPrincipal) {
            accountDeletionService.rejectIfAccountDeleted(accountPrincipal.getExternalAccountId());
            return ResponseEntity.ok(accountPrincipal);
        }
        throw new IllegalArgumentException("Unsupported principal for /me: " + principal.getClass().getName());
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteMe(Authentication authentication) {
        accountDeletionService.deleteAccount(authentication.getPrincipal());
        return ResponseEntity.noContent().build();
    }
}
