import mongoose, { Document, Schema, Types } from 'mongoose'

export type LoanStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'documents_requested'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'closed'

export interface IStatusHistoryEntry {
  status: LoanStatus
  changedBy: Types.ObjectId
  changedAt: Date
  note?: string
}

export interface ILoanApplication extends Document {
  companyId: Types.ObjectId
  applicantUserId: Types.ObjectId
  loanTypeId: Types.ObjectId
  purchaseOrderId?: Types.ObjectId       // optional — loan tied to a PO

  // Application details
  requestedAmount: number
  requestedTenureMonths: number
  purpose: string

  // Underwriter assignment
  assignedUnderwriterId?: Types.ObjectId

  // Decision
  status: LoanStatus
  statusHistory: IStatusHistoryEntry[]

  approvedAmount?: number
  approvedInterestRate?: number
  approvedTenureMonths?: number
  disbursedAt?: Date
  rejectionReason?: string

  // Repayment tracking (V1 — simplified)
  totalRepaid: number
  nextEmiDate?: Date
  emiAmount?: number

  // Credit score snapshot at time of application
  creditScoreAtApplication?: number

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: Types.ObjectId
  deletionReason?: string

  createdAt: Date
  updatedAt: Date
}

const StatusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false }
)

const LoanApplicationSchema = new Schema<ILoanApplication>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    applicantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    loanTypeId: { type: Schema.Types.ObjectId, ref: 'LoanType', required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },

    requestedAmount: { type: Number, required: true, min: 1 },
    requestedTenureMonths: { type: Number, required: true, min: 1 },
    purpose: { type: String, required: true },

    assignedUnderwriterId: { type: Schema.Types.ObjectId, ref: 'User' },

    status: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'documents_requested', 'approved', 'rejected', 'disbursed', 'closed'],
      default: 'draft',
    },
    statusHistory: [StatusHistorySchema],

    approvedAmount: { type: Number },
    approvedInterestRate: { type: Number },
    approvedTenureMonths: { type: Number },
    disbursedAt: { type: Date },
    rejectionReason: { type: String },

    totalRepaid: { type: Number, default: 0 },
    nextEmiDate: { type: Date },
    emiAmount: { type: Number },

    creditScoreAtApplication: { type: Number },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletionReason: { type: String },
  },
  { timestamps: true }
)

LoanApplicationSchema.index({ companyId: 1 })
LoanApplicationSchema.index({ applicantUserId: 1 })
LoanApplicationSchema.index({ status: 1 })
LoanApplicationSchema.index({ assignedUnderwriterId: 1 })
LoanApplicationSchema.index({ purchaseOrderId: 1 })
LoanApplicationSchema.index({ isDeleted: 1 })
LoanApplicationSchema.index({ companyId: 1, status: 1 })

export default mongoose.model<ILoanApplication>('LoanApplication', LoanApplicationSchema)