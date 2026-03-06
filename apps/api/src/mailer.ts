import nodemailer from 'nodemailer'

// Works with any SMTP relay: Mailgun (default), SMTP2GO, or others.
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env.
// See docs/07-mailgun-integration.md or docs/06-smtp2go-integration.md.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: Number(process.env.SMTP_PORT) === 465, // true only for implicit TLS (port 465)
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
    from: process.env.SMTP_FROM || 'noreply@localhost',
    to,
    subject: 'File Accessibility Audit — Your Login Code',
    text: `Your one-time login code is: ${otp}\n\nThis code expires in ${process.env.OTP_EXPIRY_MINUTES || 15} minutes.\n\nIf you did not request this code, you can safely ignore this email.`,
    html: `
      <p>Your one-time login code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p>
      <p>This code expires in ${process.env.OTP_EXPIRY_MINUTES || 15} minutes.</p>
      <p style="color: #888;">If you did not request this code, you can safely ignore this email.</p>
    `,
  })
}
