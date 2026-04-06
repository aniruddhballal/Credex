import mongoose, { Document, Schema, Types } from 'mongoose'
import { FinancingMethod } from './Product'

export type RFQStatus =
  | 'pending'
  | 'countered'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'converted_to_po'

export interface INegotiationEntry {
  by: 'buyer' | 'supplier'
  byUserId: Types.ObjectId
  proposedPrice: number
  proposedQuantity: number
  proposedFinancingMethod: FinancingMethod
  proposedPaymentDeadlineDays: number
  proposedPenaltyRate: number
  message?: string
  at: Date
}

export interface IRFQ extends Document {
  buyerId: Types.ObjectId
  supplierId: Types.ObjectId
  productId: Types.ObjectId
  buyerUserId: Types.ObjectId

  // Current proposed terms (always reflects latest)
  currentPrice: number
  currentQuantity: number
  currentFinancingMethod: FinancingMethod
  currentPaymentDeadlineDays: number
  currentPenaltyRate: number

  // Who made the last move
  lastMovedBy: 'buyer' | 'supplier'
  lastMovedAt: Date

  status: RFQStatus
  expiresAt: Date

  // Full negotiation history
  history: INegotiationEntry[]

  note?: string

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: Types.ObjectId

  createdAt: Date
  updatedAt: Date
}

const NegotiationEntrySchema = new Schema<INegotiationEntry>(
  {
    by: { type: String, enum: ['buyer', 'supplier'], required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    proposedPrice: { type: Number, required: true },
    proposedQuantity: { type: Number, required: true },
    proposedFinancingMethod: { type: String, required: true },
    proposedPaymentDeadlineDays: { type: Number, required: true },
    proposedPenaltyRate: { type: Number, required: true },
    message: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

const RFQSchema = new Schema<IRFQ>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    buyerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    currentPrice: { type: Number, required: true },
    currentQuantity: { type: Number, required: true, min: 1 },
    currentFinancingMethod: { type: String, required: true },
    currentPaymentDeadlineDays: { type: Number, required: true },
    currentPenaltyRate: { type: Number, required: true },

    lastMovedBy: { type: String, enum: ['buyer', 'supplier'], required: true },
    lastMovedAt: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ['pending', 'countered', 'accepted', 'declined', 'expired', 'converted_to_po'],
      default: 'pending',
    },
    expiresAt: { type: Date, required: true },

    history: [NegotiationEntrySchema],

    note: { type: String },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

RFQSchema.index({ buyerId: 1 })
RFQSchema.index({ supplierId: 1 })
RFQSchema.index({ productId: 1 })
RFQSchema.index({ status: 1 })
RFQSchema.index({ buyerId: 1, status: 1 })
RFQSchema.index({ supplierId: 1, status: 1 })
RFQSchema.index({ expiresAt: 1 })

export default mongoose.model<IRFQ>('RFQ', RFQSchema)