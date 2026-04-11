import { Request, Response } from 'express'
import { Types } from 'mongoose'
import Payment from '../models/Payment'
import PurchaseOrder from '../models/PurchaseOrder'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import Notification from '../models/Notification'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

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

// POST /api/purchase-orders/:id/payments — FIX 9: accept both reference/referenceNumber
export const recordPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company: buyerCompany } = await getUserCompany(req.user!.userId)
    if (!buyerCompany) { sendError(res, 'No company linked to account', 403); return }

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
    if (!po) { sendError(res, 'Purchase order not found', 404); return }
    if (po.buyerId.toString() !== buyerCompany._id.toString()) { sendError(res, 'Only the buyer can record payments', 403); return }
    if (po.paymentStatus === 'paid') { sendError(res, 'This PO is already fully paid', 400); return }
    if (po.status === 'cancelled') { sendError(res, 'Cannot record payment on a cancelled PO', 400); return }

    const { amount, method, referenceNumber, reference, paidAt, note } = req.body
    const resolvedReference = referenceNumber ?? reference  // FIX 9

    if (!amount || amount <= 0) { sendError(res, 'Amount must be greater than 0', 400); return }
    if (!method) { sendError(res, 'Payment method is required', 400); return }
    if (amount > po.amountRemaining) {
      sendError(res, `Payment amount (${amount}) exceeds amount remaining (${po.amountRemaining})`, 400); return
    }

    const payment = await Payment.create({
      purchaseOrderId: po._id, buyerId: po.buyerId, supplierId: po.supplierId,
      recordedBy: new Types.ObjectId(req.user!.userId),
      amount, currency: po.currency, method,
      referenceNumber: resolvedReference,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      note,
    })

    const newAmountPaid = po.amountPaid + amount
    const newAmountRemaining = po.totalPrice - newAmountPaid
    po.amountPaid = newAmountPaid
    po.amountRemaining = newAmountRemaining

    if (newAmountRemaining <= 0) {
      po.paymentStatus = 'paid'
      if (po.fulfilmentStatus === 'completed') {
        po.status = 'completed'
        po.statusHistory.push({ status: 'completed', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note: 'Auto-completed: payment and fulfilment both done' })
      }
    } else {
      po.paymentStatus = 'partially_paid'
    }
    await po.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'payment.create', entityType: 'Payment', entityId: payment._id, timestamp: new Date() }).catch(() => {})

    const supplierOwnerId = await getCompanyOwnerUserId(po.supplierId)
    if (supplierOwnerId) {
      Notification.create({ userId: supplierOwnerId, type: 'payment_received', title: 'Payment recorded', message: `${buyerCompany.name} recorded a payment of ₹${(amount / 100).toLocaleString('en-IN')}`, entityType: 'purchase_order', entityId: po._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { payment, purchaseOrder: po }, undefined, 201)
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/purchase-orders/:id/payments
export const getPaymentsForPO = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) { sendError(res, 'No company linked to account', 403); return }

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
    if (!po) { sendError(res, 'Purchase order not found', 404); return }

    const isBuyer = po.buyerId.toString() === company._id.toString()
    const isSupplier = po.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) { sendError(res, 'You are not a party to this PO', 403); return }

    const payments = await Payment.find({ purchaseOrderId: po._id })
      .populate('recordedBy', 'firstName lastName')
      .sort({ paidAt: -1 })

    sendSuccess(res, { payments })
  } catch {
    sendError(res, 'Server error', 500)
  }
}