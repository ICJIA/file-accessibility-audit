# 07 — Mailgun Integration Guide

**Project:** `file-accessibility-audit`
**Purpose:** Email delivery for OTP authentication codes
**Provider:** Mailgun (default)
**Sender:** `admin@icjia.cloud`

---

## 1. Why Mailgun (Default)

Mailgun is the default email provider for this project because:

- You already have an active Mailgun account
- The `icjia.cloud` domain is already configured for sending
- Mailgun's SMTP relay works seamlessly with Nodemailer — no code changes needed
- For the minimal volume this app generates (a handful of OTP emails per day), Mailgun's free tier is more than sufficient

### SMTP2GO as Alternative

SMTP2GO is supported as an alternative provider. See `docs/06-smtp2go-integration.md` for setup instructions. Switching between providers requires only changing environment variables — no code changes.

---

## 2. What You Need from Mailgun

Log in to your Mailgun dashboard at [https://app.mailgun.com](https://app.mailgun.com) and gather:

### SMTP Credentials

1. Go to **Sending → Domain settings** and select your `icjia.cloud` domain
2. Click **SMTP credentials** (or go to **Sending → SMTP**)
3. You need:
   - **SMTP hostname:** `smtp.mailgun.org`
   - **Port:** `587` (STARTTLS) — recommended
   - **SMTP login:** Your Mailgun SMTP username (often `postmaster@icjia.cloud` or a custom SMTP user you created)
   - **SMTP password:** The password for that SMTP user

### Alternative: API Key (Not Used)

Mailgun also offers an HTTP API, but this project uses SMTP via Nodemailer for simplicity and provider-agnostic design. The same `mailer.ts` works for Mailgun, SMTP2GO, or any other SMTP relay — just change the env vars.

---

## 3. Environment Variables

In `apps/api/.env`, set the following:

```env
# Email provider: "mailgun" (default) or "smtp2go"
MAIL_PROVIDER=mailgun

# Mailgun SMTP settings
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@icjia.cloud
SMTP_PASS=<your-mailgun-smtp-password>
SMTP_FROM=admin@icjia.cloud
```

**`SMTP_USER`:** This is your Mailgun SMTP login. Check your Mailgun dashboard under **Sending → Domain settings → SMTP credentials**. It's usually `postmaster@yourdomain` but could be a custom SMTP user.

**`SMTP_PASS`:** The password associated with the SMTP user above. You can reset this in the Mailgun dashboard if you've lost it.

**`SMTP_FROM`:** The "From" address on outgoing emails. Must be from a verified domain. Since you're using `icjia.cloud`, `admin@icjia.cloud` works.

---

## 4. Domain Verification

Your `icjia.cloud` domain should already be verified in Mailgun (since you have an existing account). To confirm:

1. Go to **Sending → Domains** in the Mailgun dashboard
2. Verify that `icjia.cloud` shows a green checkmark for:
   - **DNS records** (SPF, DKIM, MX)
   - **Domain verification** status is "Active"

If the domain isn't verified yet:

1. Click on `icjia.cloud` in the domains list
2. Mailgun shows the required DNS records:
   - **SPF** — TXT record authorizing Mailgun to send
   - **DKIM** — TXT record(s) for email signing
   - **MX** (optional) — only needed if you want to receive email via Mailgun
3. Add the SPF and DKIM records to your `icjia.cloud` DNS
4. Click **Verify DNS Settings** in the Mailgun dashboard

---

## 5. Testing

### Quick SMTP Test

From the command line (requires `swaks` — install via `brew install swaks`):

```bash
swaks --auth \
  --server smtp.mailgun.org \
  --port 587 \
  --au postmaster@icjia.cloud \
  --ap YOUR_SMTP_PASSWORD \
  --to your-email@illinois.gov \
  --from admin@icjia.cloud \
  --h-Subject "Test OTP" \
  --body "Your code is: 123456"
```

### Development Mode

In development (`NODE_ENV=development`), the mailer logs OTP codes to the console regardless of whether SMTP credentials are configured. You don't need Mailgun credentials to develop locally — just look at the console output for OTP codes.

If you want to test actual email delivery in development, set the Mailgun env vars in `apps/api/.env` and they'll be used.

---

## 6. Switching to SMTP2GO

To switch from Mailgun to SMTP2GO, update only the environment variables:

```env
MAIL_PROVIDER=smtp2go

SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_USER=your-smtp2go-user
SMTP_PASS=your-smtp2go-password
SMTP_FROM=noreply@icjia.illinois.gov
```

No code changes required. See `docs/06-smtp2go-integration.md` for full SMTP2GO setup.

---

## 7. Troubleshooting

### "Authentication failed" error

- Double-check `SMTP_USER` and `SMTP_PASS` in `.env`
- In Mailgun, go to **Sending → Domain settings → SMTP credentials** and verify the username
- Reset the SMTP password if needed

### Emails not arriving

- Check the Mailgun **Logs** tab for delivery status
- Verify the sender domain has valid SPF/DKIM records
- Check the recipient's spam/junk folder
- Illinois.gov email systems (Microsoft 365) can be aggressive with filtering — having proper SPF/DKIM on `icjia.cloud` helps significantly

### Mailgun free tier limits

Mailgun's current free tier (Flex plan) gives you:
- 1,000 emails/month for the first 3 months (trial)
- After trial: pay-as-you-go at ~$1 per 1,000 emails

For this app's volume (~17 OTPs/day with 50 active users), costs are negligible. If you want a truly free option long-term, switch to SMTP2GO (1,000 emails/month, permanent free plan).

---

*End of Mailgun Integration Guide — v1.0*
