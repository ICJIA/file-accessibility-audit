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

export async function sendOTP(to: string, otp: string): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction) {
    console.log(`[DEV] OTP for ${to}: ${otp}`)
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
