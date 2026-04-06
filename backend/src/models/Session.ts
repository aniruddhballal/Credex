import mongoose, { Document, Schema, Types } from 'mongoose'

export interface ISession extends Document {
  userId: Types.ObjectId
  sessionToken: string
  ipAddress: string
  deviceInfo: {
    userAgent: string
    browser?: string
    os?: string
    device?: string
  }
  location?: {
    country?: string
    city?: string
    region?: string
  }
  isActive: boolean
  loginTime: Date
  lastActivity: Date
  logoutTime?: Date
  logoutReason?: 'user' | 'admin' | 'timeout' | 'security' | 'password_reset'
  loggedOutBy?: Types.ObjectId
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const SessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionToken: { type: String, required: true, unique: true },
    ipAddress: { type: String, required: true },
    deviceInfo: {
      userAgent: { type: String, required: true },
      browser: { type: String },
      os: { type: String },
      device: { type: String },
    },
    location: {
      country: { type: String },
      city: { type: String },
      region: { type: String },
    },
    isActive: { type: Boolean, default: true },
    loginTime: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now },
    logoutTime: { type: Date },
    logoutReason: {
      type: String,
      enum: ['user', 'admin', 'timeout', 'security', 'password_reset'],
    },
    loggedOutBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

SessionSchema.index({ userId: 1 })
SessionSchema.index({ isActive: 1 })
SessionSchema.index({ userId: 1, isActive: 1 })
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model<ISession>('Session', SessionSchema)