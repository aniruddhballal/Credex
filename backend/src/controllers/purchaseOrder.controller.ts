import { Request, Response } from 'express'
import { Types } from 'mongoose'
import PurchaseOrder from '../models/PurchaseOrder'
import RFQ from '../models/RFQ'
import Company from '../models/Company'
import Product from '../models/Product'
import AuditLog from '../models/AuditLog'
import Notification from '../models/Notification'
import { sendSuccess, sendPaginated, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'
import { requireUserCompany, CompanyRequiredError } from '../utils/company'

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

const getCompanyOwnerUserId = async (companyId: Types.ObjectId): Promise<Types.ObjectId | null> => {
  const company = await Company.findById(companyId)
  const owner = company?.members.find((m) => m.role === 'owner')
  return owner?.userId ?? null
}

// POST /api/purchase-orders
export const createPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const buyerCompany = await requireUserCompany(req.user!.userId)

    if (!['buyer', 'both'].includes(buyerCompany.type)) {
      sendError(res, 'Only buyers can create purchase orders', 403); return
    }

    const { rfqId } = req.body
    if (!rfqId) { sendError(res, 'rfqId is required', 400); return }

    const rfq = await RFQ.findOne({ _id: rfqId, isDeleted: false })
    if (!rfq) { sendError(res, 'RFQ not found', 404); return }
    if (rfq.status !== 'accepted') { sendError(res, 'RFQ must be accepted before creating a PO', 400); return }
    if (rfq.buyerId.toString() !== buyerCompany._id.toString()) { sendError(res, 'This RFQ does not belong to your company', 403); return }

    const existing = await PurchaseOrder.findOne({ rfqId: rfq._id, isDeleted: false })
    if (existing) { sendError(res, 'A purchase order already exists for this RFQ', 409); return }

    const totalPrice = rfq.currentPrice * rfq.currentQuantity
    const paymentDeadline = new Date(Date.now() + rfq.currentPaymentDeadlineDays * 24 * 60 * 60 * 1000)

    const po = await PurchaseOrder.create({
      rfqId: rfq._id, buyerId: rfq.buyerId, supplierId: rfq.supplierId, productId: rfq.productId,
      buyerUserId: new Types.ObjectId(req.user!.userId),
      quantity: rfq.currentQuantity, unitPrice: rfq.currentPrice, totalPrice, currency: 'INR',
      financingMethod: rfq.currentFinancingMethod, paymentDeadline,
      penaltyRate: rfq.currentPenaltyRate,
      amountPaid: 0, amountRemaining: totalPrice,
      paymentStatus: 'unpaid', fulfilmentStatus: 'pending', status: 'confirmed',
      statusHistory: [{ status: 'confirmed', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note: 'PO created from accepted RFQ' }],
      buyerReviewed: false, supplierReviewed: false, isDeleted: false,
    })

    rfq.status = 'converted_to_po'
    await rfq.save()

    Product.findByIdAndUpdate(rfq.productId, { lastPurchasedAt: new Date() }).catch(() => {})

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'po.create', entityType: 'PurchaseOrder', entityId: po._id, note: `PO created from RFQ ${rfqId}`, timestamp: new Date() }).catch(() => {})

    const supplierOwnerId = await getCompanyOwnerUserId(rfq.supplierId)
    if (supplierOwnerId) {
      Notification.create({ userId: supplierOwnerId, type: 'po_created', title: 'New Purchase Order', message: `${buyerCompany.name} has created a Purchase Order.`, entityType: 'purchase_order', entityId: po._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { purchaseOrder: po }, undefined, 201)
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/purchase-orders/:id
export const getPurchaseOrderById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
      .populate('productId', 'name images category priceUnit basePrice')
      .populate('buyerId', 'name logo isVerified trustBadge city state')
      .populate('supplierId', 'name logo isVerified trustBadge city state')
      .populate('rfqId', 'history currentFinancingMethod currentPaymentDeadlineDays')

    if (!po) { sendError(res, 'Purchase order not found', 404); return }

    const isBuyer = po.buyerId._id?.toString() === company._id.toString() || po.buyerId.toString() === company._id.toString()
    const isSupplier = po.supplierId._id?.toString() === company._id.toString() || po.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) { sendError(res, 'You are not a party to this PO', 403); return }

    sendSuccess(res, { purchaseOrder: po })
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/purchase-orders
export const listPurchaseOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const { role, status, paymentStatus, lastId, cursor, limit = '20' } = req.query
    const filter: Record<string, unknown> = { isDeleted: false }

    if (role === 'buyer') filter.buyerId = company._id
    else if (role === 'supplier') filter.supplierId = company._id
    else filter.$or = [{ buyerId: company._id }, { supplierId: company._id }]

    if (status) filter.status = status

    if (paymentStatus) {
      const statuses = (paymentStatus as string).split(',').map(s => s.trim())
      filter.paymentStatus = statuses.length === 1 ? statuses[0] : { $in: statuses }
    }

    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $lt: new Types.ObjectId(resolvedCursor) }

    const pageLimit = Math.min(parseInt(limit as string), 50)
    const pos = await PurchaseOrder.find(filter)
      .populate('productId', 'name images category')
      .populate('buyerId', 'name logo')
      .populate('supplierId', 'name logo')
      .sort({ paymentDeadline: 1 })
      .limit(pageLimit)

    sendPaginated(res, pos, pos.length === pageLimit ? pos[pos.length - 1]._id.toString() : null)
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/purchase-orders/:id/fulfilment
export const updateFulfilmentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const { fulfilmentStatus, note } = req.body
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'completed']
    if (!validStatuses.includes(fulfilmentStatus)) { sendError(res, 'Invalid fulfilment status', 400); return }

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
    if (!po) { sendError(res, 'Purchase order not found', 404); return }
    if (po.supplierId.toString() !== company._id.toString()) { sendError(res, 'Only the supplier can update fulfilment status', 403); return }
    if (['completed', 'cancelled'].includes(po.status)) { sendError(res, 'Cannot update a completed or cancelled PO', 400); return }

    const before = po.fulfilmentStatus
    po.fulfilmentStatus = fulfilmentStatus
    if (fulfilmentStatus === 'completed') {
      po.status = po.paymentStatus === 'paid' ? 'completed' : 'in_progress'
    } else if (po.status === 'confirmed') {
      po.status = 'in_progress'
    }
    po.statusHistory.push({ status: `fulfilment:${fulfilmentStatus}`, changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note })
    await po.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'po.update', entityType: 'PurchaseOrder', entityId: po._id, changes: { fulfilmentStatus: { before, after: fulfilmentStatus } }, timestamp: new Date() }).catch(() => {})

    const buyerOwnerId = await getCompanyOwnerUserId(po.buyerId)
    if (buyerOwnerId) {
      Notification.create({ userId: buyerOwnerId, type: 'po_confirmed', title: 'Order update', message: `Your order fulfilment status changed to: ${fulfilmentStatus}`, entityType: 'purchase_order', entityId: po._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { purchaseOrder: po })
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// POST /api/purchase-orders/:id/cancel
export const cancelPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const po = await PurchaseOrder.findOne({ _id: req.params.id, isDeleted: false })
    if (!po) { sendError(res, 'Purchase order not found', 404); return }

    const isBuyer = po.buyerId.toString() === company._id.toString()
    const isSupplier = po.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) { sendError(res, 'You are not a party to this PO', 403); return }
    if (['completed', 'cancelled'].includes(po.status)) { sendError(res, `Cannot cancel a PO that is already ${po.status}`, 400); return }
    if (po.amountPaid > 0) { sendError(res, 'Cannot cancel a PO with payments recorded. Raise a dispute instead.', 400); return }

    const { reason } = req.body
    const before = po.status
    po.status = 'cancelled'
    po.statusHistory.push({ status: 'cancelled', changedBy: new Types.ObjectId(req.user!.userId), changedAt: new Date(), note: reason })
    await po.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'po.cancel', entityType: 'PurchaseOrder', entityId: po._id, changes: { status: { before, after: 'cancelled' } }, note: reason, timestamp: new Date() }).catch(() => {})

    const notifyCompanyId = isBuyer ? po.supplierId : po.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({ userId: notifyUserId, type: 'po_cancelled', title: 'Purchase Order Cancelled', message: `${company.name} cancelled the purchase order.`, entityType: 'purchase_order', entityId: po._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, null, 'Purchase order cancelled')
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}