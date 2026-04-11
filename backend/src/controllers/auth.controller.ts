import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { Types } from 'mongoose'
import User from '../models/User'
import Session from '../models/Session'
import AuditLog from '../models/AuditLog'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateVerificationToken,
  generateResetToken,
} from '../utils/jwt'
import { sendEmail, emailTemplates } from '../utils/email'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const BCRYPT_ROUNDS = 12
const REFRESH_TOKEN_COOKIE = 'credex_refresh'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress ||
  'unknown'

const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, password, role, phone } = req.body

    if (!['buyer', 'supplier'].includes(role)) {
      sendError(res, 'Role must be buyer or supplier', 400); return
    }

    const existing = await User.findOne({ email })
    if (existing) {
      sendError(res, 'Email already registered', 409); return
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const verificationToken = generateVerificationToken()
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const user = await User.create({
      firstName, lastName, email, password: hashedPassword, role, phone,
      isEmailVerified: false, verificationToken, verificationTokenExpiry,
      isDeleted: false, isIpRestricted: false, ipWhitelist: [],
    })

    AuditLog.create({
      performedBy: user._id, performedByRole: user.role, ipAddress: getIp(req),
      action: 'user.create', entityType: 'User', entityId: user._id,
      note: 'User self-registered', timestamp: new Date(),
    }).catch(() => {})

    const { subject, html } = emailTemplates.verification(firstName, verificationToken)
    sendEmail({ to: email, subject, html }).catch((err) => {
      console.error('[auth/register] Email send failed:', err)
    })

    sendSuccess(res, null, 'Registration successful. Please verify your email.', 201)
  } catch (err) {
    console.error('[register]', err)
    sendError(res, 'Server error', 500)
  }
}

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body
    console.log(`[login] Attempt for: ${email}`)

    if (!email || !password) {
      sendError(res, 'Email and password are required', 400); return
    }

    const user = await User.findOne({ email, isDeleted: false })
    if (!user) {
      console.warn(`[login] No user found for email: ${email}`)
      sendError(res, 'Invalid credentials', 401); return
    }

    console.log(`[login] User found: ${user._id} | verified: ${user.isEmailVerified}`)

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      console.warn(`[login] Password mismatch for: ${email}`)
      sendError(res, 'Invalid credentials', 401); return
    }

    if (!user.isEmailVerified) {
      console.warn(`[login] Email not verified for: ${email}`)
      sendError(res, 'Please verify your email first', 403); return
    }

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      companyId: user.companyId?.toString(),
    })

    const { token: refreshToken, jti } = generateRefreshToken(user._id as Types.ObjectId)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await Session.create({
      userId: user._id, sessionToken: jti, ipAddress: getIp(req),
      deviceInfo: { userAgent: req.headers['user-agent'] || 'unknown' },
      isActive: true, loginTime: new Date(), lastActivity: new Date(), expiresAt,
    })

    user.lastActivity = new Date()
    await user.save()

    setRefreshCookie(res, refreshToken)

    console.log(`[login] ✅ Success for: ${email} | role: ${user.role}`)

    sendSuccess(res, {
      accessToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        isEmailVerified: user.isEmailVerified,
      },
    })
  } catch (err) {
    console.error('[login] ❌ Unexpected error:', err)
    sendError(res, 'Server error', 500)
  }
}

// POST /api/auth/refresh
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE]
    if (!token) { sendError(res, 'No refresh token', 401); return }

    const payload = verifyRefreshToken(token)
    const session = await Session.findOne({ sessionToken: payload.jti, isActive: true })
    if (!session) { sendError(res, 'Session expired or invalid', 401); return }

    const user = await User.findById(payload.userId)
    if (!user || user.isDeleted) { sendError(res, 'User not found', 401); return }

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      companyId: user.companyId?.toString(),
    })

    session.lastActivity = new Date()
    await session.save()

    sendSuccess(res, { accessToken })
  } catch {
    sendError(res, 'Invalid or expired refresh token', 401)
  }
}

// GET /api/auth/verify-email?token=...
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpiry: { $gt: new Date() },
      isDeleted: false,
    })

    if (!user) { sendError(res, 'Invalid or expired verification link', 400); return }

    user.isEmailVerified = true
    user.verificationToken = undefined
    user.verificationTokenExpiry = undefined
    await user.save()

    sendSuccess(res, null, 'Email verified successfully')
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// POST /api/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email, isDeleted: false })
    if (!user) {
      sendSuccess(res, null, 'If that email exists, a reset link has been sent.'); return
    }

    const resetToken = generateResetToken()
    user.resetPasswordToken = resetToken
    user.resetPasswordTokenExpiry = new Date(Date.now() + 30 * 60 * 1000)
    await user.save()

    const { subject, html } = emailTemplates.passwordReset(user.firstName, resetToken)
    sendEmail({ to: email, subject, html }).catch((err) => {
      console.error('[auth/forgot-password] Email send failed:', err)
    })

    sendSuccess(res, null, 'If that email exists, a reset link has been sent.')
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// POST /api/auth/reset-password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordTokenExpiry: { $gt: new Date() },
      isDeleted: false,
    })

    if (!user) { sendError(res, 'Invalid or expired reset link', 400); return }

    user.password = await bcrypt.hash(password, BCRYPT_ROUNDS)
    user.resetPasswordToken = undefined
    user.resetPasswordTokenExpiry = undefined
    await user.save()

    await Session.updateMany(
      { userId: user._id, isActive: true },
      { isActive: false, logoutReason: 'password_reset', logoutTime: new Date() }
    )

    AuditLog.create({
      performedBy: user._id, performedByRole: user.role, ipAddress: getIp(req),
      action: 'user.update', entityType: 'User', entityId: user._id,
      note: 'Password reset', timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, null, 'Password reset successful. Please log in again.')
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// POST /api/auth/logout
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE]
    if (token) {
      try {
        const payload = verifyRefreshToken(token)
        await Session.findOneAndUpdate(
          { sessionToken: payload.jti },
          { isActive: false, logoutReason: 'user', logoutTime: new Date() }
        )
      } catch {}
    }
    res.clearCookie(REFRESH_TOKEN_COOKIE)
    sendSuccess(res, null, 'Logged out successfully')
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/auth/me
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId)
      .select('-password -verificationToken -resetPasswordToken')
      .populate('companyId', 'name type isVerified trustBadge logo city state')

    if (!user || user.isDeleted) { sendError(res, 'User not found', 404); return }

    sendSuccess(res, { user })
  } catch {
    sendError(res, 'Server error', 500)
  }
}