import mongoose, { Document, Schema } from 'mongoose'

export interface ILoanType extends Document {
  name: string
  code: string
  description?: string
  minAmount: number
  maxAmount: number
  minTenureMonths: number
  maxTenureMonths: number
  baseInterestRate: number        // % per annum
  processingFeePercent: number    // % of loan amount
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const LoanTypeSchema = new Schema<ILoanType>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String },
    minAmount: { type: Number, required: true, min: 0 },
    maxAmount: { type: Number, required: true },
    minTenureMonths: { type: Number, required: true, min: 1 },
    maxTenureMonths: { type: Number, required: true },
    baseInterestRate: { type: Number, required: true, min: 0 },
    processingFeePercent: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

LoanTypeSchema.index({ code: 1 }, { unique: true })
LoanTypeSchema.index({ isActive: 1 })

export default mongoose.model<ILoanType>('LoanType', LoanTypeSchema)