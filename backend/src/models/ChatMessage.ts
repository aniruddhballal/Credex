import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IChatMessage extends Document {
  // Linked to either an RFQ or a PO (one must be set)
  rfqId?: Types.ObjectId
  purchaseOrderId?: Types.ObjectId

  senderId: Types.ObjectId         // User
  senderCompanyId: Types.ObjectId  // Company

  message: string
  isRead: boolean
  readAt?: Date

  isDeleted: boolean
  deletedAt?: Date

  createdAt: Date
  updatedAt: Date
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    rfqId: { type: Schema.Types.ObjectId, ref: 'RFQ' },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderCompanyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    message: { type: String, required: true, maxlength: 2000 },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
)

ChatMessageSchema.index({ rfqId: 1, createdAt: 1 })
ChatMessageSchema.index({ purchaseOrderId: 1, createdAt: 1 })
ChatMessageSchema.index({ senderId: 1 })

export default mongoose.model<ChatMessage>('ChatMessage', ChatMessageSchema)