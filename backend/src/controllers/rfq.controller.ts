import { Request, Response } from 'express'
import { Types } from 'mongoose'
import RFQ from '../models/RFQ'
import Product from '../models/Product'
import Company from '../models/Company'
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

// POST /api/rfqs
export const createRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const buyerCompany = await requireUserCompany(req.user!.userId)

    if (!['buyer', 'both'].includes(buyerCompany.type)) {
      sendError(res, 'Only buyers can create RFQs', 403); return
    }

    const {
      productId, proposedPrice, message,
      quantity, proposedQuantity,
      financingMethod, proposedFinancingMethod,
      paymentDeadlineDays, proposedPaymentDeadlineDays,
      penaltyRate, proposedPenaltyRate,
    } = req.body

    const resolvedQuantity = quantity ?? proposedQuantity
    const resolvedFinancing = financingMethod ?? proposedFinancingMethod
    const resolvedDeadlineDays = paymentDeadlineDays ?? proposedPaymentDeadlineDays
    const resolvedPenaltyRate = penaltyRate ?? proposedPenaltyRate

    if (!productId || !resolvedQuantity || !resolvedFinancing) {
      sendError(res, 'productId, quantity and financingMethod are required', 400); return
    }

    const product = await Product.findOne({ _id: productId, isDeleted: false, isAvailable: true })
    if (!product) { sendError(res, 'Product not found or unavailable', 404); return }

    if (product.supplierId.toString() === buyerCompany._id.toString()) {
      sendError(res, 'You cannot create an RFQ for your own product', 400); return
    }

    const price = proposedPrice ?? product.basePrice
    const deadlineDays = resolvedDeadlineDays ?? product.defaultPaymentDeadlineDays
    const penalty = resolvedPenaltyRate ?? product.defaultPenaltyRate
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const historyEntry = {
      by: 'buyer' as const,
      byUserId: new Types.ObjectId(req.user!.userId),
      proposedPrice: price,
      proposedQuantity: resolvedQuantity,
      proposedFinancingMethod: resolvedFinancing,
      proposedPaymentDeadlineDays: deadlineDays,
      proposedPenaltyRate: penalty,
      message,
      at: new Date(),
    }

    const rfq = await RFQ.create({
      buyerId: buyerCompany._id,
      supplierId: product.supplierId,
      productId: product._id,
      buyerUserId: new Types.ObjectId(req.user!.userId),
      currentPrice: price, currentQuantity: resolvedQuantity,
      currentFinancingMethod: resolvedFinancing,
      currentPaymentDeadlineDays: deadlineDays,
      currentPenaltyRate: penalty,
      lastMovedBy: 'buyer', lastMovedAt: new Date(),
      status: 'pending', expiresAt,
      history: [historyEntry],
      note: message, isDeleted: false,
    })

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role,
      ipAddress: getIp(req), action: 'rfq.create', entityType: 'RFQ', entityId: rfq._id,
      timestamp: new Date(),
    }).catch(() => {})

    const supplierOwnerId = await getCompanyOwnerUserId(product.supplierId)
    if (supplierOwnerId) {
      Notification.create({
        userId: supplierOwnerId, type: 'rfq_received', title: 'New RFQ received',
        message: `${buyerCompany.name} sent an RFQ for ${product.name}`,
        entityType: 'rfq', entityId: rfq._id, isRead: false,
      }).catch(() => {})
    }

    sendSuccess(res, { rfq }, undefined, 201)
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// POST /api/rfqs/:id/counter
export const counterRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
    if (!rfq) { sendError(res, 'RFQ not found', 404); return }

    if (!['pending', 'countered'].includes(rfq.status)) {
      sendError(res, `Cannot counter an RFQ with status '${rfq.status}'`, 400); return
    }

    if (new Date() > rfq.expiresAt) {
      rfq.status = 'expired'; await rfq.save()
      sendError(res, 'This RFQ has expired', 400); return
    }

    const isBuyer = rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) { sendError(res, 'You are not a party to this RFQ', 403); return }

    const moverRole = isBuyer ? 'buyer' : 'supplier'
    if (rfq.lastMovedBy === moverRole) {
      sendError(res, 'Waiting for the other party to respond', 400); return
    }

    const { proposedPrice, quantity, financingMethod, paymentDeadlineDays, penaltyRate, message } = req.body

    const newPrice = proposedPrice ?? rfq.currentPrice
    const newQty = quantity ?? rfq.currentQuantity
    const newMethod = financingMethod ?? rfq.currentFinancingMethod
    const newDeadline = paymentDeadlineDays ?? rfq.currentPaymentDeadlineDays
    const newPenalty = penaltyRate ?? rfq.currentPenaltyRate

    rfq.history.push({ by: moverRole, byUserId: new Types.ObjectId(req.user!.userId), proposedPrice: newPrice, proposedQuantity: newQty, proposedFinancingMethod: newMethod, proposedPaymentDeadlineDays: newDeadline, proposedPenaltyRate: newPenalty, message, at: new Date() })
    rfq.currentPrice = newPrice; rfq.currentQuantity = newQty
    rfq.currentFinancingMethod = newMethod; rfq.currentPaymentDeadlineDays = newDeadline
    rfq.currentPenaltyRate = newPenalty; rfq.lastMovedBy = moverRole
    rfq.lastMovedAt = new Date(); rfq.status = 'countered'
    await rfq.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'rfq.counter', entityType: 'RFQ', entityId: rfq._id, timestamp: new Date() }).catch(() => {})

    const notifyCompanyId = isBuyer ? rfq.supplierId : rfq.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({ userId: notifyUserId, type: 'rfq_countered', title: 'RFQ countered', message: `${company.name} sent a counter-offer`, entityType: 'rfq', entityId: rfq._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { rfq })
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// POST /api/rfqs/:id/accept
export const acceptRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
    if (!rfq) { sendError(res, 'RFQ not found', 404); return }

    if (!['pending', 'countered'].includes(rfq.status)) {
      sendError(res, `Cannot accept an RFQ with status '${rfq.status}'`, 400); return
    }

    if (new Date() > rfq.expiresAt) {
      rfq.status = 'expired'; await rfq.save()
      sendError(res, 'This RFQ has expired', 400); return
    }

    const isBuyer = rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) { sendError(res, 'You are not a party to this RFQ', 403); return }

    rfq.status = 'accepted'
    await rfq.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'rfq.accept', entityType: 'RFQ', entityId: rfq._id, timestamp: new Date() }).catch(() => {})

    const notifyCompanyId = isBuyer ? rfq.supplierId : rfq.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({ userId: notifyUserId, type: 'rfq_accepted', title: 'RFQ accepted', message: `${company.name} accepted the RFQ.${isBuyer ? ' Proceed to create a Purchase Order.' : ' Waiting for buyer to create a Purchase Order.'}`, entityType: 'rfq', entityId: rfq._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, { rfq }, isBuyer ? 'RFQ accepted. Proceed to create a Purchase Order.' : 'RFQ accepted. Waiting for buyer to create a Purchase Order.')
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// POST /api/rfqs/:id/decline
export const declineRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
    if (!rfq) { sendError(res, 'RFQ not found', 404); return }
    if (!['pending', 'countered'].includes(rfq.status)) { sendError(res, `Cannot decline an RFQ with status '${rfq.status}'`, 400); return }

    const isBuyer = rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) { sendError(res, 'You are not a party to this RFQ', 403); return }

    rfq.status = 'declined'
    await rfq.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'rfq.decline', entityType: 'RFQ', entityId: rfq._id, timestamp: new Date() }).catch(() => {})

    const notifyCompanyId = isBuyer ? rfq.supplierId : rfq.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({ userId: notifyUserId, type: 'rfq_declined', title: 'RFQ declined', message: `${company.name} declined the RFQ.`, entityType: 'rfq', entityId: rfq._id, isRead: false }).catch(() => {})
    }

    sendSuccess(res, null, 'RFQ declined')
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/rfqs/:id
export const getRFQById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
      .populate('productId', 'name images category basePrice priceUnit')
      .populate('buyerId', 'name logo type trustBadge isVerified')
      .populate('supplierId', 'name logo type trustBadge isVerified')

    if (!rfq) { sendError(res, 'RFQ not found', 404); return }

    const isBuyer = rfq.buyerId._id?.toString() === company._id.toString() || rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId._id?.toString() === company._id.toString() || rfq.supplierId.toString() === company._id.toString()
    if (!isBuyer && !isSupplier) { sendError(res, 'You are not a party to this RFQ', 403); return }

    sendSuccess(res, { rfq })
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}

// GET /api/rfqs
export const listRFQs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await requireUserCompany(req.user!.userId)

    const { role, status, lastId, cursor, limit = '20' } = req.query
    const filter: Record<string, unknown> = { isDeleted: false }

    if (role === 'buyer') filter.buyerId = company._id
    else if (role === 'supplier') filter.supplierId = company._id
    else filter.$or = [{ buyerId: company._id }, { supplierId: company._id }]

    if (status) filter.status = status
    const resolvedCursor = (lastId ?? cursor) as string | undefined
    if (resolvedCursor) filter._id = { $gt: new Types.ObjectId(resolvedCursor) }

    const pageLimit = Math.min(parseInt(limit as string), 50)
    const rfqs = await RFQ.find(filter)
      .populate('productId', 'name images category')
      .populate('buyerId', 'name logo')
      .populate('supplierId', 'name logo')
      .sort({ updatedAt: -1 })
      .limit(pageLimit)

    sendPaginated(res, rfqs, rfqs.length === pageLimit ? rfqs[rfqs.length - 1]._id.toString() : null)
  } catch (err) {
    if (err instanceof CompanyRequiredError) { sendError(res, err.message, err.statusCode); return }
    sendError(res, 'Server error', 500)
  }
}