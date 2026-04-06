import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IScoreBreakdown {
  paymentHistory: number       // 0-100
  outstandingDebt: number      // 0-100
  creditUtilization: number    // 0-100
  tradeActivity: number        // 0-100
  reviews: number              // 0-100
}

export interface ICreditScore extends Document {
  companyId: Types.ObjectId
  score: number                // 300–900
  breakdown: IScoreBreakdown
  computedAt: Date
  computedBy: 'system' | 'manual'
  note?: string
  createdAt: Date
  updatedAt: Date
}

const CreditScoreSchema = new Schema<ICreditScore>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    score: { type: Number, required: true, min: 300, max: 900 },
    breakdown: {
      paymentHistory: { type: Number, required: true },
      outstandingDebt: { type: Number, required: true },
      creditUtilization: { type: Number, required: true },
      tradeActivity: { type: Number, required: true },
      reviews: { type: Number, required: true },
    },
    computedAt: { type: Date, default: Date.now },
    computedBy: { type: String, enum: ['system', 'manual'], default: 'system' },
    note: { type: String },
  },
  { timestamps: true }
)

CreditScoreSchema.index({ companyId: 1 })
CreditScoreSchema.index({ companyId: 1, computedAt: -1 })

export default mongoose.model<ICreditScore>('CreditScore', CreditScoreSchema)