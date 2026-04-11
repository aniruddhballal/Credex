import { Response } from 'express'
import { Types } from 'mongoose'
import Notification from '../models/Notification'
import { sendSuccess, sendPaginated, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

// GET /api/notifications — FIX 11: accept cursor param
export const listNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { unreadOnly, lastId, cursor, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 50)
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(req.user!.userId) }

    if (unreadOnly === 'true') filter.isRead = false
    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $lt: new Types.ObjectId(resolvedCursor) }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(pageLimit)
    const unreadCount = await Notification.countDocuments({ userId: new Types.ObjectId(req.user!.userId), isRead: false })

    sendPaginated(res, notifications, notifications.length === pageLimit ? notifications[notifications.length - 1]._id.toString() : null)
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/notifications/:id/read
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: new Types.ObjectId(req.user!.userId) },
      { isRead: true, readAt: new Date() },
      { new: true }
    )
    if (!notification) { sendError(res, 'Notification not found', 404); return }
    sendSuccess(res, { notification })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/notifications/read-all
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Notification.updateMany(
      { userId: new Types.ObjectId(req.user!.userId), isRead: false },
      { isRead: true, readAt: new Date() }
    )
    sendSuccess(res, null, 'All notifications marked as read')
  } catch {
    sendError(res, 'Server error', 500)
  }
}