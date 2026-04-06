# Credex — Unified MongoDB Schema

## Design Principles

1. **Purpose-built** — not copied from any existing model, designed for Credex's specific needs
2. **Role-unified users** — one User collection handles all roles (buyer, supplier, underwriter, admin)
3. **Company-separated** — personal identity (User) is decoupled from business identity (Company)
4. **Soft delete everywhere** — isDeleted + deletedAt on all major collections
5. **Audit trail built-in** — statusHistory pattern used throughout, not just on loans
6. **Timestamps via Mongoose** — { timestamps: true } on all schemas, no manual createdAt/updatedAt
7. **Indexes declared explicitly** — every foreign key and frequently queried field indexed
8. **Financing-first PO design** — PurchaseOrder is richer than VenPay's PaymentRequest,
   capturing financing method, penalty rate, and linking to optional loan

---

## Collection Map

```
User                    Identity + auth for all roles
Company                 Business profile (buyer or supplier) — linked to User
Product                 Supplier listings
RFQ                     Buyer's request to a supplier (pre-PO negotiation)
PurchaseOrder           Confirmed exchange — the core transactional record
Payment                 Individual payment events against a PO
LoanApplication         Financing request linked to a PO
LoanType                Loan product catalogue (personal, business, LAP, etc.)
Document                KYC/loan documents — metadata only, file in S3
DocumentAccessLog       Every document view — who, when, from where
Review                  Post-PO ratings — buyer→supplier, supplier→buyer, buyer→product
CreditScore             Computed score per Company, versioned
Notification            All in-platform notifications per user
ChatMessage             In-platform messages linked to RFQ or PO
Session                 Active login sessions
AuditLog                Every significant mutation on the platform
RestorationRequest      Request to restore a soft-deleted record
```

---

## Schema Definitions

---

### 1. User

Purpose: Core identity and authentication. One user per human.
A user is linked to one Company (as buyer or supplier), or is an underwriter/admin with no company.

```typescript
interface IUser {
  // Identity
  firstName: string
  lastName: string
  email: string                          // unique, lowercase
  password: string                       // bcrypt hashed
  phone?: string
  profilePicture?: string                // S3 URL

  // Role
  role: 'buyer' | 'supplier' | 'underwriter' | 'system_admin'

  // Linked company (null for underwriter and system_admin)
  companyId?: ObjectId                   // ref: Company

  // Email verification
  isEmailVerified: boolean
  verificationToken?: string
  verificationTokenExpiry?: Date

  // Password reset
  resetPasswordToken?: string
  resetPasswordTokenExpiry?: Date        // 30 min expiry

  // Session tracking
  lastActivity?: Date                    // updated on each authenticated request

  // Admin-only: IP restriction
  ipWhitelist: {
    ip: string
    label?: string                       // e.g. "Office", "Home"
    addedAt: Date
    addedBy?: ObjectId                   // ref: User (which admin added it)
  }[]
  isIpRestricted: boolean                // if true, enforce ipWhitelist on login

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId                   // ref: User (admin who deleted)
  deletionReason?: string

  // Timestamps (via { timestamps: true })
  createdAt: Date
  updatedAt: Date
}

Indexes:
  email (unique)
  role
  companyId
  isDeleted
```

---

### 2. Company

Purpose: Business identity — separate from the human user.
One company can have multiple users (e.g. a company with a finance team),
but for V1 one company = one user. A company can be buyer, supplier, or both.

```typescript
interface ICompany {
  // Identity
  name: string
  legalName?: string                     // registered legal name if different
  type: 'buyer' | 'supplier' | 'both'   // both = can list products AND place RFQs
  description?: string
  logo?: string                          // S3 URL
  website?: string

  // Contact
  email: string                          // business email
  phone?: string

  // Location
  address?: string
  city?: string
  state?: string
  pincode?: string
  country: string                        // default: 'India'

  // Legal / KYC identifiers
  gstin?: string                         // GST Identification Number
  pan?: string                           // PAN of the company
  cin?: string                           // Company Identification Number (MCA)
  udyamNumber?: string                   // MSME registration

  // Verification
  isVerified: boolean                    // manually or API-verified
  verifiedAt?: Date
  verifiedBy?: ObjectId                  // ref: User (admin)
  trustBadge: 'none' | 'silver' | 'gold' | 'platinum'
  trustBadgeUpdatedAt?: Date

  // Credit (computed, stored for fast read)
  creditScoreRef?: ObjectId              // ref: CreditScore (latest)

  // Owners / members (for future multi-user company support)
  members: {
    userId: ObjectId                     // ref: User
    role: 'owner' | 'member'
    addedAt: Date
  }[]

  // Industry / category tags
  industry?: string
  tags?: string[]

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId
  deletionReason?: string

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  gstin (sparse unique)
  pan (sparse unique)
  type
  isVerified
  isDeleted
  city, state (compound — for location-based search)
  name (text index — for search)
```

---

### 3. Product

Purpose: A listing by a supplier. Can be a product or a service.

```typescript
interface IProduct {
  supplierId: ObjectId                   // ref: Company (supplier)
  postedBy: ObjectId                     // ref: User

  // Listing details
  name: string
  description?: string
  category: string
  tags?: string[]
  images: string[]                       // S3 URLs (multiple images)

  // Pricing
  basePrice: number
  priceUnit: string                      // 'per_unit' | 'per_hour' | 'per_project' | 'per_kg' etc.
  currency: string                       // default: 'INR'
  isNegotiable: boolean

  // Availability
  isAvailable: boolean
  stockQuantity?: number                 // null = unlimited / service

  // Financing options this supplier accepts for this product
  acceptedFinancingMethods: (
    | 'immediate'
    | 'deferred_30'
    | 'deferred_60'
    | 'deferred_90'
    | 'installment'
    | 'loan'
    | 'lease'
    | 'rent'
    | 'equity'
    | 'open_to_discuss'
  )[]

  // Penalty for late payment (used by cash flow optimizer)
  defaultPenaltyRate: number             // % per day (e.g. 0.05 = 0.05% per day)
  defaultPaymentDeadlineDays: number     // e.g. 30 (days from PO confirmation)

  // Aggregated stats (updated on review submission)
  averageRating: number                  // 0–5, recomputed on each review
  totalReviews: number

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId

  // Timestamps
  createdAt: Date
  updatedAt: Date
  lastPurchasedAt?: Date                 // updated when a PO for this product completes
}

Indexes:
  supplierId
  category
  isAvailable, isDeleted (compound)
  name (text index)
  averageRating
  basePrice
```

---

### 4. RFQ (Request for Quotation)

Purpose: A buyer's intent to purchase — the pre-PO negotiation record.
Replaces VenPay's ProductRequest, but richer: tracks full negotiation history.

```typescript
interface IRFQ {
  // Parties
  buyerId: ObjectId                      // ref: Company
  supplierId: ObjectId                   // ref: Company
  productId: ObjectId                    // ref: Product
  initiatedBy: ObjectId                  // ref: User

  // Request details
  quantity: number
  customisationNote?: string             // buyer's special requirements

  // Proposed terms (updated with each counter)
  proposedUnitPrice: number
  proposedTotalPrice: number
  proposedFinancingMethod: string        // from Product.acceptedFinancingMethods
  proposedPaymentDeadlineDays: number
  proposedPenaltyRate: number

  // Negotiation history
  negotiationHistory: {
    by: ObjectId                         // ref: User
    byRole: 'buyer' | 'supplier'
    action: 'submitted' | 'countered' | 'accepted' | 'declined'
    unitPrice: number
    totalPrice: number
    financingMethod: string
    paymentDeadlineDays: number
    penaltyRate: number
    note?: string
    timestamp: Date
  }[]

  // Status
  status: 'pending' | 'countered' | 'accepted' | 'declined' | 'expired'
  expiresAt?: Date                       // optional: RFQ auto-expires

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  buyerId
  supplierId
  productId
  status
  buyerId + status (compound)
  supplierId + status (compound)
  isDeleted
```

---

### 5. PurchaseOrder

Purpose: The confirmed exchange. Created when an RFQ is accepted by both parties.
This is the central record — payments, loans, reviews, and the optimizer all link here.

```typescript
interface IPurchaseOrder {
  // Origin
  rfqId: ObjectId                        // ref: RFQ

  // Parties
  buyerId: ObjectId                      // ref: Company
  supplierId: ObjectId                   // ref: Company
  productId: ObjectId                    // ref: Product

  // Confirmed terms
  quantity: number
  unitPrice: number
  totalPrice: number
  currency: string

  // Financing
  financingMethod: string
  paymentDeadline: Date                  // absolute date (computed from deadlineDays)
  penaltyRate: number                    // % per day

  // Payment tracking
  amountPaid: number                     // running total (updated on each Payment)
  amountRemaining: number                // totalPrice - amountPaid
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid'

  // Loan linkage (optional)
  loanApplicationId?: ObjectId          // ref: LoanApplication (if financed via loan)

  // Delivery / fulfilment tracking
  fulfilmentStatus: 'pending' | 'in_progress' | 'delivered' | 'disputed' | 'completed'
  deliveredAt?: Date
  completedAt?: Date                     // set when payment = paid AND fulfilment = delivered

  // Dispute
  isDisputed: boolean
  disputeReason?: string
  disputeRaisedBy?: ObjectId            // ref: User
  disputeRaisedAt?: Date
  disputeResolvedAt?: Date
  disputeResolution?: string

  // Status history (full audit trail)
  statusHistory: {
    paymentStatus?: string
    fulfilmentStatus?: string
    note?: string
    updatedBy: ObjectId                  // ref: User
    timestamp: Date
  }[]

  // Review flags
  buyerReviewed: boolean
  supplierReviewed: boolean

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  rfqId (unique)
  buyerId
  supplierId
  productId
  paymentStatus
  fulfilmentStatus
  paymentDeadline                        // optimizer queries by deadline
  buyerId + paymentStatus (compound)     // buyer's outstanding payables
  supplierId + paymentStatus (compound)  // supplier's receivables
  isDeleted
```

---

### 6. Payment

Purpose: Individual payment event against a PO. Replaces VenPay's PaymentTransaction.
Multiple payments per PO (partial payments). Each is immutable once created.

```typescript
interface IPayment {
  purchaseOrderId: ObjectId              // ref: PurchaseOrder
  buyerId: ObjectId                      // ref: Company
  supplierId: ObjectId                   // ref: Company
  paidBy: ObjectId                       // ref: User (who triggered the payment)

  // Amounts
  amountPaid: number
  amountDueBefore: number
  amountDueAfter: number

  // Payment method
  paymentMethod: 'platform' | 'bank_transfer' | 'upi' | 'cheque' | 'other'
  paymentReference?: string              // UTR, cheque number, etc.

  // Timing
  paidAt: Date
  wasOnTime: boolean                     // paidAt <= PO.paymentDeadline (for credit score)

  // Penalty at time of payment
  penaltyAccrued: number                 // penalty amount accrued before this payment (₹)

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  purchaseOrderId
  buyerId
  supplierId
  paidAt
  wasOnTime                              // credit score queries
```

---

### 7. LoanType

Purpose: Catalogue of loan products available on the platform.
Managed by admins. Underwriters select from these when reviewing applications.

```typescript
interface ILoanType {
  name: string                           // 'Working Capital Loan', 'LAP', 'Invoice Discounting'
  slug: string                           // 'working-capital-loan' (unique, URL-safe)
  description: string
  catchPhrase?: string

  // Rate & amount
  interestRateMin: number                // % p.a.
  interestRateMax: number
  minAmount: number
  maxAmount: number
  minTenureMonths: number
  maxTenureMonths: number

  // Display
  features: string[]                     // bullet points shown to applicant
  requiredDocuments: string[]            // document types required for this loan type
  isActive: boolean

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  slug (unique)
  isActive
```

---

### 8. LoanApplication

Purpose: A buyer's application for financing, linked to a PO.
Extends LOANlo's model significantly — linked to PO, richer approval details.

```typescript
interface ILoanApplication {
  // Applicant
  applicantId: ObjectId                  // ref: User
  companyId: ObjectId                    // ref: Company

  // Linked PO (what the loan is for)
  purchaseOrderId?: ObjectId             // ref: PurchaseOrder (optional — can apply without PO)
  supplierId?: ObjectId                  // ref: Company (derived from PO, stored for quick access)

  // Loan details
  loanTypeId: ObjectId                   // ref: LoanType
  requestedAmount: number
  requestedTenureMonths: number
  purpose: string

  // Assigned underwriter
  assignedUnderwriterId?: ObjectId       // ref: User (role: underwriter)

  // Status machine
  status: 
    | 'draft'                            // applicant hasn't submitted yet
    | 'submitted'                        // submitted, awaiting review
    | 'under_review'                     // underwriter has opened it
    | 'documents_requested'              // underwriter needs more docs
    | 'approved'
    | 'rejected'
    | 'disbursed'                        // money has been released
    | 'closed'                           // fully repaid / cancelled

  statusHistory: {
    status: string
    note?: string
    updatedBy: ObjectId                  // ref: User
    timestamp: Date
  }[]

  // Documents
  documentsSubmitted: boolean
  additionalDocumentsRequested: boolean

  // Rejection
  rejectionReason?: string

  // Approval
  approvalDetails?: {
    approvedAmount: number
    interestRate: number
    tenureMonths: number
    emi: number
    disbursementDate?: Date
    repaymentStartDate?: Date
  }

  // Repayment tracking (post-disbursement)
  totalRepaid: number
  nextEmiDate?: Date
  nextEmiAmount?: number

  // Credit risk score at time of application (from ML model)
  creditRiskScore?: number               // 0–1 probability of default
  creditRiskLabel?: 'low' | 'medium' | 'high'

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  applicantId
  companyId
  purchaseOrderId
  assignedUnderwriterId
  status
  isDeleted
  companyId + status (compound)
```

---

### 9. Document

Purpose: Metadata for uploaded KYC/loan documents. File lives in AWS S3.
No file content stored in MongoDB — only metadata + S3 key.

```typescript
interface IDocument {
  // Owner
  uploadedBy: ObjectId                   // ref: User
  companyId: ObjectId                    // ref: Company
  loanApplicationId: ObjectId           // ref: LoanApplication

  // File metadata
  documentType:
    | 'gstin_certificate'
    | 'pan'
    | 'incorporation_certificate'
    | 'bank_statements'
    | 'itr'
    | 'audited_financials'
    | 'udyam_certificate'
    | 'address_proof'
    | 'photo'
    | 'other'
  originalFileName: string
  fileSize: number                       // bytes
  mimeType: string                       // e.g. 'application/pdf', 'image/jpeg'

  // S3 storage (never expose s3Key to client directly)
  s3Key: string                          // full S3 object key
  s3Bucket: string

  // Status
  status: 'uploaded' | 'under_review' | 'accepted' | 'rejected'
  rejectionReason?: string
  reviewedBy?: ObjectId                  // ref: User (underwriter)
  reviewedAt?: Date

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  loanApplicationId
  companyId
  uploadedBy
  documentType
  status
  isDeleted
```

---

### 10. DocumentAccessLog

Purpose: Every time a document's signed URL is generated (i.e. someone views it), log it.
Immutable — no updates, no deletes.

```typescript
interface IDocumentAccessLog {
  documentId: ObjectId                   // ref: Document
  accessedBy: ObjectId                   // ref: User
  accessedByRole: string                 // snapshot of role at time of access
  ipAddress: string
  userAgent?: string
  accessedAt: Date                       // default: now

  // Timestamps
  createdAt: Date
}

Indexes:
  documentId
  accessedBy
  accessedAt
```

---

### 11. Review

Purpose: Post-PO ratings. Three review types: buyer→supplier, supplier→buyer, buyer→product.
All three live in one collection, distinguished by reviewType.

```typescript
interface IReview {
  purchaseOrderId: ObjectId              // ref: PurchaseOrder
  reviewedBy: ObjectId                   // ref: User
  reviewedByCompanyId: ObjectId          // ref: Company

  reviewType: 'buyer_to_supplier' | 'supplier_to_buyer' | 'buyer_to_product'

  // Target (one of these is set depending on reviewType)
  targetCompanyId?: ObjectId             // ref: Company (for buyer_to_supplier, supplier_to_buyer)
  targetProductId?: ObjectId             // ref: Product (for buyer_to_product)

  // Content
  rating: number                         // 1–5
  comment?: string

  // Visibility control
  isPublic: boolean                      // default: true

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: ObjectId

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  purchaseOrderId
  reviewedByCompanyId
  targetCompanyId
  targetProductId
  reviewType
  purchaseOrderId + reviewType (compound unique — one review per type per PO)
```

---

### 12. CreditScore

Purpose: Versioned credit scores per Company. A new record is created each time
the score is recomputed (daily job). Historical scores are preserved for trend analysis.

```typescript
interface ICreditScore {
  companyId: ObjectId                    // ref: Company
  score: number                          // 300–900
  tier: 'unrated' | 'bronze' | 'silver' | 'gold' | 'platinum'

  // Score components (for explainability)
  components: {
    paymentTimeliness: number            // % of payments made on or before deadline
    totalOrdersCompleted: number
    averageReviewScore: number           // 0–5
    disputeRate: number                  // disputes / total POs
    loanRepaymentRate: number            // EMIs paid on time / total EMIs due
    verificationBonus: number            // bonus points for verified company
  }

  // Metadata
  computedAt: Date
  computedBy: 'system' | 'admin'

  // Timestamps
  createdAt: Date
}

Indexes:
  companyId
  computedAt
  companyId + computedAt (compound — latest score lookup)
```

---

### 13. ChatMessage

Purpose: In-platform messaging between buyer and supplier, linked to an RFQ or PO.

```typescript
interface IChatMessage {
  // Thread context (one of these)
  rfqId?: ObjectId                       // ref: RFQ
  purchaseOrderId?: ObjectId             // ref: PurchaseOrder

  // Parties
  senderId: ObjectId                     // ref: User
  senderCompanyId: ObjectId             // ref: Company
  recipientCompanyId: ObjectId          // ref: Company

  // Content
  message: string
  attachments?: string[]                 // S3 URLs (optional file attachments)

  // Read status
  isRead: boolean
  readAt?: Date

  // Soft delete
  isDeleted: boolean
  deletedAt?: Date

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  rfqId
  purchaseOrderId
  senderId
  senderCompanyId + recipientCompanyId (compound)
  isRead
  createdAt
```

---

### 14. Notification

Purpose: In-platform notification events per user.

```typescript
interface INotification {
  userId: ObjectId                       // ref: User (recipient)

  type:
    | 'rfq_received'
    | 'rfq_countered'
    | 'rfq_accepted'
    | 'rfq_declined'
    | 'po_created'
    | 'payment_received'
    | 'payment_due_reminder'
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

  title: string
  message: string

  // Optional deep link
  entityType?: 'rfq' | 'purchase_order' | 'loan_application' | 'review'
  entityId?: ObjectId

  isRead: boolean
  readAt?: Date

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  userId
  isRead
  userId + isRead (compound)
  userId + createdAt (compound — chronological feed)
```

---

### 15. Session

Purpose: Active login session tracking. Carried from LOANlo — minimal changes.

```typescript
interface ISession {
  userId: ObjectId                       // ref: User
  sessionToken: string                   // unique JWT ID (jti claim)

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
  loggedOutBy?: ObjectId                 // ref: User (if admin-initiated)

  expiresAt: Date                        // TTL index — auto-purged after expiry

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  userId
  sessionToken (unique)
  isActive
  userId + isActive (compound)
  expiresAt (TTL — expireAfterSeconds: 0)
```

---

### 16. AuditLog

Purpose: Immutable log of every significant mutation on the platform.
Written to on every create/update/delete of major entities. Never updated or deleted.

```typescript
interface IAuditLog {
  // Actor
  performedBy: ObjectId                  // ref: User
  performedByRole: string                // snapshot at time of action
  ipAddress: string

  // Action
  action:
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

  // Target
  entityType: string                     // 'User', 'PurchaseOrder', etc.
  entityId: ObjectId

  // Change detail
  changes?: Record<string, {
    before: any
    after: any
  }>

  note?: string                          // optional human-readable description

  timestamp: Date

  // Timestamps
  createdAt: Date
}

Indexes:
  performedBy
  entityType + entityId (compound)
  action
  timestamp
```

---

### 17. RestorationRequest

Purpose: When a user requests that a soft-deleted record be restored.
Linked to any deletable entity (loan application, account, PO, etc).

```typescript
interface IRestorationRequest {
  // What to restore
  entityType: 'loan_application' | 'user' | 'company' | 'product' | 'purchase_order'
  entityId: ObjectId

  // Who's requesting
  requestedBy: ObjectId                  // ref: User

  reason: string                         // min 10 chars

  // Admin decision
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: ObjectId                  // ref: User (admin)
  reviewedAt?: Date
  reviewNote?: string

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  entityType + entityId (compound)
  requestedBy
  status
  status + createdAt (compound)
  entityId + status (partial unique: status = 'pending') — prevent duplicate pending requests
```

---

## Key Design Decisions & Rationale

### Why Company is separate from User
In VenPay, User had `userType: 'company' | 'vendor'` — the business identity was baked
into the user. This breaks when:
- A company wants multiple users (finance team, procurement team)
- The same entity buys and sells (type: 'both')
- Credit scores and reviews belong to the business, not the human

Credex separates them cleanly: User = human identity, Company = business identity.

### Why RFQ and PurchaseOrder are separate
VenPay collapsed these into ProductRequest. But negotiation is a first-class feature in Credex
— the back-and-forth of countering terms, changing financing methods, adjusting penalties —
all of that needs its own audit trail before the PO is confirmed. RFQ is mutable during
negotiation; PO is immutable once created (only status changes).

### Why Payment is separate from PurchaseOrder
VenPay tracked amountDue on PaymentRequest and had a separate PaymentTransaction.
Credex keeps this separation but makes Payment the source of truth — the PO's
amountPaid and amountRemaining are derived fields updated by the Payment controller,
not stored independently. Each Payment record is immutable (no updates after creation).

### Why CreditScore is versioned
Storing only the latest score loses the ability to show trend ("your score improved from
640 to 710 this month"). The daily compute job inserts a new record each run.
Company.creditScoreRef always points to the latest. Historical records are queried
separately for analytics.

### Why Review has three types in one collection
VenPay had ProductRating separate from user reviews. In Credex, all post-PO feedback
lives in one collection with reviewType distinguishing them. This makes it easier to:
- Enforce "one review per type per PO" (compound unique index)
- Query all reviews for a company across both directions
- Aggregate product ratings from the same source of truth

### Why Document uses S3Key not GridFS
LOANlo used GridFS (MongoDB's file storage). S3 + KMS is the production-grade choice:
- Signed expiring URLs (15-30 min) — files never directly accessible
- KMS encryption at rest — mandatory for financial documents
- Access logging via S3 server access logs + DocumentAccessLog collection
- GridFS is fine for dev but creates operational complexity at scale

---

## Cash Flow Optimizer — Data It Reads

The Python microservice reads the following from the unified DB (via Node backend):

```
Input query: GET /api/optimizer/:companyId

Pulls from PurchaseOrder:
  - purchaseOrderId
  - supplierId (→ Company.name for display)
  - totalPrice
  - amountRemaining
  - paymentDeadline
  - penaltyRate
  - paymentStatus (filter: not 'paid')

Buyer provides (or future: pulled from accounting integration):
  - currentCashBalance
  - dailyCashInflows: [{ date, amount }]

Output:
  - paymentSchedule: [{ date, purchaseOrderId, supplierName, amountToPay, reason }]
  - alerts: [{ purchaseOrderId, message, urgency }]
  - projectedCashBalance: [{ date, balance }]
```

---

## What Is NOT In This Schema (Intentionally)

- **EMI / loan repayment schedule table** — deferred to post-MVP; tracked via
  LoanApplication.nextEmiDate and LoanApplication.totalRepaid for now
- **Escrow** — not in V1; payments are tracked, not held
- **Supplier inventory management** — Product.stockQuantity exists but no
  inventory transaction log in V1
- **WhatsApp / SMS notification log** — email only in V1; extend Notification
  model when WhatsApp is added
- **Multi-currency** — INR only in V1; currency field exists on Product and PO
  for future use

---

*Schema version: 1.0*
*Designed for: Credex unified build*
*Author: Aniruddh Ballal*
*Date: April 2026*
```