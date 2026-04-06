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
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })
}

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, password, role, phone } = req.body

    if (!['buyer', 'supplier'].includes(role)) {
      res.status(400).json({ success: false, message: 'Role must be buyer or supplier' })
      return
    }

    const existing = await User.findOne({ email })
    if (existing) {
      res.status(409).json({ success: false, message: 'Email already registered' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const verificationToken = generateVerificationToken()
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
      phone,
      isEmailVerified: false,
      verificationToken,
      verificationTokenExpiry,
      isDeleted: false,
      isIpRestricted: false,
      ipWhitelist: [],
    })

    AuditLog.create({
      performedBy: user._id,
      performedByRole: user.role,
      ipAddress: getIp(req),
      action: 'user.create',
      entityType: 'User',
      entityId: user._id,
      note: 'User self-registered',
      timestamp: new Date(),
    }).catch(() => { })

    const { subject, html } = emailTemplates.verification(firstName, verificationToken)
    sendEmail({ to: email, subject, html }).catch(() => { })

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email, isDeleted: false })
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' })
      return
    }

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials' })
      return
    }

    if (!user.isEmailVerified) {
      res.status(403).json({ success: false, message: 'Please verify your email first' })
      return
    }

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      companyId: user.companyId?.toString(),
    })

    const { token: refreshToken, jti } = generateRefreshToken(user._id as Types.ObjectId)

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await Session.create({
      userId: user._id,
      sessionToken: jti,
      ipAddress: getIp(req),
      deviceInfo: { userAgent: req.headers['user-agent'] || 'unknown' },
      isActive: true,
      loginTime: new Date(),
      lastActivity: new Date(),
      expiresAt,
    })

    user.lastActivity = new Date()
    await user.save()

    setRefreshCookie(res, refreshToken)

    res.json({
      success: true,
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
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/auth/refresh
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE]
    if (!token) {
      res.status(401).json({ success: false, message: 'No refresh token' })
      return
    }

    const payload = verifyRefreshToken(token)

    const session = await Session.findOne({ sessionToken: payload.jti, isActive: true })
    if (!session) {
      res.status(401).json({ success: false, message: 'Session expired or invalid' })
      return
    }

    const user = await User.findById(payload.userId)
    if (!user || user.isDeleted) {
      res.status(401).json({ success: false, message: 'User not found' })
      return
    }

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      companyId: user.companyId?.toString(),
    })

    session.lastActivity = new Date()
    await session.save()

    res.json({ success: true, accessToken })
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' })
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

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired verification link' })
      return
    }

    user.isEmailVerified = true
    user.verificationToken = undefined
    user.verificationTokenExpiry = undefined
    await user.save()

    res.json({ success: true, message: 'Email verified successfully' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body

    const user = await User.findOne({ email, isDeleted: false })
    // Always return 200 to avoid email enumeration
    if (!user) {
      res.json({ success: true, message: 'If that email exists, a reset link has been sent.' })
      return
    }

    const resetToken = generateResetToken()
    user.resetPasswordToken = resetToken
    user.resetPasswordTokenExpiry = new Date(Date.now() + 30 * 60 * 1000) // 30 min
    await user.save()

    const { subject, html } = emailTemplates.passwordReset(user.firstName, resetToken)
    sendEmail({ to: email, subject, html }).catch(() => { })

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
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

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset link' })
      return
    }

    user.password = await bcrypt.hash(password, BCRYPT_ROUNDS)
    user.resetPasswordToken = undefined
    user.resetPasswordTokenExpiry = undefined
    await user.save()

    // Invalidate all active sessions on password reset
    await Session.updateMany(
      { userId: user._id, isActive: true },
      { isActive: false, logoutReason: 'password_reset', logoutTime: new Date() }
    )

    AuditLog.create({
      performedBy: user._id,
      performedByRole: user.role,
      ipAddress: getIp(req),
      action: 'user.update',
      entityType: 'User',
      entityId: user._id,
      note: 'Password reset',
      timestamp: new Date(),
    }).catch(() => { })

    res.json({ success: true, message: 'Password reset successful. Please log in again.' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
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
      } catch {
        // token already invalid — fine
      }
    }

    res.clearCookie(REFRESH_TOKEN_COOKIE)
    res.json({ success: true, message: 'Logged out successfully' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/auth/me
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId).select('-password -verificationToken -resetPasswordToken')
    if (!user || user.isDeleted) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }
    res.json({ success: true, user })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}