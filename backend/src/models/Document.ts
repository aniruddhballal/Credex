import mongoose, { Document as MongoDocument, Schema, Types } from 'mongoose'

export type DocumentType =
  | 'gstin_certificate'
  | 'pan'
  | 'incorporation_certificate'
  | 'bank_statements'
  | 'itr'
  | 'audited_financials'
  | 'udyam_certificate'
  | 'address_proof'
  | 'photo'
  | 'other'

export type DocumentStatus = 'uploaded' | 'under_review' | 'accepted' | 'rejected'

export interface IDocument extends MongoDocument {
  uploadedBy: Types.ObjectId
  companyId: Types.ObjectId
  loanApplicationId: Types.ObjectId

  documentType: DocumentType
  originalFileName: string
  fileSize: number
  mimeType: string

  // Storage — field names kept as s3Key/s3Bucket for schema compatibility
  // Values are B2 keys/bucket names (S3-compatible)
  s3Key: string
  s3Bucket: string

  status: DocumentStatus
  rejectionReason?: string
  reviewedBy?: Types.ObjectId
  reviewedAt?: Date

  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: Types.ObjectId

  createdAt: Date
  updatedAt: Date
}

const DocumentSchema = new Schema<IDocument>(
  {
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    loanApplicationId: { type: Schema.Types.ObjectId, ref: 'LoanApplication', required: true },

    documentType: {
      type: String,
      required: true,
      enum: [
        'gstin_certificate', 'pan', 'incorporation_certificate',
        'bank_statements', 'itr', 'audited_financials',
        'udyam_certificate', 'address_proof', 'photo', 'other',
      ],
    },
    originalFileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },

    s3Key: { type: String, required: true },
    s3Bucket: { type: String, required: true },

    status: {
      type: String,
      enum: ['uploaded', 'under_review', 'accepted', 'rejected'],
      default: 'uploaded',
    },
    rejectionReason: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

DocumentSchema.index({ loanApplicationId: 1 })
DocumentSchema.index({ companyId: 1 })
DocumentSchema.index({ uploadedBy: 1 })
DocumentSchema.index({ documentType: 1 })
DocumentSchema.index({ status: 1 })
DocumentSchema.index({ isDeleted: 1 })

export default mongoose.model<IDocument>('Document', DocumentSchema)