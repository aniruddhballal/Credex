import mongoose, { Document, Schema, Types } from 'mongoose'

type AuditAction =
  | 'user.create' | 'user.update' | 'user.delete' | 'user.restore'
  | 'company.create' | 'company.update' | 'company.delete' | 'company.verify'
  | 'product.create' | 'product.update' | 'product.delete'
  | 'rfq.create' | 'rfq.counter' | 'rfq.accept' | 'rfq.decline'
  | 'po.create' | 'po.update' | 'po.cancel' | 'po.complete'
  | 'payment.create'
  | 'loan.create' | 'loan.update' | 'loan.delete' | 'loan.restore' | 'loan.approve' | 'loan.reject'
  | 'document.upload' | 'document.delete' | 'document.accept' | 'document.reject'
  | 'review.create' | 'review.delete'
  | 'session.terminate'
  | 'admin.override'

export interface IAuditLog extends Document {
  performedBy: Types.ObjectId
  performedByRole: string
  ipAddress: string
  action: AuditAction
  entityType: string
  entityId: Types.ObjectId
  changes?: Record<string, { before: unknown; after: unknown }>
  note?: string
  timestamp: Date
  createdAt: Date
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    performedByRole: { type: String, required: true },
    ipAddress: { type: String, required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'user.create', 'user.update', 'user.delete', 'user.restore',
        'company.create', 'company.update', 'company.delete', 'company.verify',
        'product.create', 'product.update', 'product.delete',
        'rfq.create', 'rfq.counter', 'rfq.accept', 'rfq.decline',
        'po.create', 'po.update', 'po.cancel', 'po.complete',
        'payment.create',
        'loan.create', 'loan.update', 'loan.delete', 'loan.restore', 'loan.approve', 'loan.reject',
        'document.upload', 'document.delete', 'document.accept', 'document.reject',
        'review.create', 'review.delete',
        'session.terminate',
        'admin.override',
      ],
    },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    changes: { type: Schema.Types.Mixed },
    note: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

AuditLogSchema.index({ performedBy: 1 })
AuditLogSchema.index({ entityType: 1, entityId: 1 })
AuditLogSchema.index({ action: 1 })
AuditLogSchema.index({ timestamp: 1 })

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema)