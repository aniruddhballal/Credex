import mongoose, { Document, Schema, Types } from 'mongoose'

export interface ICompany extends Document {
  name: string
  legalName?: string
  type: 'buyer' | 'supplier' | 'both'
  description?: string
  logo?: string
  website?: string
  email: string
  phone?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  country: string
  gstin?: string
  pan?: string
  cin?: string
  udyamNumber?: string
  isVerified: boolean
  verifiedAt?: Date
  verifiedBy?: Types.ObjectId
  trustBadge: 'none' | 'silver' | 'gold' | 'platinum'
  trustBadgeUpdatedAt?: Date
  creditScoreRef?: Types.ObjectId
  members: {
    userId: Types.ObjectId
    role: 'owner' | 'member'
    addedAt: Date
  }[]
  industry?: string
  tags?: string[]
  averageRating: number
  totalReviews: number
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: Types.ObjectId
  deletionReason?: string
  createdAt: Date
  updatedAt: Date
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    type: { type: String, enum: ['buyer', 'supplier', 'both'], required: true },
    description: { type: String },
    logo: { type: String },
    website: { type: String },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    country: { type: String, default: 'India' },
    gstin: { type: String, uppercase: true, trim: true },
    pan: { type: String, uppercase: true, trim: true },
    cin: { type: String },
    udyamNumber: { type: String },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    trustBadge: { type: String, enum: ['none', 'silver', 'gold', 'platinum'], default: 'none' },
    trustBadgeUpdatedAt: { type: Date },
    creditScoreRef: { type: Schema.Types.ObjectId, ref: 'CreditScore' },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['owner', 'member'], default: 'owner' },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    industry: { type: String },
    tags: [{ type: String }],
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletionReason: { type: String },
  },
  { timestamps: true }
)

CompanySchema.index({ gstin: 1 }, { unique: true, sparse: true })
CompanySchema.index({ pan: 1 }, { unique: true, sparse: true })
CompanySchema.index({ type: 1 })
CompanySchema.index({ isVerified: 1 })
CompanySchema.index({ isDeleted: 1 })
CompanySchema.index({ city: 1, state: 1 })
CompanySchema.index({ name: 'text' })

export default mongoose.model<ICompany>('Company', CompanySchema)