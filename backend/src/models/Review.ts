import mongoose, { Document, Schema, Types } from 'mongoose'

export type ReviewType = 'buyer_to_supplier' | 'supplier_to_buyer' | 'buyer_to_product'

export interface IReview extends Document {
  purchaseOrderId: Types.ObjectId
  reviewerId: Types.ObjectId         // User who wrote the review
  reviewerCompanyId: Types.ObjectId  // Company of reviewer
  targetCompanyId?: Types.ObjectId   // For buyer_to_supplier / supplier_to_buyer
  targetProductId?: Types.ObjectId   // For buyer_to_product
  reviewType: ReviewType
  rating: number                     // 1–5
  comment?: string
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ReviewSchema = new Schema<IReview>(
  {
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerCompanyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    targetCompanyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    targetProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
    reviewType: {
      type: String,
      enum: ['buyer_to_supplier', 'supplier_to_buyer', 'buyer_to_product'],
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

// One review per type per PO — enforced by compound unique index
ReviewSchema.index(
  { purchaseOrderId: 1, reviewType: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
)
ReviewSchema.index({ targetCompanyId: 1 })
ReviewSchema.index({ targetProductId: 1 })
ReviewSchema.index({ reviewerId: 1 })

export default mongoose.model<IReview>('Review', ReviewSchema)