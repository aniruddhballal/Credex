import { Request, Response } from 'express'
import { Types } from 'mongoose'
import PurchaseOrder from '../models/PurchaseOrder'
import RFQ from '../models/RFQ'
import User from '../models/User'
import Company from '../models/Company'
import Product from '../models/Product'
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

// POST /api/purchase-orders
// Buyer creates PO from an accepted RFQ
export const createPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company: buyerCompany } = await getUserCompany(req.user!.userId)
    if (!buyerCompany || !['buyer', 'both'].includes(buyerCompany.type)) {
      res.status(403).json({ success: false, message: 'Only buyers can create purchase orders' })
      return
    }

    const { rfqId } = req.body
    if (!rfqId) {
      res.status(400).json({ success: false, message: 'rfqId is required' })
      return
    }

    const rfq = await RFQ.findOne({ _id: rfqId, isDeleted: false })
    if (!rfq) {
      res.status(404).json({ success: false, message: 'RFQ not found' })
      return
    }

    if (rfq.status !== 'accepted') {
      res.status(400).json({ success: false, message: 'RFQ must be accepted before creating a PO' })
      return
    }

    if (rfq.buyerId.toString() !== buyerCompany._id.toString()) {
      res.status(403).json({ success: false, message: 'This RFQ does not belong to your company' })
      return
    }

    // Check no PO already exists for this RFQ
    const existing = await PurchaseOrder.findOne({ rfqId: rfq._id, isDeleted: false })
    if (existing) {
      res.status(409).json({ success: false, message: 'A purchase order already exists for this RFQ' })
      return
    }

    const totalPrice = rfq.currentPrice * rfq.currentQuantity
    const paymentDeadline = new Date(
      Date.now() + rfq.currentPaymentDeadlineDays * 24 * 60 * 60 * 1000
    )

    const po = await PurchaseOrder.create({
      rfqId: rfq._id,
      buyerId: rfq.buyerId,
      supplierId: rfq.supplierId,
      productId: rfq.productId,
      buyerUserId: new Types.ObjectId(req.user!.userId),
      quantity: rfq.currentQuantity,
      unitPrice: rfq.currentPrice,
      totalPrice,
      currency: 'INR',
      financingMethod: rfq.currentFinancingMethod,
      paymentDeadline,
      penaltyRate: rfq.currentPenaltyRate,
      amountPaid: 0,
      amountRemaining: totalPrice,
      paymentStatus: 'unpaid',
      fulfilmentStatus: 'pending',
      status: 'confirmed',
      statusHistory: [{
        status: 'confirmed',
        changedBy: new Types.ObjectId(req.user!.userId),
        changedAt: new Date(),
        note: 'PO created from accepted RFQ',
      }],
      buyerReviewed: false,
      supplierReviewed: false,
      isDeleted: false,
    })

    // Mark RFQ as converted
    rfq.status = 'converted_to_po'
    await rfq.save()

    // Update product lastPurchasedAt
    Product.findByIdAndUpdate(rfq.productId, { lastPurchasedAt: new Date() }).catch(() => { })

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'po.create',
      entityType: 'PurchaseOrder',
      entityId: po._id,
      note: `PO created from RFQ ${rfqId}`,
      timestamp: new Date(),
    }).catch(() => { })

    const supplierOwnerId = await getCompanyOwnerUserId(rfq.supplierId)
    if (supplierOwnerId) {
      Notification.create({
        userId: supplierOwnerId,
        type: 'po_created',
        title: 'New Purchase Order',
        message: `${buyerCompany.name} has created a Purchase Order.`,
        entityType: 'purchase_order',
        entityId: po._id,
        isRead: false,
      }).catch(() => { })
    }

    res.status(201).json({ success: true, purchaseOrder: po })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/purchase-orders/:id
export const getPurchaseOrderById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
      .populate('productId', 'name images category priceUnit')
      .populate('buyerId', 'name logo isVerified trustBadge city state')
      .populate('supplierId', 'name logo isVerified trustBadge city state')
      .populate('rfqId', 'history currentFinancingMethod')

    if (!po) {
      res.status(404).json({ success: false, message: 'Purchase order not found' })
      return
    }

    const isBuyer = po.buyerId._id?.toString() === company._id.toString() ||
      po.buyerId.toString() === company._id.toString()
    const isSupplier = po.supplierId._id?.toString() === company._id.toString() ||
      po.supplierId.toString() === company._id.toString()

    if (!isBuyer && !isSupplier) {
      res.status(403).json({ success: false, message: 'You are not a party to this PO' })
      return
    }

    res.json({ success: true, purchaseOrder: po })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/purchase-orders
export const listPurchaseOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { role, status, paymentStatus, lastId, limit = '20' } = req.query

    const filter: Record<string, unknown> = { isDeleted: false }

    if (role === 'buyer') filter.buyerId = company._id
    else if (role === 'supplier') filter.supplierId = company._id
    else filter.$or = [{ buyerId: company._id }, { supplierId: company._id }]

    if (status) filter.status = status
    if (paymentStatus) filter.paymentStatus = paymentStatus
    if (lastId) filter._id = { $lt: new Types.ObjectId(lastId as string) }

    const pageLimit = Math.min(parseInt(limit as string), 50)

    const pos = await PurchaseOrder.find(filter)
      .populate('productId', 'name images category')
      .populate('buyerId', 'name logo')
      .populate('supplierId', 'name logo')
      .sort({ paymentDeadline: 1 })
      .limit(pageLimit)

    res.json({
      success: true,
      purchaseOrders: pos,
      nextCursor: pos.length === pageLimit ? pos[pos.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/purchase-orders/:id/fulfilment
// Supplier updates fulfilment status
export const updateFulfilmentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { fulfilmentStatus, note } = req.body
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'completed']
    if (!validStatuses.includes(fulfilmentStatus)) {
      res.status(400).json({ success: false, message: 'Invalid fulfilment status' })
      return
    }

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
    if (!po) {
      res.status(404).json({ success: false, message: 'Purchase order not found' })
      return
    }

    if (po.supplierId.toString() !== company._id.toString()) {
      res.status(403).json({ success: false, message: 'Only the supplier can update fulfilment status' })
      return
    }

    if (['completed', 'cancelled'].includes(po.status)) {
      res.status(400).json({ success: false, message: 'Cannot update a completed or cancelled PO' })
      return
    }

    const before = po.fulfilmentStatus
    po.fulfilmentStatus = fulfilmentStatus

    // Auto-update PO status
    if (fulfilmentStatus === 'completed') {
      po.status = po.paymentStatus === 'paid' ? 'completed' : 'in_progress'
    } else if (po.status === 'confirmed') {
      po.status = 'in_progress'
    }

    po.statusHistory.push({
      status: `fulfilment:${fulfilmentStatus}`,
      changedBy: new Types.ObjectId(req.user!.userId),
      changedAt: new Date(),
      note,
    })

    await po.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'po.update',
      entityType: 'PurchaseOrder',
      entityId: po._id,
      changes: { fulfilmentStatus: { before, after: fulfilmentStatus } },
      timestamp: new Date(),
    }).catch(() => { })

    const buyerOwnerId = await getCompanyOwnerUserId(po.buyerId)
    if (buyerOwnerId) {
      Notification.create({
        userId: buyerOwnerId,
        type: 'po_confirmed',
        title: 'Order update',
        message: `Your order fulfilment status changed to: ${fulfilmentStatus}`,
        entityType: 'purchase_order',
        entityId: po._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, purchaseOrder: po })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/purchase-orders/:id/cancel
export const cancelPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
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

    if (['completed', 'cancelled'].includes(po.status)) {
      res.status(400).json({ success: false, message: `Cannot cancel a PO that is already ${po.status}` })
      return
    }

    if (po.amountPaid > 0) {
      res.status(400).json({ success: false, message: 'Cannot cancel a PO with payments recorded. Raise a dispute instead.' })
      return
    }

    const { reason } = req.body
    const before = po.status
    po.status = 'cancelled'
    po.statusHistory.push({
      status: 'cancelled',
      changedBy: new Types.ObjectId(req.user!.userId),
      changedAt: new Date(),
      note: reason,
    })
    await po.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'po.cancel',
      entityType: 'PurchaseOrder',
      entityId: po._id,
      changes: { status: { before, after: 'cancelled' } },
      note: reason,
      timestamp: new Date(),
    }).catch(() => { })

    const notifyCompanyId = isBuyer ? po.supplierId : po.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({
        userId: notifyUserId,
        type: 'po_cancelled',
        title: 'Purchase Order Cancelled',
        message: `${company.name} cancelled the purchase order.`,
        entityType: 'purchase_order',
        entityId: po._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, message: 'Purchase order cancelled' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}