import { Request, Response } from 'express'
import { Types } from 'mongoose'
import RFQ from '../models/RFQ'
import Product from '../models/Product'
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

// Find the user who owns a company (for notifications)
const getCompanyOwnerUserId = async (companyId: Types.ObjectId): Promise<Types.ObjectId | null> => {
  const company = await Company.findById(companyId)
  const owner = company?.members.find((m) => m.role === 'owner')
  return owner?.userId ?? null
}

// POST /api/rfqs
// Buyer creates an RFQ against a product
export const createRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { user, company: buyerCompany } = await getUserCompany(req.user!.userId)
    if (!buyerCompany || !['buyer', 'both'].includes(buyerCompany.type)) {
      res.status(403).json({ success: false, message: 'Only buyers can create RFQs' })
      return
    }

    const {
      productId, quantity, financingMethod,
      paymentDeadlineDays, penaltyRate, proposedPrice, message,
    } = req.body

    if (!productId || !quantity || !financingMethod) {
      res.status(400).json({ success: false, message: 'productId, quantity and financingMethod are required' })
      return
    }

    const product = await Product.findOne({ _id: productId, isDeleted: false, isAvailable: true })
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found or unavailable' })
      return
    }

    // Prevent buying from yourself
    if (product.supplierId.toString() === buyerCompany._id.toString()) {
      res.status(400).json({ success: false, message: 'You cannot create an RFQ for your own product' })
      return
    }

    const price = proposedPrice ?? product.basePrice
    const deadlineDays = paymentDeadlineDays ?? product.defaultPaymentDeadlineDays
    const penalty = penaltyRate ?? product.defaultPenaltyRate

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const historyEntry = {
      by: 'buyer' as const,
      byUserId: new Types.ObjectId(req.user!.userId),
      proposedPrice: price,
      proposedQuantity: quantity,
      proposedFinancingMethod: financingMethod,
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
      currentPrice: price,
      currentQuantity: quantity,
      currentFinancingMethod: financingMethod,
      currentPaymentDeadlineDays: deadlineDays,
      currentPenaltyRate: penalty,
      lastMovedBy: 'buyer',
      lastMovedAt: new Date(),
      status: 'pending',
      expiresAt,
      history: [historyEntry],
      note: message,
      isDeleted: false,
    })

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'rfq.create',
      entityType: 'RFQ',
      entityId: rfq._id,
      timestamp: new Date(),
    }).catch(() => { })

    // Notify supplier
    const supplierOwnerId = await getCompanyOwnerUserId(product.supplierId)
    if (supplierOwnerId) {
      Notification.create({
        userId: supplierOwnerId,
        type: 'rfq_received',
        title: 'New RFQ received',
        message: `${buyerCompany.name} sent an RFQ for ${product.name}`,
        entityType: 'rfq',
        entityId: rfq._id,
        isRead: false,
      }).catch(() => { })
    }

    res.status(201).json({ success: true, rfq })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/rfqs/:id/counter
// Either party counters with new terms
export const counterRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { user: authUser, company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
    if (!rfq) {
      res.status(404).json({ success: false, message: 'RFQ not found' })
      return
    }

    if (!['pending', 'countered'].includes(rfq.status)) {
      res.status(400).json({ success: false, message: `Cannot counter an RFQ with status '${rfq.status}'` })
      return
    }

    if (new Date() > rfq.expiresAt) {
      rfq.status = 'expired'
      await rfq.save()
      res.status(400).json({ success: false, message: 'This RFQ has expired' })
      return
    }

    // Determine who is countering
    const isBuyer = rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId.toString() === company._id.toString()

    if (!isBuyer && !isSupplier) {
      res.status(403).json({ success: false, message: 'You are not a party to this RFQ' })
      return
    }

    // Cannot counter your own last move
    const moverRole = isBuyer ? 'buyer' : 'supplier'
    if (rfq.lastMovedBy === moverRole) {
      res.status(400).json({ success: false, message: 'Waiting for the other party to respond' })
      return
    }

    const {
      proposedPrice, quantity, financingMethod,
      paymentDeadlineDays, penaltyRate, message,
    } = req.body

    const newPrice = proposedPrice ?? rfq.currentPrice
    const newQty = quantity ?? rfq.currentQuantity
    const newMethod = financingMethod ?? rfq.currentFinancingMethod
    const newDeadline = paymentDeadlineDays ?? rfq.currentPaymentDeadlineDays
    const newPenalty = penaltyRate ?? rfq.currentPenaltyRate

    const entry = {
      by: moverRole,
      byUserId: new Types.ObjectId(req.user!.userId),
      proposedPrice: newPrice,
      proposedQuantity: newQty,
      proposedFinancingMethod: newMethod,
      proposedPaymentDeadlineDays: newDeadline,
      proposedPenaltyRate: newPenalty,
      message,
      at: new Date(),
    }

    rfq.history.push(entry)
    rfq.currentPrice = newPrice
    rfq.currentQuantity = newQty
    rfq.currentFinancingMethod = newMethod
    rfq.currentPaymentDeadlineDays = newDeadline
    rfq.currentPenaltyRate = newPenalty
    rfq.lastMovedBy = moverRole
    rfq.lastMovedAt = new Date()
    rfq.status = 'countered'

    await rfq.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'rfq.counter',
      entityType: 'RFQ',
      entityId: rfq._id,
      timestamp: new Date(),
    }).catch(() => { })

    // Notify the other party
    const notifyCompanyId = isBuyer ? rfq.supplierId : rfq.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({
        userId: notifyUserId,
        type: 'rfq_countered',
        title: 'RFQ countered',
        message: `${company.name} sent a counter-offer on your RFQ`,
        entityType: 'rfq',
        entityId: rfq._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, rfq })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/rfqs/:id/accept
// Either party accepts the current terms → triggers PO creation
export const acceptRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
    if (!rfq) {
      res.status(404).json({ success: false, message: 'RFQ not found' })
      return
    }

    if (!['pending', 'countered'].includes(rfq.status)) {
      res.status(400).json({ success: false, message: `Cannot accept an RFQ with status '${rfq.status}'` })
      return
    }

    if (new Date() > rfq.expiresAt) {
      rfq.status = 'expired'
      await rfq.save()
      res.status(400).json({ success: false, message: 'This RFQ has expired' })
      return
    }

    const isBuyer = rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId.toString() === company._id.toString()

    if (!isBuyer && !isSupplier) {
      res.status(403).json({ success: false, message: 'You are not a party to this RFQ' })
      return
    }

    rfq.status = 'accepted'
    await rfq.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'rfq.accept',
      entityType: 'RFQ',
      entityId: rfq._id,
      timestamp: new Date(),
    }).catch(() => { })

    // Notify the other party
    const notifyCompanyId = isBuyer ? rfq.supplierId : rfq.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({
        userId: notifyUserId,
        type: 'rfq_accepted',
        title: 'RFQ accepted',
        message: `${company.name} accepted the RFQ. A Purchase Order will be created.`,
        entityType: 'rfq',
        entityId: rfq._id,
        isRead: false,
      }).catch(() => { })
    }

    // Return the accepted rfq — PO creation is a separate step (POST /api/purchase-orders)
    res.json({ success: true, rfq, message: 'RFQ accepted. Proceed to create a Purchase Order.' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// POST /api/rfqs/:id/decline
export const declineRFQ = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
    if (!rfq) {
      res.status(404).json({ success: false, message: 'RFQ not found' })
      return
    }

    if (!['pending', 'countered'].includes(rfq.status)) {
      res.status(400).json({ success: false, message: `Cannot decline an RFQ with status '${rfq.status}'` })
      return
    }

    const isBuyer = rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId.toString() === company._id.toString()

    if (!isBuyer && !isSupplier) {
      res.status(403).json({ success: false, message: 'You are not a party to this RFQ' })
      return
    }

    rfq.status = 'declined'
    await rfq.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'rfq.decline',
      entityType: 'RFQ',
      entityId: rfq._id,
      timestamp: new Date(),
    }).catch(() => { })

    const notifyCompanyId = isBuyer ? rfq.supplierId : rfq.buyerId
    const notifyUserId = await getCompanyOwnerUserId(notifyCompanyId)
    if (notifyUserId) {
      Notification.create({
        userId: notifyUserId,
        type: 'rfq_declined',
        title: 'RFQ declined',
        message: `${company.name} declined the RFQ.`,
        entityType: 'rfq',
        entityId: rfq._id,
        isRead: false,
      }).catch(() => { })
    }

    res.json({ success: true, message: 'RFQ declined' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/rfqs/:id
export const getRFQById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const rfq = await RFQ.findOne({ _id: req.params.id, isDeleted: false })
      .populate('productId', 'name images category basePrice priceUnit')
      .populate('buyerId', 'name logo isVerified trustBadge')
      .populate('supplierId', 'name logo isVerified trustBadge')

    if (!rfq) {
      res.status(404).json({ success: false, message: 'RFQ not found' })
      return
    }

    const isBuyer = rfq.buyerId._id?.toString() === company._id.toString() ||
      rfq.buyerId.toString() === company._id.toString()
    const isSupplier = rfq.supplierId._id?.toString() === company._id.toString() ||
      rfq.supplierId.toString() === company._id.toString()

    if (!isBuyer && !isSupplier) {
      res.status(403).json({ success: false, message: 'You are not a party to this RFQ' })
      return
    }

    res.json({ success: true, rfq })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/rfqs?role=buyer|supplier&status=pending&lastId=...
export const listRFQs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    const { role, status, lastId, limit = '20' } = req.query

    const filter: Record<string, unknown> = { isDeleted: false }

    if (role === 'buyer') filter.buyerId = company._id
    else if (role === 'supplier') filter.supplierId = company._id
    else filter.$or = [{ buyerId: company._id }, { supplierId: company._id }]

    if (status) filter.status = status
    if (lastId) filter._id = { $gt: new Types.ObjectId(lastId as string) }

    const pageLimit = Math.min(parseInt(limit as string), 50)

    const rfqs = await RFQ.find(filter)
      .populate('productId', 'name images category')
      .populate('buyerId', 'name logo')
      .populate('supplierId', 'name logo')
      .sort({ updatedAt: -1 })
      .limit(pageLimit)

    res.json({
      success: true,
      rfqs,
      nextCursor: rfqs.length === pageLimit ? rfqs[rfqs.length - 1]._id : null,
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}