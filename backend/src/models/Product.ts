import mongoose, { Document, Schema, Types } from 'mongoose'

export type FinancingMethod =
  | 'immediate'
  | 'deferred_30'
  | 'deferred_60'
  | 'deferred_90'
  | 'installment'
  | 'loan'
  | 'lease'
  | 'rent'
  | 'equity'
  | 'open_to_discuss'

export interface IProduct extends Document {
  supplierId: Types.ObjectId
  postedBy: Types.ObjectId
  name: string
  description?: string
  category: string
  tags?: string[]
  images: string[]
  basePrice: number
  priceUnit: string
  currency: string
  isNegotiable: boolean
  isAvailable: boolean
  stockQuantity?: number
  acceptedFinancingMethods: FinancingMethod[]
  defaultPenaltyRate: number
  defaultPaymentDeadlineDays: number
  averageRating: number
  totalReviews: number
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: Types.ObjectId
  lastPurchasedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const ProductSchema = new Schema<IProduct>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    category: { type: String, required: true },
    tags: [{ type: String }],
    images: [{ type: String }],
    basePrice: { type: Number, required: true, min: 0 },
    priceUnit: { type: String, required: true, default: 'per_unit' },
    currency: { type: String, default: 'INR' },
    isNegotiable: { type: Boolean, default: true },
    isAvailable: { type: Boolean, default: true },
    stockQuantity: { type: Number },
    acceptedFinancingMethods: [
      {
        type: String,
        enum: [
          'immediate', 'deferred_30', 'deferred_60', 'deferred_90',
          'installment', 'loan', 'lease', 'rent', 'equity', 'open_to_discuss',
        ],
      },
    ],
    defaultPenaltyRate: { type: Number, default: 0.05, min: 0 },
    defaultPaymentDeadlineDays: { type: Number, default: 30, min: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastPurchasedAt: { type: Date },
  },
  { timestamps: true }
)

ProductSchema.index({ supplierId: 1 })
ProductSchema.index({ category: 1 })
ProductSchema.index({ isAvailable: 1, isDeleted: 1 })
ProductSchema.index({ averageRating: 1 })
ProductSchema.index({ basePrice: 1 })
ProductSchema.index({ name: 'text', description: 'text' })

export default mongoose.model<IProduct>('Product', ProductSchema)