import mongoose, { Document, Schema, Types } from 'mongoose'
import { FinancingMethod } from './Product'

export type POStatus =
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed'

export type PaymentStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'overdue'

export type FulfilmentStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'completed'

export interface IStatusHistoryEntry {
  status: string
  changedBy: Types.ObjectId
  changedAt: Date
  note?: string
}

export interface IPurchaseOrder extends Document {
  rfqId: Types.ObjectId
  buyerId: Types.ObjectId
  supplierId: Types.ObjectId
  productId: Types.ObjectId
  buyerUserId: Types.ObjectId

  // Agreed terms (locked at PO creation — immutable after)
  quantity: number
  unitPrice: number
  totalPrice: number
  currency: string
  financingMethod: FinancingMethod
  paymentDeadline: Date
  penaltyRate: number

  // Linked loan (optional)
  loanApplicationId?: Types.ObjectId

  // Payment tracking
  amountPaid: number
  amountRemaining: number
  paymentStatus: PaymentStatus

  // Fulfilment
  fulfilmentStatus: FulfilmentStatus

  // PO lifecycle
  status: POStatus
  statusHistory: IStatusHistoryEntry[]

  // Review flags
  buyerReviewed: boolean
  supplierReviewed: boolean

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

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    rfqId: { type: Schema.Types.ObjectId, ref: 'RFQ', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    buyerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    financingMethod: { type: String, required: true },
    paymentDeadline: { type: Date, required: true },
    penaltyRate: { type: Number, required: true },

    loanApplicationId: { type: Schema.Types.ObjectId, ref: 'LoanApplication' },

    amountPaid: { type: Number, default: 0, min: 0 },
    amountRemaining: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid', 'overdue'],
      default: 'unpaid',
    },

    fulfilmentStatus: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'completed'],
      default: 'pending',
    },

    status: {
      type: String,
      enum: ['confirmed', 'in_progress', 'completed', 'cancelled', 'disputed'],
      default: 'confirmed',
    },
    statusHistory: [StatusHistorySchema],

    buyerReviewed: { type: Boolean, default: false },
    supplierReviewed: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletionReason: { type: String },
  },
  { timestamps: true }
)

PurchaseOrderSchema.index({ buyerId: 1 })
PurchaseOrderSchema.index({ supplierId: 1 })
PurchaseOrderSchema.index({ rfqId: 1 })
PurchaseOrderSchema.index({ productId: 1 })
PurchaseOrderSchema.index({ status: 1 })
PurchaseOrderSchema.index({ paymentStatus: 1 })
PurchaseOrderSchema.index({ paymentDeadline: 1 })
PurchaseOrderSchema.index({ buyerId: 1, paymentStatus: 1 })
PurchaseOrderSchema.index({ supplierId: 1, status: 1 })
PurchaseOrderSchema.index({ isDeleted: 1 })

export default mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema)