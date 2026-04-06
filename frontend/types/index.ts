/**
 * types/index.ts
 * Shared TypeScript types — mirror the backend Mongoose interfaces.
 * These are the shapes that come back from API responses.
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

export type UserRole = 'buyer' | 'supplier' | 'underwriter' | 'system_admin'

export interface AuthUser {
  _id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  profilePicture?: string
  role: UserRole
  companyId?: string
  isEmailVerified: boolean
}

// ── Company ───────────────────────────────────────────────────────────────────

export type CompanyType = 'buyer' | 'supplier' | 'both'
export type TrustBadge = 'none' | 'silver' | 'gold' | 'platinum'

export interface Company {
  _id: string
  name: string
  legalName?: string
  type: CompanyType
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
  isVerified: boolean
  trustBadge: TrustBadge
  creditScoreRef?: string
  industry?: string
  tags?: string[]
  createdAt: string
}

// ── Product ───────────────────────────────────────────────────────────────────

export type FinancingMethod =
  | 'immediate' | 'deferred_30' | 'deferred_60' | 'deferred_90'
  | 'installment' | 'loan' | 'lease' | 'rent' | 'equity' | 'open_to_discuss'

export interface Product {
  _id: string
  supplierId: string | Company
  postedBy: string
  name: string
  description?: string
  category: string
  tags?: string[]
  images: string[]
  basePrice: number          // paise
  priceUnit: string
  currency: string
  isNegotiable: boolean
  isAvailable: boolean
  stockQuantity?: number
  acceptedFinancingMethods: FinancingMethod[]
  defaultPenaltyRate: number
  defaultPaymentDeadlineDays: number
  averageRating: number
  totalReviews: number
  createdAt: string
}

// ── RFQ ───────────────────────────────────────────────────────────────────────

export type RFQStatus = 'pending' | 'countered' | 'accepted' | 'declined' | 'expired'

export interface NegotiationEntry {
  proposedBy: string
  role: 'buyer' | 'supplier'
  proposedPrice: number
  proposedQuantity: number
  proposedFinancingMethod: FinancingMethod
  proposedPaymentDeadlineDays: number
  proposedPenaltyRate: number
  message?: string
  timestamp: string
}

export interface RFQ {
  _id: string
  buyerId: string | Company
  supplierId: string | Company
  productId: string | Product
  status: RFQStatus
  currentProposedPrice: number
  currentProposedQuantity: number
  currentProposedFinancingMethod: FinancingMethod
  currentProposedPaymentDeadlineDays: number
  currentProposedPenaltyRate: number
  negotiationHistory: NegotiationEntry[]
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

// ── Purchase Order ────────────────────────────────────────────────────────────

export type POPaymentStatus = 'unpaid' | 'partially_paid' | 'paid'
export type POFulfilmentStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed'

export interface PurchaseOrder {
  _id: string
  buyerId: string | Company
  supplierId: string | Company
  productId: string | Product
  rfqId: string
  quantity: number
  unitPrice: number          // paise
  totalPrice: number         // paise
  financingMethod: FinancingMethod
  paymentDeadline: string
  penaltyRate: number
  amountPaid: number         // paise
  amountRemaining: number    // paise
  paymentStatus: POPaymentStatus
  fulfilmentStatus: POFulfilmentStatus
  isDisputed: boolean
  buyerReviewed: boolean
  supplierReviewed: boolean
  loanId?: string
  createdAt: string
  updatedAt: string
}

// ── Payment ───────────────────────────────────────────────────────────────────

export interface Payment {
  _id: string
  purchaseOrderId: string
  paidBy: string
  amount: number             // paise
  method: string
  reference?: string
  wasOnTime: boolean
  penaltyAccrued: number     // paise
  paidAt: string
}

// ── Loan ──────────────────────────────────────────────────────────────────────

export type LoanStatus =
  | 'draft' | 'submitted' | 'under_review' | 'approved'
  | 'rejected' | 'documents_requested' | 'disbursed' | 'closed'

export interface LoanApplication {
  _id: string
  applicantCompanyId: string
  purchaseOrderId: string
  loanTypeId: string
  requestedAmount: number    // paise
  tenureMonths: number
  purpose: string
  status: LoanStatus
  creditRiskScore?: number
  assignedUnderwriterId?: string
  approvedAmount?: number
  interestRate?: number
  disbursedAt?: string
  nextEmiDate?: string
  totalRepaid: number
  createdAt: string
  updatedAt: string
}

// ── Credit Score ──────────────────────────────────────────────────────────────

export type CreditTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface CreditScore {
  _id: string
  companyId: string
  score: number
  tier: CreditTier
  breakdown: {
    base: number
    paymentComponent: number
    volumeComponent: number
    reviewComponent: number
    disputePenalty: number
    loanComponent: number
    verificationBonus: number
    tenureBonus: number
    total: number
  }
  improvementTips: string[]
  computedAt: string
}

// ── Notification ──────────────────────────────────────────────────────────────

export interface Notification {
  _id: string
  userId: string
  type: string
  title: string
  message: string
  entityType?: string
  entityId?: string
  isRead: boolean
  readAt?: string
  createdAt: string
}

// ── Optimizer ─────────────────────────────────────────────────────────────────

export interface ScheduledPayment {
  date: string
  purchaseOrderId: string
  supplierName: string
  amountToPay: number
  reason: string
}

export interface OptimizerAlert {
  purchaseOrderId: string
  urgency: 'high' | 'medium' | 'low'
  message: string
}

export interface ProjectedBalance {
  date: string
  balance: number
}

export interface OptimizerResult {
  paymentSchedule: ScheduledPayment[]
  alerts: OptimizerAlert[]
  projectedCashBalance: ProjectedBalance[]
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  nextCursor?: string
  total?: number
}