import { Request, Response, NextFunction } from 'express'
import { Types } from 'mongoose'
import multer from 'multer'
import DocumentModel from '../models/Document'
import DocumentAccessLog from '../models/DocumentAccessLog'
import LoanApplication from '../models/LoanApplication'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import { uploadDocument, getSignedDocumentUrl } from '../services/b2'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('File type not allowed. Accepted: PDF, JPG, PNG, WEBP, DOC, DOCX'))
  },
})

const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
  req.socket.remoteAddress || 'unknown'

const getUserCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return { user: null, company: null }
  const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
  return { user, company }
}

// POST /api/documents
export const uploadDocumentHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) { sendError(res, 'No company linked to account', 403); return }
    if (!req.file) { sendError(res, 'No file uploaded', 400); return }

    const { loanApplicationId, documentType } = req.body
    if (!loanApplicationId || !documentType) { sendError(res, 'loanApplicationId and documentType are required', 400); return }

    const loan = await LoanApplication.findOne({ _id: loanApplicationId, companyId: company._id, isDeleted: false })
    if (!loan) { sendError(res, 'Loan application not found or not yours', 404); return }

    const { b2Key, bucket } = await uploadDocument(req.file.buffer, company._id.toString(), loanApplicationId, req.file.originalname, req.file.mimetype)

    const doc = await DocumentModel.create({
      uploadedBy: new Types.ObjectId(req.user!.userId), companyId: company._id,
      loanApplicationId: new Types.ObjectId(loanApplicationId),
      documentType, originalFileName: req.file.originalname,
      fileSize: req.file.size, mimeType: req.file.mimetype,
      s3Key: b2Key, s3Bucket: bucket, status: 'uploaded', isDeleted: false,
    })

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'document.upload', entityType: 'Document', entityId: doc._id, note: `Uploaded '${doc.originalFileName}'`, timestamp: new Date() }).catch(() => {})

    sendSuccess(res, {
      document: { _id: doc._id, documentType: doc.documentType, originalFileName: doc.originalFileName, fileSize: doc.fileSize, mimeType: doc.mimeType, status: doc.status, createdAt: doc.createdAt },
    }, undefined, 201)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    sendError(res, message, 500)
  }
}

// GET /api/documents/:id/url — FIX 4: return both url and signedUrl fields
export const getDocumentUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) { sendError(res, 'Document not found', 404); return }

    const isUnderwriter = ['underwriter', 'system_admin'].includes(req.user!.role)
    const { company } = await getUserCompany(req.user!.userId)
    const isOwner = company && doc.companyId.toString() === company._id.toString()

    if (!isUnderwriter && !isOwner) { sendError(res, 'Access denied', 403); return }

    const signedUrl = await getSignedDocumentUrl(doc.s3Key)

    DocumentAccessLog.create({
      documentId: doc._id, accessedBy: new Types.ObjectId(req.user!.userId),
      accessedByRole: req.user!.role, ipAddress: getIp(req),
      userAgent: req.headers['user-agent'], accessedAt: new Date(),
    }).catch(() => {})

    sendSuccess(res, {
      url: signedUrl,         // FIX 4 — frontend expects this field name
      signedUrl: signedUrl,   // keep for backward compat
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      expiresInSeconds: 900,
    })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// GET /api/documents
export const listDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanApplicationId } = req.query
    if (!loanApplicationId) { sendError(res, 'loanApplicationId is required', 400); return }

    const isUnderwriter = ['underwriter', 'system_admin'].includes(req.user!.role)
    const { company } = await getUserCompany(req.user!.userId)

    const filter: Record<string, unknown> = { loanApplicationId: new Types.ObjectId(loanApplicationId as string), isDeleted: false }
    if (!isUnderwriter) {
      if (!company) { sendError(res, 'No company linked to account', 403); return }
      filter.companyId = company._id
    }

    const docs = await DocumentModel.find(filter).select('-s3Key -s3Bucket').sort({ createdAt: -1 })
    sendSuccess(res, { documents: docs })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/documents/:id/accept
export const acceptDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) { sendError(res, 'Only underwriters can review documents', 403); return }
    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) { sendError(res, 'Document not found', 404); return }

    const before = doc.status
    doc.status = 'accepted'
    doc.reviewedBy = new Types.ObjectId(req.user!.userId)
    doc.reviewedAt = new Date()
    await doc.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'document.accept', entityType: 'Document', entityId: doc._id, changes: { status: { before, after: 'accepted' } }, timestamp: new Date() }).catch(() => {})

    sendSuccess(res, { document: { _id: doc._id, status: doc.status } })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// PATCH /api/documents/:id/reject
export const rejectDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) { sendError(res, 'Only underwriters can review documents', 403); return }
    const { reason } = req.body
    if (!reason) { sendError(res, 'Rejection reason is required', 400); return }

    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) { sendError(res, 'Document not found', 404); return }

    const before = doc.status
    doc.status = 'rejected'
    doc.rejectionReason = reason
    doc.reviewedBy = new Types.ObjectId(req.user!.userId)
    doc.reviewedAt = new Date()
    await doc.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'document.reject', entityType: 'Document', entityId: doc._id, changes: { status: { before, after: 'rejected' } }, note: reason, timestamp: new Date() }).catch(() => {})

    sendSuccess(res, { document: { _id: doc._id, status: doc.status, rejectionReason: doc.rejectionReason } })
  } catch {
    sendError(res, 'Server error', 500)
  }
}

// DELETE /api/documents/:id
export const deleteDocumentHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) { sendError(res, 'Document not found', 404); return }

    const { company } = await getUserCompany(req.user!.userId)
    const isOwner = company && doc.companyId.toString() === company._id.toString()
    const isAdmin = req.user!.role === 'system_admin'
    if (!isOwner && !isAdmin) { sendError(res, 'You cannot delete this document', 403); return }

    doc.isDeleted = true
    doc.deletedAt = new Date()
    doc.deletedBy = new Types.ObjectId(req.user!.userId)
    await doc.save()

    AuditLog.create({ performedBy: new Types.ObjectId(req.user!.userId), performedByRole: req.user!.role, ipAddress: getIp(req), action: 'document.delete', entityType: 'Document', entityId: doc._id, note: `Soft-deleted '${doc.originalFileName}'`, timestamp: new Date() }).catch(() => {})

    sendSuccess(res, null, 'Document deleted')
  } catch {
    sendError(res, 'Server error', 500)
  }
}