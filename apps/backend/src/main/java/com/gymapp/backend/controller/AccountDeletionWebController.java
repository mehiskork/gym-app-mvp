package com.gymapp.backend.controller;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Slf4j
public class AccountDeletionWebController {
    private static final int MAX_EMAIL_LENGTH = 254;
    private static final int MAX_EMAIL_LOCAL_LENGTH = 64;
    private static final int MAX_EMAIL_LABEL_LENGTH = 63;
    private static final int MAX_MESSAGE_LENGTH = 1000;

    @Value("${trainframe.support.email:support@example.invalid}")
    private String supportEmail;

    @GetMapping(value = "/account-deletion", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> accountDeletionPage() {
        return html(accountDeletionPageHtml(null));
    }

    @PostMapping(
            value = "/account-deletion/request",
            consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE,
            produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> requestAccountDeletion(@RequestParam Map<String, String> form) {
        String email = trim(form.get("email"));
        String message = trim(form.get("message"));
        boolean confirmed = form.containsKey("confirmDeletion");
        boolean noAppAccess = form.containsKey("noAppAccess");

        if (!isValidEmail(email) || !confirmed || message.length() > MAX_MESSAGE_LENGTH) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.TEXT_HTML)
                    .body(accountDeletionPageHtml(validationMessage(email, confirmed, message)));
        }

        log.info(
                "account deletion web form submitted emailDomain={} hasMessage={} noAppAccess={}",
                emailDomain(email),
                !message.isBlank(),
                noAppAccess);

        return html(emailInstructionsPageHtml(email));
    }

    private String accountDeletionPageHtml(String errorMessage) {
        String safeSupportEmail = safeSupportEmail();
        String escapedSupportEmail = escapeHtml(safeSupportEmail);
        String supportMailtoHref = mailtoHref(safeSupportEmail);
        String errorBlock = StringUtils.hasText(errorMessage)
                ? """
                        <div class="error" role="alert">%s</div>
                        """.formatted(escapeHtml(errorMessage))
                : "";

        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>TrainFrame account deletion request</title>
                  <style>
                    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; margin: 0; background: #f7f7f8; color: #17181c; }
                    main { max-width: 760px; margin: 0 auto; padding: 40px 20px 56px; background: #fff; min-height: 100vh; }
                    h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 16px; }
                    h2 { font-size: 1.2rem; margin-top: 32px; }
                    label { display: block; font-weight: 650; margin-top: 16px; }
                    input[type="email"], textarea { box-sizing: border-box; width: 100%%; margin-top: 6px; padding: 10px 12px; border: 1px solid #c8cad0; border-radius: 6px; font: inherit; }
                    textarea { min-height: 120px; }
                    .checkbox { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; }
                    .checkbox input { margin-top: 5px; }
                    button { margin-top: 20px; padding: 11px 16px; border: 0; border-radius: 6px; background: #1f5eff; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
                    .note { background: #f0f4ff; border-left: 4px solid #1f5eff; padding: 12px 14px; margin: 18px 0; }
                    .warning { background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 14px; margin: 18px 0; }
                    .error { background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px 14px; margin: 18px 0; }
                    small { color: #555b66; }
                  </style>
                </head>
                <body>
                  <main>
                    <h1>TrainFrame account deletion request</h1>
                    <p>TrainFrame users who can open the app can delete their account in <strong>Settings -&gt; Delete account</strong>. This page is for users who no longer have the app installed or cannot access the in-app deletion flow.</p>

                    <div class="note">
                      Deleting your TrainFrame account deletes TrainFrame account data. It does <strong>not</strong> delete your Google account.
                    </div>

                    <div class="warning">
                      Do not send passwords, Google passwords, JWTs, Firebase tokens, device tokens, support bundles, keystores, private keys, or other secrets.
                    </div>

                    <h2>What we need</h2>
                    <p>Email <a href="%s">%s</a> with the Google sign-in email or contact email you used with TrainFrame, a clear sentence that you are requesting TrainFrame account/data deletion, and optional context. Deletion cannot be undone once completed.</p>
                    <p>If the email button does not open, copy and paste this address into your email app: <strong>%s</strong>.</p>

                    %s

                    <form method="post" action="/account-deletion/request">
                      <label for="email">Google sign-in or contact email</label>
                      <input id="email" name="email" type="email" required autocomplete="email">

                      <label for="message">Optional message</label>
                      <textarea id="message" name="message" maxlength="%d" placeholder="Optional. Do not include passwords, tokens, support bundles, or secrets."></textarea>
                      <small>Maximum %d characters.</small>

                      <label class="checkbox">
                        <input name="confirmDeletion" type="checkbox" value="true" required>
                        <span>I understand this deletes my TrainFrame account data and does not delete my Google account.</span>
                      </label>

                      <label class="checkbox">
                        <input name="noAppAccess" type="checkbox" value="true">
                        <span>I no longer have access to the app.</span>
                      </label>

                      <button type="submit">Show email instructions</button>
                    </form>

                    <h2>Support contact</h2>
                    <p><a href="%s">Email TrainFrame support</a> and include only your TrainFrame sign-in/contact email, that you are requesting TrainFrame account/data deletion, and optional context.</p>
                  </main>
                </body>
                </html>
                """.formatted(
                escapeHtmlAttribute(supportMailtoHref),
                escapedSupportEmail,
                escapedSupportEmail,
                errorBlock,
                MAX_MESSAGE_LENGTH,
                MAX_MESSAGE_LENGTH,
                escapeHtmlAttribute(supportMailtoHref));
    }

    private String emailInstructionsPageHtml(String email) {
        String safeSupportEmail = safeSupportEmail();
        String escapedSupportEmail = escapeHtml(safeSupportEmail);
        String supportMailtoHref = mailtoHref(safeSupportEmail);
        String escapedEmail = escapeHtml(email);
        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>TrainFrame account deletion email instructions</title>
                </head>
                <body>
                  <main>
                    <h1>Email TrainFrame support to request deletion</h1>
                    <p>This web form does not automatically delete account data or submit a support ticket. To request manual deletion, email <a href="%s">%s</a>.</p>
                    <p>Include your TrainFrame contact or Google sign-in email, for example <strong>%s</strong>, and say that you are requesting TrainFrame account/data deletion. You may add optional context.</p>
                    <p>If the email button does not open, copy and paste this address into your email app: <strong>%s</strong>.</p>
                    <p>This does not delete your Google account. Do not send passwords, tokens, support bundles, or secrets.</p>
                  </main>
                </body>
                </html>
                """.formatted(
                escapeHtmlAttribute(supportMailtoHref),
                escapedSupportEmail,
                escapedEmail,
                escapedSupportEmail);
    }

    private String validationMessage(String email, boolean confirmed, String message) {
        if (!isValidEmail(email)) {
            return "Enter a valid email address so TrainFrame support can verify the request.";
        }
        if (!confirmed) {
            return "Confirm that you understand this deletes TrainFrame account data and does not delete your Google account.";
        }
        if (message.length() > MAX_MESSAGE_LENGTH) {
            return "Optional message is too long.";
        }
        return "Check the form and try again.";
    }

    private ResponseEntity<String> html(String body) {
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(body);
    }

    private String safeSupportEmail() {
        String configured = StringUtils.hasText(supportEmail) ? supportEmail.trim() : "";
        return isValidEmail(configured) ? configured : "support@example.invalid";
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean isValidEmail(String email) {
        if (!StringUtils.hasText(email) || email.length() > MAX_EMAIL_LENGTH || hasUnsafeEmailChar(email)) {
            return false;
        }

        int at = email.indexOf('@');
        if (at <= 0 || at != email.lastIndexOf('@') || at > MAX_EMAIL_LOCAL_LENGTH) {
            return false;
        }

        String local = email.substring(0, at);
        String domain = email.substring(at + 1);
        if (local.startsWith(".") || local.endsWith(".") || local.contains("..")) {
            return false;
        }
        if (domain.length() < 3 || domain.startsWith(".") || domain.endsWith(".") || !domain.contains(".")) {
            return false;
        }

        int labelStart = 0;
        while (labelStart < domain.length()) {
            int dot = domain.indexOf('.', labelStart);
            int labelEnd = dot >= 0 ? dot : domain.length();
            if (!isValidDomainLabel(domain, labelStart, labelEnd)) {
                return false;
            }
            if (dot < 0) {
                break;
            }
            labelStart = dot + 1;
        }

        for (int i = 0; i < local.length(); i++) {
            char c = local.charAt(i);
            if (!isAllowedLocalEmailChar(c)) {
                return false;
            }
        }
        return true;
    }

    private boolean isValidDomainLabel(String domain, int startInclusive, int endExclusive) {
        int length = endExclusive - startInclusive;
        if (length <= 0 || length > MAX_EMAIL_LABEL_LENGTH
                || domain.charAt(startInclusive) == '-' || domain.charAt(endExclusive - 1) == '-') {
            return false;
        }
        for (int i = startInclusive; i < endExclusive; i++) {
            char c = domain.charAt(i);
            if (!isAsciiLetterOrDigit(c) && c != '-') {
                return false;
            }
        }
        return true;
    }

    private boolean hasUnsafeEmailChar(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c <= 0x20 || c >= 0x7f || c == '<' || c == '>' || c == '"' || c == '\''
                    || c == '&' || c == ':' || c == '/' || c == '\\') {
                return true;
            }
        }
        return false;
    }

    private boolean isAllowedLocalEmailChar(char c) {
        return isAsciiLetterOrDigit(c)
                || c == '.'
                || c == '_'
                || c == '%'
                || c == '+'
                || c == '-';
    }

    private boolean isAsciiLetterOrDigit(char c) {
        return (c >= 'a' && c <= 'z')
                || (c >= 'A' && c <= 'Z')
                || (c >= '0' && c <= '9');
    }

    private String emailDomain(String email) {
        int at = email.lastIndexOf('@');
        if (at < 0 || at == email.length() - 1) {
            return "unknown";
        }
        return email.substring(at + 1).toLowerCase(Locale.ROOT);
    }

    private String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private String escapeHtmlAttribute(String value) {
        return escapeHtml(value);
    }

    private String mailtoHref(String email) {
        return "mailto:" + URLEncoder.encode(email, StandardCharsets.UTF_8)
                + "?subject=" + mailtoSubject();
    }

    private String mailtoSubject() {
        return URLEncoder.encode("TrainFrame account deletion request", StandardCharsets.UTF_8);
    }
}
