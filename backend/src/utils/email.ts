import { google } from 'googleapis'
import nodemailer from 'nodemailer'

const getTransporter = async () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  )

  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })

  const { token: accessToken } = await oauth2Client.getAccessToken()

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken!,
    },
  } as nodemailer.TransportOptions)
}

interface MailOptions {
  to: string
  subject: string
  html: string
}

export const sendEmail = async ({ to, subject, html }: MailOptions): Promise<void> => {
  const transporter = await getTransporter()
  await transporter.sendMail({
    from: `"Credex" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  })
}

export const emailTemplates = {
  verification: (firstName: string, token: string) => ({
    subject: 'Verify your Credex account',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">Welcome to Credex, ${firstName}!</h2>
        <p>Please verify your email address to get started.</p>
        <a href="${process.env.CLIENT_URL}/auth/verify-email?token=${token}"
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
        <a href="${process.env.CLIENT_URL}/auth/reset-password?token=${token}"
           style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
        <p style="color:#6B7280;font-size:14px;margin-top:24px;">This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  }),
}