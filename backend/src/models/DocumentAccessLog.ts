import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IDocumentAccessLog extends Document {
  documentId: Types.ObjectId
  accessedBy: Types.ObjectId
  accessedByRole: string
  ipAddress: string
  userAgent?: string
  accessedAt: Date
  createdAt: Date
}

const DocumentAccessLogSchema = new Schema<IDocumentAccessLog>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    accessedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    accessedByRole: { type: String, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String },
    accessedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

DocumentAccessLogSchema.index({ documentId: 1 })
DocumentAccessLogSchema.index({ accessedBy: 1 })
DocumentAccessLogSchema.index({ accessedAt: 1 })

export default mongoose.model<IDocumentAccessLog>('DocumentAccessLog', DocumentAccessLogSchema)