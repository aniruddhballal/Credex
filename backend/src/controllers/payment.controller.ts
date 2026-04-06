import { Request, Response } from 'express'
import { Types } from 'mongoose'
import Payment from '../models/Payment'
import PurchaseOrder from '../models/PurchaseOrder'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import Notification from '../models/Notification'
import { AuthRequest } from '../middleware/auth'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress ||
  'unknown'

const getUserCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return { user: null, company: null }
  const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
  return { user, company }
}

const getCompanyOwnerUserId = async (companyId: Types.ObjectId): Promise<Types.ObjectId | null> => {
  const company = await Company.findById(companyId)
  const owner = company?.members.find((m) => m.role === 'owner')
  return owner?.userId ?? null
}

// POST /api/purchase-orders/:id/payments
// Buyer records a payment against a PO
// Payment documents are immutable — never updated after creation
export const recordPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company: buyerCompany } = await getUserCompany(req.user!.userId)
    if (!buyerCompany) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
    if (!po) {
      res.status(404).json({ success: false, message: 'Purchase order not found' })
      return
    }

    if (po.buyerId.toString() !== buyerCompany._id.toString()) {
      res.status(403).json({ success: false, message: 'Only the buyer can record payments' })
      return
    }

    if (po.paymentStatus === 'paid') {
      res.status(400).json({ success: false, message: 'This PO is already fully paid' })
      return
    }

    if (['cancelled'].includes(po.status)) {
      res.status(400).json({ success: false, message: 'Cannot record payment on a cancelled PO' })
      return
    }

    const { amount, method, referenceNumber, paidAt, note } = req.body

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, message: 'Amount must be greater than 0' })
      return
    }

    if (!method) {
      res.status(400).json({ success: false, message: 'Payment method is required' })
      return
    }

    if (amount > po.amountRemaining) {
      res.status(400).json({
        success: false,
        message: `Payment amount (${amount}) exceeds amount remaining (${po.amountRemaining})`,
      })
      return
    }

    // Create immutable payment record
    const payment = await Payment.create({
      purchaseOrderId: po._id,
      buyerId: po.buyerId,
      supplierId: po.supplierId,
      recordedBy: new Types.ObjectId(req.user!.userId),
      amount,
      currency: po.currency,
      method,
      referenceNumber,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      note,
    })

    // Update PO — controller owns amountPaid and amountRemaining
    const newAmountPaid = po.amountPaid + amount
    const newAmountRemaining = po.totalPrice - newAmountPaid

    po.amountPaid = newAmountPaid
    po.amountRemaining = newAmountRemaining

    // Update paymentStatus
    if (newAmountRemaining <= 0) {
      po.paymentStatus = 'paid'
      // Auto-complete PO if fulfilment is also done
      if (po.fulfilmentStatus === 'completed') {
        po.status = 'completed'
        po.statusHistory.push({
          status: 'completed',
          changedBy: new Types.ObjectId(req.user!.userId),
          changedAt: new Date(),
          note: 'Auto-completed: payment and fulfilment both done',
        })
      }
    } else {
      po.paymentStatus = 'partially_paid'
    }

    await po.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'payment.create',
      entityType: 'Payment',
      entityId: payment._id,
      changes: {
        amountPaid: { before: po.amountPaid - amount, after: po.amountPaid },
        amountRemaining: { before: po.amountRemaining + amount, after: po.amountRemaining },
        paymentStatus: { before: po.paymentStatus, after: po.paymentStatus },
      },
      timestamp: new Date(),
    }).catch(() => { })

    const supplierOwnerId = await getCompanyOwnerUserId(po.supplierId)
    if (supplierOwnerId) {
      Notification.create({
        userId: supplierOwnerId,
        type: 'payment_received',
        title: 'Payment recorded',
        message: `${buyerCompany.name} recorded a payment of ₹${(amount / 100).toLocaleString('en-IN')}`,
        entityType: 'purchase_order',
        entityId: po._id,
        isRead: false,
      }).catch(() => { })
    }

    res.status(201).json({ success: true, payment, purchaseOrder: po })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/purchase-orders/:id/payments
export const getPaymentsForPO = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
    if (!po) {
      res.status(404).json({ success: false, message: 'Purchase order not found' })
      return
    }

    const isBuyer = po.buyerId.toString() === company._id.toString()
    const isSupplier = po.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) {
      res.status(403).json({ success: false, message: 'You are not a party to this PO' })
      return
    }

    const payments = await Payment.find({ purchaseOrderId: po._id })
      .populate('recordedBy', 'firstName lastName')
      .sort({ paidAt: -1 })

    res.json({ success: true, payments })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}