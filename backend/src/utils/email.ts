import { google } from 'googleapis'
import nodemailer from 'nodemailer'

const getTransporter = async () => {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  const user = process.env.GMAIL_USER

  // ── Env var check ──────────────────────────────────────────────────────────
  console.log('[email] Checking env vars...')
  if (!clientId)     console.error('[email] ❌ GMAIL_CLIENT_ID is missing')
  if (!clientSecret) console.error('[email] ❌ GMAIL_CLIENT_SECRET is missing')
  if (!refreshToken) console.error('[email] ❌ GMAIL_REFRESH_TOKEN is missing')
  if (!user)         console.error('[email] ❌ GMAIL_USER is missing')

  if (!clientId || !clientSecret || !refreshToken || !user) {
    throw new Error('Missing Gmail OAuth2 env vars — check logs above')
  }

  console.log(`[email] GMAIL_USER = ${user}`)
  console.log(`[email] GMAIL_CLIENT_ID = ${clientId.slice(0, 12)}...`)

  // ── OAuth2 access token ────────────────────────────────────────────────────
  console.log('[email] Requesting OAuth2 access token from Google...')
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  )

  oauth2Client.setCredentials({ refresh_token: refreshToken })

  let accessToken: string | null | undefined
  try {
    const tokenResponse = await oauth2Client.getAccessToken()
    accessToken = tokenResponse.token
    if (!accessToken) {
      throw new Error('getAccessToken() returned null — refresh token may be expired or revoked')
    }
    console.log('[email] ✅ Access token obtained successfully')
  } catch (err) {
    console.error('[email] ❌ Failed to get access token:', err)
    throw err
  }

  // ── Build transporter ──────────────────────────────────────────────────────
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user,
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
    },
  } as nodemailer.TransportOptions)

  // Verify the transporter config
  console.log('[email] Verifying transporter...')
  try {
    await transporter.verify()
    console.log('[email] ✅ Transporter verified — SMTP connection OK')
  } catch (err) {
    console.error('[email] ❌ Transporter verify failed:', err)
    throw err
  }

  return transporter
}

interface MailOptions {
  to: string
  subject: string
  html: string
}

export const sendEmail = async ({ to, subject, html }: MailOptions): Promise<void> => {
  console.log(`[email] Attempting to send "${subject}" to ${to}`)
  try {
    const transporter = await getTransporter()
    const info = await transporter.sendMail({
      from: `"Credex" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    })
    console.log(`[email] ✅ Email sent — messageId: ${info.messageId}`)
  } catch (err) {
    console.error(`[email] ❌ Failed to send email to ${to}:`, err)
    throw err // re-throw so callers can handle if needed
  }
}

export const emailTemplates = {
  verification: (firstName: string, token: string) => ({
    subject: 'Verify your Credex account',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">Welcome to Credex, ${firstName}!</h2>
        <p>Please verify your email address to get started.</p>
        <a href="${process.env.CLIENT_URL}/verify-email?token=${token}"
           style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Verify Email
        </a>
        <p style="color:#6B7280;font-size:14px;margin-top:24px;">This link expires in 24 hours.</p>
      </div>
    `,
  }),

  passwordReset: (firstName: string, token: string) => ({
    subject: 'Reset your Credex password',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">Password Reset Request</h2>
        <p>Hi ${firstName}, we received a request to reset your password.</p>
        <a href="${process.env.CLIENT_URL}/reset-password?token=${token}"
           style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
        <p style="color:#6B7280;font-size:14px;margin-top:24px;">This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  }),
}