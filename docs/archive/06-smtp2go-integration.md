# 06 — SMTP2GO Integration Guide

**Project:** `file-accessibility-audit`
**Purpose:** Email delivery for OTP authentication codes
**Provider:** SMTP2GO (free plan)

---

## 1. Why SMTP2GO

### Why Not SendGrid?

SendGrid retired its free plan on May 27, 2025. New accounts only get a 60-day trial limited to 100 emails/day, after which the minimum paid plan is $19.95/month. For an internal tool sending a handful of OTP emails per day, that's an unnecessary recurring cost.

### Why Not Mailgun?

Mailgun's free plan offers 100 emails/day with no expiration, which sounds adequate — but there's a significant gotcha. Without a credit card on file, Mailgun restricts sending to only 5 pre-authorized recipient email addresses. Since this app sends OTPs to any `@illinois.gov` address on demand, you'd need to either pre-authorize every possible user (defeating the purpose) or add a credit card just to unlock unrestricted sending on a "free" plan.

### Why SMTP2GO Works Better

SMTP2GO's free plan avoids both of these problems:

- **No credit card required** — sign up and start sending immediately, no payment info needed
- **No authorized recipient restriction** — send to any email address from day one
- **1,000 emails/month, 200/day** — more than sufficient for OTP delivery to internal agency staff
- **Never expires** — the free plan is permanent, not a trial with a countdown
- **Graceful overflow handling** — if you exceed the daily limit, emails are queued and delivered when capacity frees up (Mailgun drops them)
- **Multiple SMTP ports** — listens on ports 25, 587, 2525, and 8025. Port 2525 is ideal because it avoids ISP blocks on port 25 and works from most network environments, including a future internal Linux server deployment
- **No code changes to upgrade** — if you ever outgrow the free plan, upgrading keeps the same SMTP credentials and API keys. Just change the plan in the dashboard.
- **Domain verification with SPF/DKIM** — proper email authentication is available even on the free plan, which improves deliverability to state government email systems

### Volume Math

With 72-hour JWT sessions, each user authenticates roughly once every 3 days. Even with 50 active users (generous for an internal ICJIA tool), that's approximately 17 OTP emails per day or ~500 per month — well under the 1,000/month free limit.

---

## 2. Registration

### Step-by-Step Account Setup

1. Go to [https://www.smtp2go.com/pricing/](https://www.smtp2go.com/pricing/) and click **Sign Up Free**
2. Enter your name, email (use your `@illinois.gov` address), and a password
3. No credit card is requested — the free plan is fully functional without one
4. Verify your account via the confirmation email sent to your signup address
5. Log in to the SMTP2GO dashboard

### Verify Your Sender Domain

This is the most important step. Without domain verification, SMTP2GO throttles you to 25 emails/hour. With it, the hourly throttle is removed and your emails get proper SPF/DKIM authentication.

1. In the dashboard, go to **Sending → Verified Senders**
2. Click **Add a Sender Domain**
3. Enter your sending domain (e.g., `icjia.illinois.gov` or whatever domain you control for the `SMTP_FROM` address)
4. SMTP2GO will give you DNS records to add:
   - **SPF record** — a TXT record authorizing SMTP2GO to send on behalf of your domain
   - **DKIM record** — a TXT record with a cryptographic key for email signing
   - **CNAME tracking record** — optional, for open/click tracking (not needed for OTP emails)
5. Add the SPF and DKIM records to your domain's DNS (you may need to coordinate with your DNS administrator for `illinois.gov` subdomains)
6. Return to the SMTP2GO dashboard and click **Verify** — it checks DNS propagation and confirms
7. Once verified, the 25/hour throttle is lifted

**If you cannot modify DNS** (common with state government domains): you can alternatively verify a single sender email address instead of a full domain. Go to **Sending → Verified Senders → Add a Single Sender Email**, enter the `SMTP_FROM` address, and click the verification link sent to that address. This works but doesn't provide SPF/DKIM alignment — emails may land in spam filters more often. Domain verification is strongly preferred.

### Create SMTP Credentials

1. In the dashboard, go to **Sending → SMTP Users**
2. Click **Add SMTP User**
3. Enter a username (e.g., `file-audit`) — this becomes your `SMTP_USER`
4. SMTP2GO generates a password — copy it immediately and save it securely. This is your `SMTP_PASS`. It will not be shown again (you can reset it later if lost).
5. Note the SMTP server: `mail.smtp2go.com`

---

## 3. Project Integration

### Environment Variables

In `apps/api/.env`:

```env
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_USER=file-audit
SMTP_PASS=<password-from-smtp2go-dashboard>
SMTP_FROM=noreply@icjia.illinois.gov
```

**Port choice:** Use `2525`. It's open from most locations, avoids ISP blocks on port 25, and works on DigitalOcean droplets. Port 587 also works. Do not use port 25 — many hosting providers and ISPs block it.

**`SMTP_FROM` address:** This must match either your verified sender domain or your verified single sender email. If you verified `icjia.illinois.gov` as a domain, any `@icjia.illinois.gov` address works. If you verified a single email, it must be that exact address.

### Nodemailer Configuration

The `mailer.ts` service in `apps/api/src/` uses Nodemailer with these SMTP2GO credentials:

```typescript
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,       // mail.smtp2go.com
  port: Number(process.env.SMTP_PORT), // 2525
  secure: false,                       // STARTTLS on port 2525/587 (not SSL)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendOTP(to: string, otp: string): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'File Accessibility Audit — Your Login Code',
    text: `Your one-time login code is: ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not request this code, you can safely ignore this email.`,
    html: `
      <p>Your one-time login code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p>
      <p>This code expires in 15 minutes.</p>
      <p style="color: #888;">If you did not request this code, you can safely ignore this email.</p>
    `,
  })
}
```

**Key implementation notes:**

- `secure: false` is correct for port 2525/587 — Nodemailer automatically upgrades to STARTTLS during the connection handshake. Setting `secure: true` is only for port 465 (implicit TLS), which SMTP2GO also supports but 2525 is preferred.
- Always send both `text` and `html` versions — some state government email clients strip HTML.
- The OTP should be styled large and monospaced in HTML so it's easy to read and type.
- Never include the OTP in the email subject line — subjects are sometimes displayed in push notifications and preview panes where bystanders can see them.

### Error Handling for Email Delivery

Wrap the `sendMail` call in a try/catch. If SMTP2GO rejects the message (bad credentials, domain not verified, rate limit hit), return a generic error to the user:

```typescript
try {
  await sendOTP(email, otp)
} catch (err) {
  console.error('SMTP error:', err) // log full error server-side
  return res.status(503).json({
    error: 'Unable to send verification email. Please try again in a few minutes.'
  })
}
```

Never expose the SMTP error message to the client — it may contain credentials, server names, or internal configuration details.

---

## 4. Gotchas & Troubleshooting

### Unverified Domain Throttle

If you haven't verified your sender domain, SMTP2GO limits you to 25 emails per hour. For OTP delivery this is probably fine, but the throttle can cause delays during testing when you're sending many OTPs in quick succession. Verify the domain to remove the throttle.

### Free Plan Monthly Reset

The 1,000 email monthly quota resets on a rolling basis from your signup date — not the calendar month. Your reset date is shown on the main dashboard page under the quota usage bar. If you hit the limit, sending is paused (emails are rejected, not queued) until the quota resets. You'd need to send ~33 OTPs per day for 30 days straight to hit this, which is unlikely.

### Emails Landing in Spam

State government email systems (especially Microsoft 365-based ones) can be aggressive with spam filtering. To maximize deliverability:

1. **Verify your sender domain with SPF and DKIM** — this is the single most impactful thing you can do
2. **Use a professional `From` address** — `noreply@icjia.illinois.gov` is better than a sandbox domain
3. **Keep email content simple** — avoid excessive HTML, images, or links. The OTP email template above is minimal by design
4. **Don't use URL shorteners** in email content — they're a spam signal
5. If emails consistently land in spam for a particular recipient, ask them to add the `SMTP_FROM` address to their contacts or safe senders list

### SMTP2GO Sandbox Domain

When you first create an account, SMTP2GO gives you a sandbox domain (something like `yourname.smtp2go.net`). You can send from this domain for testing, but it has poor deliverability and looks unprofessional. Always verify and use your own domain for production.

### Credential Rotation

If you need to rotate the SMTP password (e.g., if it's been compromised):

1. Go to **Sending → SMTP Users** in the SMTP2GO dashboard
2. Click the reset icon next to your SMTP user
3. Copy the new password
4. Update `SMTP_PASS` in `apps/api/.env` on the droplet
5. Restart the API: `pm2 restart file-audit-api`
6. No code changes required — only the env var changes

### Testing Email Delivery Locally

During development, you can test SMTP2GO delivery without deploying:

```bash
# Quick test from the command line using swaks (install: sudo apt install swaks)
swaks --auth \
  --server mail.smtp2go.com \
  --port 2525 \
  --au YOUR_SMTP_USER \
  --ap YOUR_SMTP_PASSWORD \
  --to your-email@illinois.gov \
  --from noreply@icjia.illinois.gov \
  --h-Subject "Test OTP" \
  --body "Your code is: 123456"
```

### Monitoring Usage

The SMTP2GO dashboard shows real-time delivery stats: sent, delivered, bounced, and queued. On the free plan, email activity logs are retained for 5 days. SMTP2GO also sends usage notifications when you hit 80%, 90%, and 100% of your monthly quota.

---

## 5. Future: Internal Linux Server Deployment

If this app eventually moves to an internal Linux server behind the ICJIA firewall:

- **SMTP2GO will still work** — as long as the server can make outbound connections to `mail.smtp2go.com` on port 2525. Most firewalls allow outbound connections on non-standard ports. If 2525 is blocked, try 587 or 8025.
- **Alternative: internal SMTP relay** — if the agency has an internal mail relay (Exchange, Postfix, etc.), you can swap the SMTP credentials in `.env` to point at the internal relay instead. The Nodemailer code doesn't change — only the env vars.
- **DNS considerations** — Let's Encrypt won't work behind a firewall. You'd need an internal CA certificate or a self-signed cert. Forge wouldn't be used either — you'd manage nginx and PM2 directly.

---

## 6. Cost Summary

| Item | Cost | Notes |
|------|------|-------|
| SMTP2GO free plan | $0/month | 1,000 emails/month, permanent |
| Domain verification | $0 | Just DNS records |
| Upgrade to 10K plan | $10/month | Only if you exceed 1,000 emails/month (unlikely) |

For this project's expected volume, the free plan should be sufficient indefinitely.

---

*End of SMTP2GO Integration Guide — v1.1*
