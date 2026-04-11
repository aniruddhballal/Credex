import { Response } from 'express'
import multer from 'multer'
import { uploadImage, deleteImage, CloudinaryFolder } from '../services/cloudinary'
import User from '../models/User'
import Company from '../models/Company'
import Product from '../models/Product'
import { AuthRequest } from '../middleware/auth'

// Multer — memory buffer only, no disk
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPG, PNG and WEBP images are allowed'))
    }
  },
})

const getUserCompany = async (userId: string) => {
  const user = await User.findById(userId)
  if (!user?.companyId) return { user: null, company: null }
  const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
  return { user, company }
}

// PATCH /api/images/profile
export const uploadProfilePicture = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No image uploaded' })
      return
    }

    const user = await User.findById(req.user!.userId)
    if (!user || user.isDeleted) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    // Delete old image if exists
    if (user.profilePicture) {
      const oldPublicId = extractPublicId(user.profilePicture)
      if (oldPublicId) deleteImage(oldPublicId).catch(() => {})
    }

    const { url } = await uploadImage(
      req.file.buffer,
      'profile-pictures' as CloudinaryFolder,
      `user-${user._id}`
    )

    user.profilePicture = url
    await user.save()

    res.json({ success: true, url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    res.status(500).json({ success: false, message })
  }
}

// PATCH /api/images/company-logo
export const uploadCompanyLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No image uploaded' })
      return
    }

    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(404).json({ success: false, message: 'No company linked to your account' })
      return
    }

    if (company.logo) {
      const oldPublicId = extractPublicId(company.logo)
      if (oldPublicId) deleteImage(oldPublicId).catch(() => {})
    }

    const { url } = await uploadImage(
      req.file.buffer,
      'company-logos' as CloudinaryFolder,
      `company-${company._id}`
    )

    company.logo = url
    await company.save()

    res.json({ success: true, url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    res.status(500).json({ success: false, message })
  }
}

// POST /api/images/product/:productId
// Appends images to product.images array (max 8)
export const uploadProductImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No image uploaded' })
      return
    }

    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No supplier company found' })
      return
    }

    const product = await Product.findOne({
      _id: req.params.productId,
      supplierId: company._id,
      isDeleted: false,
    })

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found or not yours' })
      return
    }

    if (product.images.length >= 8) {
      res.status(400).json({ success: false, message: 'Maximum 8 images per product' })
      return
    }

    const { url } = await uploadImage(
      req.file.buffer,
      'product-images' as CloudinaryFolder,
      `product-${product._id}-${Date.now()}`
    )

    product.images.push(url)
    await product.save()

    res.json({ success: true, url, images: product.images })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    res.status(500).json({ success: false, message })
  }
}

// DELETE /api/images/product/:productId
// Body: { url } — removes one image from product.images
export const deleteProductImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { company } = await getUserCompany(req.user!.userId)
    if (!company) {
      res.status(403).json({ success: false, message: 'No supplier company found' })
      return
    }

    const { url } = req.body
    if (!url) {
      res.status(400).json({ success: false, message: 'url is required' })
      return
    }

    const product = await Product.findOne({
      _id: req.params.productId,
      supplierId: company._id,
      isDeleted: false,
    })

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found or not yours' })
      return
    }

    const publicId = extractPublicId(url)
    if (publicId) deleteImage(publicId).catch(() => {})

    product.images = product.images.filter((img) => img !== url)
    await product.save()

    res.json({ success: true, images: product.images })
  } catch {
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// Extract Cloudinary public_id from a secure URL
// e.g. https://res.cloudinary.com/cloud/image/upload/v123/product-images/xyz.jpg
// → product-images/xyz
const extractPublicId = (url: string): string | null => {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i)
    return match ? match[1] : null
  } catch {
    return null
  }
}