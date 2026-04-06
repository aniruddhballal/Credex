import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IUser extends Document {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
  profilePicture?: string
  role: 'buyer' | 'supplier' | 'underwriter' | 'system_admin'
  companyId?: Types.ObjectId
  isEmailVerified: boolean
  verificationToken?: string
  verificationTokenExpiry?: Date
  resetPasswordToken?: string
  resetPasswordTokenExpiry?: Date
  lastActivity?: Date
  ipWhitelist: {
    ip: string
    label?: string
    addedAt: Date
    addedBy?: Types.ObjectId
  }[]
  isIpRestricted: boolean
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: Types.ObjectId
  deletionReason?: string
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String },
    profilePicture: { type: String },
    role: {
      type: String,
      enum: ['buyer', 'supplier', 'underwriter', 'system_admin'],
      required: true,
    },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    isEmailVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiry: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordTokenExpiry: { type: Date },
    lastActivity: { type: Date },
    ipWhitelist: [
      {
        ip: { type: String, required: true },
        label: { type: String },
        addedAt: { type: Date, default: Date.now },
        addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    isIpRestricted: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletionReason: { type: String },
  },
  { timestamps: true }
)

UserSchema.index({ role: 1 })
UserSchema.index({ companyId: 1 })
UserSchema.index({ isDeleted: 1 })

export default mongoose.model<IUser>('User', UserSchema)