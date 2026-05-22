package com.gymapp.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PrivacyPolicyWebController {
    private static final String EFFECTIVE_DATE = "May 22, 2026";

    @Value("${trainframe.support.email:support@example.invalid}")
    private String supportEmail;

    @GetMapping(value = "/privacy", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> privacyPolicyPage() {
        String escapedSupportEmail = escapeHtml(supportEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body("""
                        <!doctype html>
                        <html lang="en">
                        <head>
                          <meta charset="utf-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1">
                          <title>TrainFrame privacy policy</title>
                          <style>
                            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; margin: 0; background: #f7f7f8; color: #17181c; }
                            main { max-width: 820px; margin: 0 auto; padding: 40px 20px 56px; background: #fff; min-height: 100vh; }
                            h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 8px; }
                            h2 { font-size: 1.2rem; margin-top: 30px; }
                            .note { background: #f0f4ff; border-left: 4px solid #1f5eff; padding: 12px 14px; margin: 18px 0; }
                            .warning { background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 14px; margin: 18px 0; }
                          </style>
                        </head>
                        <body>
                          <main>
                            <h1>TrainFrame privacy policy</h1>
                            <p><strong>Effective date:</strong> %s</p>
                            <p>This policy explains how TrainFrame handles information for the TrainFrame mobile app and related backend services.</p>
                            <p>Developer/contact point: TrainFrame support at <a href="mailto:%s">%s</a>.</p>

                            <h2>Data stored locally</h2>
                            <p>TrainFrame stores workout data you create, such as workout plans, exercises, workout sessions, sets, notes, settings, and progress history. The mobile app stores app data locally in SQLite on your device so the app can work offline.</p>

                            <h2>Account sync data</h2>
                            <p>If you use Google Sign-In account mode, TrainFrame syncs workout data and sync metadata with the TrainFrame backend so your account data can be restored and used across supported devices. Sync metadata can include device identifiers, sync cursors, outbox operation identifiers, timestamps, and conflict-resolution state.</p>

                            <h2>Guest/device sync data</h2>
                            <p>If you use guest/device mode, TrainFrame can store workout data locally on your device and may use device registration credentials and sync metadata for guest sync behavior. Guest mode is separate from a Google account until you choose to sign in. When you sign in, guest data on the device can merge into whichever Google account you select next.</p>

                            <h2>Google Sign-In and Firebase Auth</h2>
                            <p>TrainFrame uses Google Sign-In and Firebase Authentication only for authentication. TrainFrame receives authentication tokens from Firebase/Google to verify your sign-in, but TrainFrame deletion does not delete your Google account. TrainFrame does not use Firebase Firestore, Realtime Database, or Storage for app data.</p>

                            <h2>Support emails and support bundles</h2>
                            <p>If you email support or create a support bundle, TrainFrame may use the information you provide to troubleshoot issues or process account deletion requests. Support bundles are user-initiated and sanitized, and may include diagnostic IDs, sync status, and local counts. Do not send passwords, Google passwords, JWTs, Firebase tokens, device tokens, keystores, private keys, or other secrets.</p>

                            <h2>Notifications</h2>
                            <p>TrainFrame uses local notifications for app features such as rest timers and unfinished workout reminders. These are local scheduled notifications on your device, not remote push advertising.</p>

                            <h2>How TrainFrame uses data</h2>
                            <p>TrainFrame uses data to provide workout logging, local app functionality, account sync, troubleshooting, and account deletion support. TrainFrame does not sell your data and does not use your data for advertising.</p>

                            <h2>Data sharing</h2>
                            <p>TrainFrame does not sell your data, does not show ads, and does not use analytics. TrainFrame shares data only as needed to provide the service, such as using Google Sign-In and Firebase Authentication to verify signed-in accounts, or when required by law.</p>

                            <h2>Security</h2>
                            <p>TrainFrame uses HTTPS encryption in transit for backend communication. Data stored on your device is protected by your device and operating system controls. No internet service can guarantee perfect security.</p>

                            <h2>Retention and deletion</h2>
                            <p>Local data remains on your device until you delete it, uninstall the app, clear app data, or use account deletion where applicable. Synced account data remains on TrainFrame backend systems while your account is active. After account deletion, TrainFrame may keep limited deletion and security records so old sessions cannot restore deleted data and so the same Google account can create a fresh TrainFrame account later. Manual deletion requests are processed within 30 days.</p>

                            <h2>Account deletion</h2>
                            <p>Signed-in users can delete their TrainFrame account data in the app from <strong>Settings -&gt; Delete account</strong>. TrainFrame also provides a public manual deletion request path at <a href="/account-deletion">/account-deletion</a> for users who cannot access the app.</p>
                            <div class="note">Deleting your TrainFrame account deletes TrainFrame account data. It does <strong>not</strong> delete your Google account.</div>
                            <p>The public web deletion path gives email instructions for manual support processing. It does not automatically delete data from the browser form.</p>

                            <h2>Children</h2>
                            <p>TrainFrame is intended for general fitness tracking and is not directed to children under 13. If you believe a child provided personal information to TrainFrame, contact support.</p>

                            <h2>Policy changes</h2>
                            <p>TrainFrame may update this policy as the app changes. Updates will be posted on this page with a new effective date.</p>

                            <h2>Contact</h2>
                            <p>For privacy questions or account deletion support, email <a href="mailto:%s">%s</a>.</p>
                            <div class="warning">Do not send passwords, raw tokens, keystores, private keys, or other secrets.</div>
                            <p><a href="/account-deletion">Account deletion</a> | <a href="/terms">Terms of Service</a></p>
                          </main>
                        </body>
                        </html>
                        """.formatted(
                        EFFECTIVE_DATE,
                        escapedSupportEmail,
                        escapedSupportEmail,
                        escapedSupportEmail,
                        escapedSupportEmail));
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
