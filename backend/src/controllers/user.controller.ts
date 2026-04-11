import { Response } from 'express'
import bcrypt from 'bcrypt'
import User from '../models/User'
import AuditLog from '../models/AuditLog'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const BCRYPT_ROUNDS = 12

const getIp = (req: AuthRequest): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

// GET /api/users/profile
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId)
      .select('-password -verificationToken -verificationTokenExpiry -resetPasswordToken -resetPasswordTokenExpiry')
      .populate('companyId', 'name type isVerified trustBadge logo city state')

    if (!user || user.isDeleted) { sendError(res, 'User not found', 404); return }
    sendSuccess(res, { user })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/users/profile
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, phone } = req.body
    const user = await User.findById(req.user!.userId)
    if (!user || user.isDeleted) { sendError(res, 'User not found', 404); return }

    const before = { firstName: user.firstName, lastName: user.lastName, phone: user.phone }
    if (firstName) user.firstName = firstName
    if (lastName) user.lastName = lastName
    if (phone !== undefined) user.phone = phone
    await user.save()

    AuditLog.create({
      performedBy: user._id, performedByRole: user.role, ipAddress: getIp(req),
      action: 'user.update', entityType: 'User', entityId: user._id,
      changes: {
        firstName: { before: before.firstName, after: user.firstName },
        lastName: { before: before.lastName, after: user.lastName },
        phone: { before: before.phone, after: user.phone },
      },
      timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, {
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, role: user.role },
    }, 'Profile updated')
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// POST /api/users/change-password
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) { sendError(res, 'Both current and new password are required', 400); return }
    if (newPassword.length < 8) { sendError(res, 'New password must be at least 8 characters', 400); return }

    const user = await User.findById(req.user!.userId)
    if (!user || user.isDeleted) { sendError(res, 'User not found', 404); return }

    const match = await bcrypt.compare(currentPassword, user.password)
    if (!match) { sendError(res, 'Current password is incorrect', 400); return }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await user.save()

    AuditLog.create({
      performedBy: user._id, performedByRole: user.role, ipAddress: getIp(req),
      action: 'user.update', entityType: 'User', entityId: user._id,
      note: 'Password changed by user', timestamp: new Date(),
    }).catch(() => {})

    sendSuccess(res, null, 'Password changed successfully')
  } catch {
    sendError(res, 'Server error', 500)
  }
}