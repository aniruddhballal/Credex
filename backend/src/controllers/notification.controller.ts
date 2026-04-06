import { Response } from 'express'
import { Types } from 'mongoose'
import Notification from '../models/Notification'
import { AuthRequest } from '../middleware/auth'

// GET /api/notifications
export const listNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { unreadOnly, lastId, limit = '20' } = req.query
    const pageLimit = Math.min(parseInt(limit as string), 50)

    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(req.user!.userId),
    }

    if (unreadOnly === 'true') filter.isRead = false
    if (lastId) filter._id = { $lt: new Types.ObjectId(lastId as string) }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(pageLimit)

    const unreadCount = await Notification.countDocuments({
      userId: new Types.ObjectId(req.user!.userId),
      isRead: false,
    })

    res.json({
      success: true,
      notifications,
      unreadCount,
      nextCursor: notifications.length === pageLimit ? notifications[notifications.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
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

    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' })
      return
    }

    res.json({ success: true, notification })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/notifications/read-all
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Notification.updateMany(
      { userId: new Types.ObjectId(req.user!.userId), isRead: false },
      { isRead: true, readAt: new Date() }
    )

    res.json({ success: true, message: 'All notifications marked as read' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}