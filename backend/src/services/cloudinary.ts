/**
 * cloudinary.ts — Image upload service
 * Handles: product images, company logos, user profile pictures
 *
 * MIGRATION NOTE → swap to S3 later:
 *   Replace this file with an S3 service using @aws-sdk/client-s3
 *   Change CLOUDINARY_* env vars to AWS_* env vars
 *   Update upload/delete calls in controllers
 *   The rest of the codebase (models, routes) stays untouched
 */

import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

export type CloudinaryFolder = 'product-images' | 'company-logos' | 'profile-pictures'

export interface CloudinaryUploadResult {
  url: string           // HTTPS URL — safe to store and serve directly
  publicId: string      // needed for deletion
}

/**
 * Upload a file buffer to Cloudinary
 * Returns the secure URL and publicId
 */
export const uploadImage = (
  buffer: Buffer,
  folder: CloudinaryFolder,
  filename?: string
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: filename,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        overwrite: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed'))
          return
        }
        resolve({ url: result.secure_url, publicId: result.public_id })
      }
    )

    const readable = new Readable()
    readable.push(buffer)
    readable.push(null)
    readable.pipe(uploadStream)
  })
}

/**
 * Delete an image from Cloudinary by publicId
 */
export const deleteImage = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId)
}