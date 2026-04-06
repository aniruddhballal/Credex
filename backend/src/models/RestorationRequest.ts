import mongoose, { Document, Schema, Types } from 'mongoose'

export type RestorableEntity = 'loan_application' | 'user' | 'company' | 'product' | 'purchase_order'

export interface IRestorationRequest extends Document {
  entityType: RestorableEntity
  entityId: Types.ObjectId
  requestedBy: Types.ObjectId
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: Types.ObjectId
  reviewedAt?: Date
  reviewNote?: string
  createdAt: Date
  updatedAt: Date
}

const RestorationRequestSchema = new Schema<IRestorationRequest>(
  {
    entityType: {
      type: String,
      required: true,
      enum: ['loan_application', 'user', 'company', 'product', 'purchase_order'],
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, minlength: 10 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
  },
  { timestamps: true }
)

RestorationRequestSchema.index({ entityType: 1, entityId: 1 })
RestorationRequestSchema.index({ requestedBy: 1 })
RestorationRequestSchema.index({ status: 1 })
RestorationRequestSchema.index({ status: 1, createdAt: -1 })
// Prevent duplicate pending requests for the same entity
RestorationRequestSchema.index(
  { entityId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
)

export default mongoose.model<IRestorationRequest>('RestorationRequest', RestorationRequestSchema)