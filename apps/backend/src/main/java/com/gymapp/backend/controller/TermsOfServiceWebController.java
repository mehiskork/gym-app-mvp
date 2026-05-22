package com.gymapp.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TermsOfServiceWebController {
    private static final String EFFECTIVE_DATE = "May 22, 2026";

    @Value("${trainframe.support.email:support@example.invalid}")
    private String supportEmail;

    @GetMapping(value = "/terms", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> termsPage() {
        String escapedSupportEmail = escapeHtml(supportEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body("""
                        <!doctype html>
                        <html lang="en">
                        <head>
                          <meta charset="utf-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1">
                          <title>TrainFrame Terms of Service</title>
                          <style>
                            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; margin: 0; background: #f7f7f8; color: #17181c; }
                            main { max-width: 820px; margin: 0 auto; padding: 40px 20px 56px; background: #fff; min-height: 100vh; }
                            h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 8px; }
                            h2 { font-size: 1.2rem; margin-top: 30px; }
                            .note { background: #f0f4ff; border-left: 4px solid #1f5eff; padding: 12px 14px; margin: 18px 0; }
                          </style>
                        </head>
                        <body>
                          <main>
                            <h1>TrainFrame Terms of Service</h1>
                            <p><strong>Effective date:</strong> %s</p>
                            <p>These terms apply to use of the TrainFrame mobile app and related backend services.</p>

                            <h2>Use of TrainFrame</h2>
                            <p>TrainFrame is an offline-first workout tracker. You are responsible for the workout plans, notes, and other content you enter, and for using the app in a safe way.</p>

                            <h2>Accounts and guest mode</h2>
                            <p>You can use TrainFrame in guest/device mode or sign in with Google. If you sign in, TrainFrame uses Firebase Authentication to verify your account. Guest data on a device can merge into whichever Google account you select next.</p>

                            <h2>Sync and availability</h2>
                            <p>TrainFrame stores data locally on your device and may sync signed-in account data with the TrainFrame backend. The service may be changed, interrupted, or unavailable at times.</p>

                            <h2>User content</h2>
                            <p>You keep responsibility for the workout data and notes you create. Do not use TrainFrame to store unlawful content, secrets, passwords, tokens, private keys, or other sensitive credentials.</p>

                            <h2>Health and fitness</h2>
                            <p>TrainFrame is not medical advice. Consult a qualified professional before starting or changing exercise if you have health concerns.</p>

                            <h2>Account deletion</h2>
                            <p>Signed-in users can delete their TrainFrame account data in the app from <strong>Settings -&gt; Delete account</strong>. Users who cannot access the app can use the public <a href="/account-deletion">account deletion page</a> for manual email instructions.</p>

                            <h2>No sale, ads, or analytics</h2>
                            <p>TrainFrame does not sell your data, does not show ads, and does not use analytics.</p>

                            <h2>Disclaimers and limits</h2>
                            <p>TrainFrame is provided as-is. To the extent allowed by law, TrainFrame is not liable for indirect, incidental, or consequential damages from use of the app or service.</p>

                            <h2>Changes to these terms</h2>
                            <p>TrainFrame may update these terms as the app changes. Updates will be posted on this page with a new effective date.</p>

                            <h2>Contact</h2>
                            <p>Questions about these terms can be sent to <a href="mailto:%s">%s</a>.</p>
                            <p><a href="/privacy">Privacy policy</a> | <a href="/account-deletion">Account deletion</a></p>
                            <div class="note">These terms do not change your rights under applicable law.</div>
                          </main>
                        </body>
                        </html>
                        """.formatted(EFFECTIVE_DATE, escapedSupportEmail, escapedSupportEmail));
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
