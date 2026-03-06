import nodemailer from 'nodemailer'
import { EMAIL, AUTH } from '#config'

// Resolve SMTP settings: config sets the provider, .env supplies credentials.
// SMTP_USER and SMTP_PASS come from .env (secrets never in config).
// Host/port come from audit.config.ts based on EMAIL.PROVIDER.
const provider = EMAIL[EMAIL.PROVIDER]
const host = process.env.SMTP_HOST || provider.host
const port = Number(process.env.SMTP_PORT) || provider.port

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true only for implicit TLS (port 465)
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
})

/**
 * Validates that email is configured. Call before starting the server.
 * In production, SMTP_USER and SMTP_PASS are required.
 * In development, they're optional (OTPs are logged to console).
 */
export function validateMailConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (isProduction) {
      console.error('\n✖ Email provider is not configured.')
      console.error(`  Provider: ${EMAIL.PROVIDER} (${host}:${port})`)
      console.error('  Missing: SMTP_USER and/or SMTP_PASS in .env')
      console.error('  See: docs/07-mailgun-integration.md or docs/06-smtp2go-integration.md\n')
      process.exit(1)
    } else {
      console.warn(`[WARN] SMTP credentials not set — OTP codes will only be logged to console.`)
      console.warn(`[WARN] To send real emails, add SMTP_USER and SMTP_PASS to apps/api/.env\n`)
    }
  } else {
    console.log(`[API] Email provider: ${EMAIL.PROVIDER} (${host}:${port})`)
  }
}

export async function sendOTP(to: string, otp: string): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction) {
    console.log(`[DEV] OTP for ${to}: ${otp}`)
  }

  // In dev without credentials, skip actual sending
  if (!process.env.SMTP_USER) {
    return
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || EMAIL.DEFAULT_FROM,
    to,
    subject: 'File Accessibility Audit — Your Login Code',
    text: `Your one-time login code is: ${otp}\n\nThis code expires in ${AUTH.OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this code, you can safely ignore this email.`,
    html: `
      <p>Your one-time login code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p>
      <p>This code expires in ${AUTH.OTP_EXPIRY_MINUTES} minutes.</p>
      <p style="color: #888;">If you did not request this code, you can safely ignore this email.</p>
    `,
  })
}
