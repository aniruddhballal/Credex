import mongoose, { Document, Schema, Types } from 'mongoose'

export type PaymentMethod =
  | 'upi'
  | 'neft'
  | 'rtgs'
  | 'imps'
  | 'cheque'
  | 'cash'
  | 'bank_transfer'
  | 'other'

export interface IPayment extends Document {
  purchaseOrderId: Types.ObjectId
  buyerId: Types.ObjectId
  supplierId: Types.ObjectId
  recordedBy: Types.ObjectId

  amount: number
  currency: string
  method: PaymentMethod

  // Reference details
  referenceNumber?: string      // UPI ref, NEFT UTR, cheque no etc.
  paidAt: Date
  note?: string

  // Immutable — never updated after creation
  createdAt: Date
  updatedAt: Date
}

const PaymentSchema = new Schema<IPayment>(
  {
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },
    method: {
      type: String,
      required: true,
      enum: ['upi', 'neft', 'rtgs', 'imps', 'cheque', 'cash', 'bank_transfer', 'other'],
    },

    referenceNumber: { type: String },
    paidAt: { type: Date, required: true },
    note: { type: String },
  },
  {
    timestamps: true,
    // Prevent updates — payments are immutable
  }
)

PaymentSchema.index({ purchaseOrderId: 1 })
PaymentSchema.index({ buyerId: 1 })
PaymentSchema.index({ supplierId: 1 })
PaymentSchema.index({ paidAt: 1 })

export default mongoose.model<IPayment>('Payment', PaymentSchema)