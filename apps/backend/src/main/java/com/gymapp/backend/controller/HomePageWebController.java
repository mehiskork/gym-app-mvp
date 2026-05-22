package com.gymapp.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HomePageWebController {
    private static final String LOGO_PATH = "/assets/trainframe-logo.png";

    @Value("${trainframe.support.email:support@example.invalid}")
    private String supportEmail;

    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> homePage() {
        String escapedSupportEmail = escapeHtml(supportEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body("""
                        <!doctype html>
                        <html lang="en">
                        <head>
                          <meta charset="utf-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1">
                          <title>TrainFrame</title>
                          <style>
                            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; margin: 0; background: #f7f7f8; color: #17181c; }
                            main { max-width: 820px; margin: 0 auto; padding: 40px 20px 56px; background: #fff; min-height: 100vh; }
                            .brand { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
                            .logo { width: 72px; height: 72px; border-radius: 16px; display: block; background: #101116; }
                            h1 { font-size: 2rem; line-height: 1.15; margin: 0; }
                            h2 { font-size: 1.2rem; margin-top: 30px; }
                            nav { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 24px; }
                          </style>
                        </head>
                        <body>
                          <main>
                            <div class="brand">
                              <img class="logo" src="%s" alt="TrainFrame TF logo">
                              <h1>TrainFrame</h1>
                            </div>
                            <p>TrainFrame is an offline-first workout tracker for planning workouts, logging sessions, and optional Google Sign-In sync.</p>

                            <h2>Support</h2>
                            <p>Contact TrainFrame support at <a href="mailto:%s">%s</a>.</p>

                            <nav aria-label="Public TrainFrame links">
                              <a href="/privacy">Privacy policy</a>
                              <a href="/terms">Terms of Service</a>
                              <a href="/account-deletion">Account deletion</a>
                            </nav>
                          </main>
                        </body>
                        </html>
                        """.formatted(LOGO_PATH, escapedSupportEmail, escapedSupportEmail));
    }

    private String supportEmail() {
        return StringUtils.hasText(supportEmail) ? supportEmail.trim() : "support@example.invalid";
    }

    private String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
