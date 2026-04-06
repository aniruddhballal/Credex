import { Request, Response } from 'express'
import { Types } from 'mongoose'
import multer from 'multer'
import DocumentModel from '../models/Document'
import DocumentAccessLog from '../models/DocumentAccessLog'
import LoanApplication from '../models/LoanApplication'
import User from '../models/User'
import Company from '../models/Company'
import AuditLog from '../models/AuditLog'
import { uploadDocument, getSignedDocumentUrl } from '../services/b2'
import { AuthRequest } from '../middleware/auth'

// Multer — memory buffer, no disk writes
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('File type not allowed. Accepted: PDF, JPG, PNG, WEBP, DOC, DOCX'))
    }
  },
})

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

// POST /api/documents
// Multipart upload: field name = 'document'
export const uploadDocumentHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No company linked to account' })
      return
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' })
      return
    }

    const { loanApplicationId, documentType } = req.body

    if (!loanApplicationId || !documentType) {
      res.status(400).json({ success: false, message: 'loanApplicationId and documentType are required' })
      return
    }

    // Verify loan belongs to this company
    const loan = await LoanApplication.findOne({
      _id: loanApplicationId,
      companyId: company._id,
      isDeleted: false,
    })
    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan application not found or not yours' })
      return
    }

    const { b2Key, bucket } = await uploadDocument(
      req.file.buffer,
      company._id.toString(),
      loanApplicationId,
      req.file.originalname,
      req.file.mimetype
    )

    const doc = await DocumentModel.create({
      uploadedBy: new Types.ObjectId(req.user!.userId),
      companyId: company._id,
      loanApplicationId: new Types.ObjectId(loanApplicationId),
      documentType,
      originalFileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      s3Key: b2Key,
      s3Bucket: bucket,
      status: 'uploaded',
      isDeleted: false,
    })

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'document.upload',
      entityType: 'Document',
      entityId: doc._id,
      note: `Uploaded '${doc.originalFileName}' for loan ${loanApplicationId}`,
      timestamp: new Date(),
    }).catch(() => {})

    // Return doc metadata — never return s3Key to client
    res.status(201).json({
      success: true,
      document: {
        _id: doc._id,
        documentType: doc.documentType,
        originalFileName: doc.originalFileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        status: doc.status,
        createdAt: doc.createdAt,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    res.status(500).json({ success: false, message })
  }
}

// GET /api/documents/:id/url
// Generates a signed 15-min expiring URL — logs every access
export const getDocumentUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    const isUnderwriter = ['underwriter', 'system_admin'].includes(req.user!.role)
    const { company } = await getUserCompany(req.user!.userId)

    const isOwner = company && doc.companyId.toString() === company._id.toString()

    if (!isUnderwriter && !isOwner) {
      res.status(403).json({ success: false, message: 'Access denied' })
      return
    }

    const signedUrl = await getSignedDocumentUrl(doc.s3Key)

    // Log every access — immutable record
    DocumentAccessLog.create({
      documentId: doc._id,
      accessedBy: new Types.ObjectId(req.user!.userId),
      accessedByRole: req.user!.role,
      ipAddress: getIp(req),
      userAgent: req.headers['user-agent'],
      accessedAt: new Date(),
    }).catch(() => {})

    res.json({
      success: true,
      url: signedUrl,
      expiresInSeconds: 900, // 15 min
    })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// GET /api/documents?loanApplicationId=...
export const listDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanApplicationId } = req.query

    if (!loanApplicationId) {
      res.status(400).json({ success: false, message: 'loanApplicationId is required' })
      return
    }

    const isUnderwriter = ['underwriter', 'system_admin'].includes(req.user!.role)
    const { company } = await getUserCompany(req.user!.userId)

    // Non-underwriters can only see their own company's docs
    const filter: Record<string, unknown> = {
      loanApplicationId: new Types.ObjectId(loanApplicationId as string),
      isDeleted: false,
    }

    if (!isUnderwriter) {
      if (!company) {
        res.status(403).json({ success: false, message: 'No company linked to account' })
        return
      }
      filter.companyId = company._id
    }

    const docs = await DocumentModel.find(filter)
      .select('-s3Key -s3Bucket') // never expose storage keys
      .sort({ createdAt: -1 })

    res.json({ success: true, documents: docs })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/documents/:id/accept
export const acceptDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) {
      res.status(403).json({ success: false, message: 'Only underwriters can review documents' })
      return
    }

    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    const before = doc.status
    doc.status = 'accepted'
    doc.reviewedBy = new Types.ObjectId(req.user!.userId)
    doc.reviewedAt = new Date()
    await doc.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'document.accept',
      entityType: 'Document',
      entityId: doc._id,
      changes: { status: { before, after: 'accepted' } },
      timestamp: new Date(),
    }).catch(() => {})

    res.json({ success: true, document: { _id: doc._id, status: doc.status } })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// PATCH /api/documents/:id/reject
export const rejectDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['underwriter', 'system_admin'].includes(req.user!.role)) {
      res.status(403).json({ success: false, message: 'Only underwriters can review documents' })
      return
    }

    const { reason } = req.body
    if (!reason) {
      res.status(400).json({ success: false, message: 'Rejection reason is required' })
      return
    }

    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    const before = doc.status
    doc.status = 'rejected'
    doc.rejectionReason = reason
    doc.reviewedBy = new Types.ObjectId(req.user!.userId)
    doc.reviewedAt = new Date()
    await doc.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'document.reject',
      entityType: 'Document',
      entityId: doc._id,
      changes: { status: { before, after: 'rejected' } },
      note: reason,
      timestamp: new Date(),
    }).catch(() => {})

    res.json({ success: true, document: { _id: doc._id, status: doc.status, rejectionReason: doc.rejectionReason } })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// DELETE /api/documents/:id (soft delete)
export const deleteDocumentHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await DocumentModel.findOne({ _id: req.params.id, isDeleted: false })
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    const { company } = await getUserCompany(req.user!.userId)
    const isOwner = company && doc.companyId.toString() === company._id.toString()
    const isAdmin = req.user!.role === 'system_admin'

    if (!isOwner && !isAdmin) {
      res.status(403).json({ success: false, message: 'You cannot delete this document' })
      return
    }

    doc.isDeleted = true
    doc.deletedAt = new Date()
    doc.deletedBy = new Types.ObjectId(req.user!.userId)
    await doc.save()

    AuditLog.create({
      performedBy: new Types.ObjectId(req.user!.userId),
      performedByRole: req.user!.role,
      ipAddress: getIp(req),
      action: 'document.delete',
      entityType: 'Document',
      entityId: doc._id,
      note: `Soft-deleted '${doc.originalFileName}'`,
      timestamp: new Date(),
    }).catch(() => {})

    res.json({ success: true, message: 'Document deleted' })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}