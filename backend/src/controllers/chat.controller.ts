import { Request, Response } from 'express'
import { Types } from 'mongoose'
import ChatMessage from '../models/ChatMessage'
import RFQ from '../models/RFQ'
import PurchaseOrder from '../models/PurchaseOrder'
import User from '../models/User'
import Company from '../models/Company'
import { AuthRequest } from '../middleware/auth'

const getUserCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return { user: null, company: null }
  const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
  return { user, company }
}

// Verify sender is a party to the thread
const verifyAccess = async (
  company: { _id: Types.ObjectId },
  rfqId?: string,
  purchaseOrderId?: string
): Promise<boolean> => {
  if (rfqId) {
    const rfq = await RFQ.findOne({ _id: rfqId, isDeleted: false })
    if (!rfq) return false
    return (
      rfq.buyerId.toString() === company._id.toString() ||
      rfq.supplierId.toString() === company._id.toString()
    )
  }
  if (purchaseOrderId) {
    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, isDeleted: false })
    if (!po) return false
    return (
      po.buyerId.toString() === company._id.toString() ||
      po.supplierId.toString() === company._id.toString()
    )
  }
  return false
}

// POST /api/chat
export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { rfqId, purchaseOrderId, message } = req.body

    if (!rfqId && !purchaseOrderId) {
      res.status(400).json({ success: false, message: 'Either rfqId or purchaseOrderId is required' })
      return
    }

    if (rfqId && purchaseOrderId) {
      res.status(400).json({ success: false, message: 'Provide either rfqId or purchaseOrderId, not both' })
      return
    }

    if (!message || message.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Message cannot be empty' })
      return
    }

    const hasAccess = await verifyAccess(company, rfqId, purchaseOrderId)
    if (!hasAccess) {
      res.status(403).json({ success: false, message: 'You are not a party to this thread' })
      return
    }

    const chat = await ChatMessage.create({
      rfqId: rfqId ? new Types.ObjectId(rfqId) : undefined,
      purchaseOrderId: purchaseOrderId ? new Types.ObjectId(purchaseOrderId) : undefined,
      senderId: new Types.ObjectId(req.user!.userId),
      senderCompanyId: company._id,
      message: message.trim(),
      isRead: false,
      isDeleted: false,
    })

    const populated = await chat.populate('senderId', 'firstName lastName')

    res.status(201).json({ success: true, message: populated })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/chat?rfqId=...  or  ?purchaseOrderId=...
export const getThread = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { rfqId, purchaseOrderId, lastId, limit = '50' } = req.query

    if (!rfqId && !purchaseOrderId) {
      res.status(400).json({ success: false, message: 'Either rfqId or purchaseOrderId is required' })
      return
    }

    const hasAccess = await verifyAccess(company, rfqId as string, purchaseOrderId as string)
    if (!hasAccess) {
      res.status(403).json({ success: false, message: 'You are not a party to this thread' })
      return
    }

    const filter: Record<string, unknown> = { isDeleted: false }
    if (rfqId) filter.rfqId = new Types.ObjectId(rfqId as string)
    if (purchaseOrderId) filter.purchaseOrderId = new Types.ObjectId(purchaseOrderId as string)

    // Cursor pagination — load older messages
    if (lastId) filter._id = { $lt: new Types.ObjectId(lastId as string) }

    const pageLimit = Math.min(parseInt(limit as string), 100)

    const messages = await ChatMessage.find(filter)
      .populate('senderId', 'firstName lastName profilePicture')
      .populate('senderCompanyId', 'name logo')
      .sort({ createdAt: -1 })
      .limit(pageLimit)

    // Mark unread messages from other party as read
    const otherPartyMessages = messages
      .filter((m) => m.senderCompanyId._id?.toString() !== company._id.toString() && !m.isRead)
      .map((m) => m._id)

    if (otherPartyMessages.length > 0) {
      ChatMessage.updateMany(
        { _id: { $in: otherPartyMessages } },
        { isRead: true, readAt: new Date() }
      ).catch(() => { })
    }

    res.json({
      success: true,
      messages: messages.reverse(), // oldest first
      nextCursor: messages.length === pageLimit ? messages[0]?._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}