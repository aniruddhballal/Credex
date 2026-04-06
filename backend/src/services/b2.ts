/**
 * b2.ts — Document storage service (Backblaze B2, S3-compatible)
 * Handles: KYC docs, loan documents, financial statements
 *
 * MIGRATION NOTE → swap to AWS S3 later:
 *   Change these 3 env vars:
 *     B2_ENDPOINT        → (remove, AWS SDK uses region natively)
 *     B2_REGION          → AWS_REGION
 *     B2_KEY_ID          → AWS_ACCESS_KEY_ID
 *     B2_APPLICATION_KEY → AWS_SECRET_ACCESS_KEY
 *     B2_BUCKET_NAME     → AWS_S3_BUCKET_NAME
 *   Replace S3Client instantiation with:
 *     new S3Client({ region: process.env.AWS_REGION })
 *   Everything else — getSignedUrl, PutObjectCommand, DeleteObjectCommand — is identical
 *   The rest of the codebase stays untouched
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

// B2 is S3-compatible — just point the endpoint at B2
const b2Client = new S3Client({
  endpoint: process.env.B2_ENDPOINT!,
  region: process.env.B2_REGION || 'us-west-004',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
})

const BUCKET = process.env.B2_BUCKET_NAME!

export interface B2UploadResult {
  b2Key: string       // stored as s3Key in Document model
  bucket: string      // stored as s3Bucket in Document model
}

/**
 * Upload a document buffer to B2
 * Key format: documents/<companyId>/<loanApplicationId>/<uuid>-<originalName>
 */
export const uploadDocument = async (
  buffer: Buffer,
  companyId: string,
  loanApplicationId: string,
  originalFileName: string,
  mimeType: string
): Promise<B2UploadResult> => {
  const ext = originalFileName.split('.').pop() || 'bin'
  const uuid = crypto.randomUUID()
  const safeFilename = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `documents/${companyId}/${loanApplicationId}/${uuid}-${safeFilename}`

  await b2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Never public — access only via signed URLs
      ACL: 'private',
    })
  )

  return { b2Key: key, bucket: BUCKET }
}

/**
 * Generate a signed expiring URL for document access
 * URL expires in 15 minutes per spec
 * Every call to this should be logged to DocumentAccessLog
 */
export const getSignedDocumentUrl = async (b2Key: string): Promise<string> => {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: b2Key })
  return getSignedUrl(b2Client, command, { expiresIn: 15 * 60 }) // 15 min
}

/**
 * Delete a document from B2
 * Only called on soft-delete cleanup — not exposed directly to users
 */
export const deleteDocument = async (b2Key: string): Promise<void> => {
  await b2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: b2Key }))
}