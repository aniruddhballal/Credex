import mongoose, { Document, Schema, Types } from 'mongoose'

export type NotificationType =
  | 'rfq_received'
  | 'rfq_countered'
  | 'rfq_accepted'
  | 'rfq_declined'
  | 'po_created'
  | 'po_confirmed'
  | 'po_cancelled'
  | 'po_completed'
  | 'payment_received'
  | 'payment_overdue'
  | 'loan_submitted'
  | 'loan_under_review'
  | 'loan_approved'
  | 'loan_rejected'
  | 'documents_requested'
  | 'review_received'
  | 'credit_score_updated'
  | 'account_verified'
  | 'system'

export interface INotification extends Document {
  userId: Types.ObjectId
  type: NotificationType
  title: string
  message: string
  entityType?: 'rfq' | 'purchase_order' | 'loan_application' | 'review'
  entityId?: Types.ObjectId
  isRead: boolean
  readAt?: Date
  createdAt: Date
  updatedAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'rfq_received', 'rfq_countered', 'rfq_accepted', 'rfq_declined',
        'po_created', 'po_confirmed', 'po_cancelled', 'po_completed',
        'payment_received', 'payment_overdue',
        'loan_submitted', 'loan_under_review', 'loan_approved', 'loan_rejected',
        'documents_requested', 'review_received', 'credit_score_updated',
        'account_verified', 'system',
      ],
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    entityType: { type: String, enum: ['rfq', 'purchase_order', 'loan_application', 'review'] },
    entityId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
)

NotificationSchema.index({ userId: 1 })
NotificationSchema.index({ isRead: 1 })
NotificationSchema.index({ userId: 1, isRead: 1 })
NotificationSchema.index({ userId: 1, createdAt: -1 })

export default mongoose.model<INotification>('Notification', NotificationSchema)