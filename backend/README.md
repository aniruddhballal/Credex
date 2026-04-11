# Credex Backend — API Reference

Node.js + Express + TypeScript. All routes are prefixed with the base URL (`http://localhost:5000` in dev).

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Environment Variables](#environment-variables)
3. [Auth Rules](#auth-rules)
4. [Response Shape](#response-shape)
5. [Endpoints](#endpoints)
   - [Auth](#1-auth---apiauthroutes)
   - [Users](#2-users---apiusersroutes)
   - [Companies](#3-companies---apicompaniesroutes)
   - [Products](#4-products---apiproductsroutes)
   - [RFQs](#5-rfqs---apirfqsroutes)
   - [Purchase Orders](#6-purchase-orders---apipurchase-ordersroutes)
   - [Payments](#7-payments---sub-routes-under-purchase-orders)
   - [Loans](#8-loans---apiloansroutes)
   - [Notifications](#9-notifications---apinotificationsroutes)
   - [Reviews](#10-reviews---apireviewsroutes)
   - [Chat](#11-chat---apichatroutes)
   - [Documents](#12-documents---apidocumentsroutes)
   - [Images](#13-images---apiimagesroutes)
   - [Credit Scores](#14-credit-scores---apicredit-scoresroutes)
   - [Admin](#15-admin---apiadminroutes)
6. [Models Reference](#models-reference)
7. [Services](#services)
8. [Middleware](#middleware)
9. [Utils](#utils)
10. [Key Business Rules](#key-business-rules)

---

## Project Structure

```
backend/
├── src/
│   ├── controllers/        Business logic — one file per domain
│   ├── middleware/         auth.ts, ipWhitelist.ts, sanitise.ts
│   ├── models/             Mongoose models — one file per collection
│   ├── routes/             Express routers — one file per domain
│   ├── services/           b2.ts (Backblaze), cloudinary.ts
│   ├── utils/              jwt.ts, email.ts
│   └── server.ts           Entry point
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Environment Variables

```env
# MongoDB
MONGODB_URI=

# JWT
JWT_ACCESS_SECRET=          # min 32 chars
JWT_REFRESH_SECRET=         # min 32 chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Gmail OAuth2
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_USER=

# Admin IP whitelist (comma-separated)
ADMIN_ALLOWED_IPS=127.0.0.1,::1

# Cloudinary (images)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Backblaze B2 (documents)
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET_NAME=
```

---

## Auth Rules

| Symbol | Meaning |
|--------|---------|
| 🔓 | Public — no token required |
| 🔒 | Requires `Authorization: Bearer <accessToken>` header |
| 🏢 | Requires authenticated user to have a linked company |
| 👤 | Specific role required |

Access tokens expire in **15 minutes**. Use `POST /api/auth/refresh` (sends the httpOnly refresh cookie automatically) to get a new one. Refresh tokens expire in **7 days**.

---

## Response Shape

All endpoints return JSON. Success:
```json
{ "success": true, ...fields }
```
Error:
```json
{ "success": false, "message": "Human readable error" }
```

There is **no nested `data` wrapper** — fields are returned at the root level alongside `success`.

---

## Endpoints

---

### 1. Auth — `/api/auth/routes`

File: `src/controllers/auth.controller.ts` · `src/routes/auth.routes.ts`

Rate limited: **10 requests per 15 minutes per IP** on all auth endpoints.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | 🔓 | Register new buyer or supplier account. Sends verification email. Body: `{ firstName, lastName, email, password, role: 'buyer'|'supplier', phone? }` |
| POST | `/api/auth/login` | 🔓 | Login. Returns `{ accessToken, user }`. Sets httpOnly `credex_refresh` cookie. Body: `{ email, password }` |
| POST | `/api/auth/refresh` | 🔓 | Exchange refresh cookie for new access token. Returns `{ accessToken }`. |
| GET | `/api/auth/verify-email` | 🔓 | Verify email from link. Query: `?token=<token>` |
| POST | `/api/auth/forgot-password` | 🔓 | Send password reset email. Body: `{ email }`. Always returns 200 (no email enumeration). |
| POST | `/api/auth/reset-password` | 🔓 | Reset password using token from email. Body: `{ token, password }`. Invalidates all active sessions. |
| POST | `/api/auth/logout` | 🔓 | Clears refresh cookie and invalidates session. |
| GET | `/api/auth/me` | 🔒 | Returns current user with company populated. |

**Login response shape:**
```json
{
  "success": true,
  "accessToken": "eyJ...",
  "user": {
    "id": "...",
    "firstName": "Aniruddh",
    "lastName": "Ballal",
    "email": "...",
    "role": "supplier",
    "companyId": "...",
    "isEmailVerified": true
  }
}
```

**User onboarding flow:**
```
register → verify email → login → create company → create products / place RFQs
```

---

### 2. Users — `/api/users/routes`

File: `src/controllers/user.controller.ts` · `src/routes/user.routes.ts`

All routes require 🔒.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/profile` | Get own full profile. Company populated with name, type, isVerified, trustBadge, logo, city, state. |
| PATCH | `/api/users/profile` | Update own profile. Body: `{ firstName?, lastName?, phone? }` |
| POST | `/api/users/change-password` | Change password. Body: `{ currentPassword, newPassword }`. Min 8 chars for new password. |

---

### 3. Companies — `/api/companies/routes`

File: `src/controllers/company.controller.ts` · `src/routes/company.routes.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/companies` | 🔓 | Paginated public listing. Filters: `?type=supplier&city=Mumbai&state=Maharashtra&isVerified=true&search=steel&lastId=<cursor>&limit=20` |
| GET | `/api/companies/:id` | 🔓 | Public company profile. Sensitive fields (gstin, pan, members) excluded. |
| POST | `/api/companies` | 🔒 | Create company and link to authenticated user. User must not already have a company. Body: `{ name, type, email, legalName?, description?, website?, phone?, address?, city?, state?, pincode?, gstin?, pan?, cin?, udyamNumber?, industry?, tags? }` |
| GET | `/api/companies/me/profile` | 🔒 | Get own company (full detail). |
| PATCH | `/api/companies/me/profile` | 🔒 | Update own company. Same fields as create (type cannot be changed). |

**Company type rules:**
- A `buyer` role user can only create `buyer` or `both` type companies
- A `supplier` role user can only create `supplier` or `both` type companies

**Indian validation enforced:**
- `gstin` — 15-char format: `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/`
- `pan` — 10-char format: `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/`
- `phone` — Indian mobile: `/^(\+91)?[6-9]\d{9}$/`

---

### 4. Products — `/api/products/routes`

File: `src/controllers/product.controller.ts` · `src/routes/product.routes.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/products` | 🔓 | Paginated public listing. Filters: `?supplierId=&category=&minPrice=&maxPrice=&isNegotiable=true&financingMethod=deferred_30&minRating=4&search=&lastId=<cursor>&limit=20` |
| GET | `/api/products/:id` | 🔓 | Single product. Populates supplier company and posted-by user. |
| GET | `/api/products/my/listings` | 🔒🏢 | Supplier's own products. Supports `?lastId=&limit=` |
| POST | `/api/products` | 🔒🏢 | Create product listing. Company must be `supplier` or `both`. Body: `{ name, category, basePrice, priceUnit?, description?, tags?, images?, isNegotiable?, isAvailable?, stockQuantity?, acceptedFinancingMethods?, defaultPenaltyRate?, defaultPaymentDeadlineDays? }` |
| PATCH | `/api/products/:id` | 🔒🏢 | Update own product. Any subset of create fields. |
| DELETE | `/api/products/:id` | 🔒🏢 | Soft delete own product. |

**Important:** `basePrice` is stored in **paise** (1 rupee = 100 paise). Store `250000` for ₹2,500. Display with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

**Accepted financing methods enum:**
`immediate` | `deferred_30` | `deferred_60` | `deferred_90` | `installment` | `loan` | `lease` | `rent` | `equity` | `open_to_discuss`

---

### 5. RFQs — `/api/rfqs/routes`

File: `src/controllers/rfq.controller.ts` · `src/routes/rfq.routes.ts`

All routes require 🔒🏢.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rfqs` | List RFQs for own company. Filters: `?role=buyer\|supplier&status=pending\|countered\|accepted\|declined\|expired\|converted_to_po&lastId=&limit=` |
| GET | `/api/rfqs/:id` | Full RFQ detail including full negotiation `history[]`. Parties only. |
| POST | `/api/rfqs` | Buyer creates RFQ for a product. Body: `{ productId, quantity, financingMethod, proposedPrice?, paymentDeadlineDays?, penaltyRate?, message? }`. If proposedPrice omitted, uses product.basePrice. Expires in 7 days. |
| POST | `/api/rfqs/:id/counter` | Either party counters. Cannot counter your own last move. Body: `{ proposedPrice?, quantity?, financingMethod?, paymentDeadlineDays?, penaltyRate?, message? }` |
| POST | `/api/rfqs/:id/accept` | Accept current terms. Either party can accept. Status → `accepted`. |
| POST | `/api/rfqs/:id/decline` | Decline RFQ. Either party can decline. Status → `declined`. |

**Negotiation status flow:**
```
pending → countered (back and forth) → accepted → converted_to_po
                                     → declined
                                     → expired (after 7 days)
```

**lastMovedBy** tracks whose turn it is. A party cannot counter if `lastMovedBy === their role`.

Each counter appends to `history[]` — full negotiation timeline always available.

---

### 6. Purchase Orders — `/api/purchase-orders/routes`

File: `src/controllers/purchaseOrder.controller.ts` · `src/routes/purchaseOrder.routes.ts`

All routes require 🔒🏢.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/purchase-orders` | List POs for own company. Filters: `?role=buyer\|supplier&status=confirmed\|in_progress\|completed\|cancelled\|disputed&paymentStatus=unpaid\|partially_paid\|paid\|overdue&lastId=&limit=`. Sorted by paymentDeadline ascending. |
| GET | `/api/purchase-orders/:id` | Full PO detail. Populates product, buyer company, supplier company, RFQ. |
| POST | `/api/purchase-orders` | Buyer creates PO from an accepted RFQ. Body: `{ rfqId }`. RFQ must have `status === 'accepted'`. Creates one PO per RFQ (duplicate blocked). Sets paymentDeadline from `currentPaymentDeadlineDays`. |
| PATCH | `/api/purchase-orders/:id/fulfilment` | Supplier updates fulfilment status. Body: `{ fulfilmentStatus: 'pending'\|'processing'\|'shipped'\|'delivered'\|'completed', note? }`. Auto-completes PO if payment is also done. |
| POST | `/api/purchase-orders/:id/cancel` | Either party cancels. Blocked if any payments recorded. Body: `{ reason? }` |

**PO status flow:**
```
confirmed → in_progress → completed
          → cancelled
          → disputed
```

**Payment status:** `unpaid` → `partially_paid` → `paid`
**Fulfilment status:** `pending` → `processing` → `shipped` → `delivered` → `completed`

PO auto-completes (`status: 'completed'`) when both `paymentStatus === 'paid'` AND `fulfilmentStatus === 'completed'`.

---

### 7. Payments — sub-routes under Purchase Orders

File: `src/controllers/payment.controller.ts` · `src/routes/purchaseOrder.routes.ts`

All routes require 🔒🏢.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/purchase-orders/:id/payments` | Buyer records a payment against a PO. Body: `{ amount, method, referenceNumber?, paidAt?, note? }`. Amount must not exceed `amountRemaining`. |
| GET | `/api/purchase-orders/:id/payments` | Full payment history for a PO. Both parties can view. |

**Payment methods:** `upi` | `neft` | `rtgs` | `imps` | `cheque` | `cash` | `bank_transfer` | `other`

**Critical:** Payment documents are **immutable** — never updated after creation. `amountPaid` and `amountRemaining` on the PO are updated by the payment controller, not the Payment document.

**Payment response includes both the new payment and the updated PO:**
```json
{
  "success": true,
  "payment": { ... },
  "purchaseOrder": { "amountPaid": ..., "amountRemaining": ..., "paymentStatus": "partially_paid" }
}
```

---

### 8. Loans — `/api/loans/routes`

File: `src/controllers/loan.controller.ts` · `src/routes/loan.routes.ts`

All routes require 🔒.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/loans` | 🔒 | Applicants see own company's loans. Underwriters/admins see all non-draft. Filters: `?status=&mine=true&lastId=&limit=` |
| GET | `/api/loans/:id` | 🔒 | Full detail. Owner or underwriter/admin only. Populates loanType, company, applicant, underwriter, linked PO. |
| POST | `/api/loans` | 🔒🏢 | Create draft loan application. Body: `{ loanTypeId, requestedAmount, requestedTenureMonths, purpose, purchaseOrderId? }`. Validates amount and tenure against LoanType limits. |
| POST | `/api/loans/:id/submit` | 🔒🏢 | Submit draft for review. Status: `draft` → `submitted`. |
| PATCH | `/api/loans/:id/assign` | 👤 underwriter/admin | Underwriter assigns themselves. Status: → `under_review`. |
| POST | `/api/loans/:id/request-documents` | 👤 underwriter/admin | Request additional documents. Body: `{ note }`. Status: → `documents_requested`. Notifies applicant. |
| POST | `/api/loans/:id/approve` | 👤 underwriter/admin | Approve loan. Body: `{ approvedAmount, approvedInterestRate, approvedTenureMonths, emiAmount?, note? }`. Status: → `approved`. |
| POST | `/api/loans/:id/reject` | 👤 underwriter/admin | Reject loan. Body: `{ reason, note? }`. Status: → `rejected`. |

**Loan status flow:**
```
draft → submitted → under_review → documents_requested ↘
                  ↘              →                       approved
                    rejected     → rejected               rejected
```

---

### 9. Notifications — `/api/notifications/routes`

File: `src/controllers/notification.controller.ts` · `src/routes/notification.routes.ts`

All routes require 🔒.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | Paginated notification feed for current user. Filters: `?unreadOnly=true&lastId=&limit=`. Returns `{ notifications, unreadCount, nextCursor }`. |
| PATCH | `/api/notifications/read-all` | Mark all notifications as read. |
| PATCH | `/api/notifications/:id/read` | Mark single notification as read. |

**Notification types:** `rfq_received` | `rfq_countered` | `rfq_accepted` | `rfq_declined` | `po_created` | `po_confirmed` | `po_cancelled` | `po_completed` | `payment_received` | `payment_overdue` | `loan_submitted` | `loan_under_review` | `loan_approved` | `loan_rejected` | `documents_requested` | `review_received` | `credit_score_updated` | `account_verified` | `system`

Notifications are automatically created by controllers when key events occur (RFQ countered, PO created, payment recorded, loan approved, etc.).

---

### 10. Reviews — `/api/reviews/routes`

File: `src/controllers/review.controller.ts` · `src/routes/review.routes.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reviews` | 🔓 | Public review listing. Filters: `?targetCompanyId=&targetProductId=&reviewType=buyer_to_supplier\|supplier_to_buyer\|buyer_to_product&lastId=&limit=` |
| POST | `/api/reviews` | 🔒🏢 | Submit a review. Body: `{ purchaseOrderId, reviewType, rating, comment? }`. Rating: 1–5. |

**Review rules:**
- Only unlocks when PO `fulfilmentStatus === 'completed'` AND `paymentStatus === 'paid'`
- One review per type per PO (enforced by unique index)
- Buyer can submit: `buyer_to_supplier` and `buyer_to_product`
- Supplier can submit: `supplier_to_buyer`
- On submission, updates `averageRating` and `totalReviews` on Company or Product using running average: `newAvg = (oldAvg × oldCount + newRating) / (oldCount + 1)`
- Sets `buyerReviewed` / `supplierReviewed` flag on PO

---

### 11. Chat — `/api/chat/routes`

File: `src/controllers/chat.controller.ts` · `src/routes/chat.routes.ts`

All routes require 🔒🏢.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chat` | Load message thread. Query: `?rfqId=<id>` OR `?purchaseOrderId=<id>`. Supports `?lastId=&limit=` for loading older messages. Returns messages oldest-first. Auto-marks other party's unread messages as read. |
| POST | `/api/chat` | Send a message. Body: `{ rfqId?, purchaseOrderId?, message }`. Exactly one of rfqId or purchaseOrderId must be provided. |

Each chat thread is scoped to either an RFQ or a PO. Only the two parties to that RFQ/PO can send or read messages in it.

---

### 12. Documents — `/api/documents/routes`

File: `src/controllers/document.controller.ts` · `src/routes/document.routes.ts`

All routes require 🔒. Files stored in **Backblaze B2** (S3-compatible). `s3Key` and `s3Bucket` are **never returned to the client**.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/documents` | 🔒 | List documents for a loan. Query: `?loanApplicationId=<id>`. Owners see own company's docs only. Underwriters/admins see all. |
| POST | `/api/documents` | 🔒🏢 | Upload document. `multipart/form-data`. Field name: `document`. Body fields: `{ loanApplicationId, documentType }`. Max 10MB. Allowed types: PDF, JPG, PNG, WEBP, DOC, DOCX. |
| GET | `/api/documents/:id/url` | 🔒 | Generate a **signed 15-minute expiring URL** for document access. Every call is logged to DocumentAccessLog. Owner or underwriter/admin only. |
| PATCH | `/api/documents/:id/accept` | 👤 underwriter/admin | Mark document as accepted. |
| PATCH | `/api/documents/:id/reject` | 👤 underwriter/admin | Mark document as rejected. Body: `{ reason }` |
| DELETE | `/api/documents/:id` | 🔒 | Soft delete. Owner or system_admin only. |

**Document types:** `gstin_certificate` | `pan` | `incorporation_certificate` | `bank_statements` | `itr` | `audited_financials` | `udyam_certificate` | `address_proof` | `photo` | `other`

**Flow:** Upload → get signed URL to view → underwriter accepts/rejects.

---

### 13. Images — `/api/images/routes`

File: `src/controllers/image.controller.ts` · `src/routes/image.routes.ts`

All routes require 🔒. Images stored in **Cloudinary**. Returns a direct HTTPS URL (safe to store and serve).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PATCH | `/api/images/profile` | 🔒 | Upload/replace own profile picture. `multipart/form-data`, field: `image`. Max 5MB. JPG/PNG/WEBP only. Returns `{ url }`. |
| PATCH | `/api/images/company-logo` | 🔒🏢 | Upload/replace own company logo. Same constraints. Returns `{ url }`. |
| POST | `/api/images/product/:productId` | 🔒🏢 | Add an image to a product. Max 8 images per product. Returns `{ url, images[] }`. |
| DELETE | `/api/images/product/:productId` | 🔒🏢 | Remove one image from a product. Body: `{ url }`. Deletes from Cloudinary and removes from product.images array. |

---

### 14. Credit Scores — `/api/credit-scores/routes`

File: `src/controllers/creditScore.controller.ts` · `src/routes/creditScore.routes.ts`

All routes require 🔒.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/credit-scores/me` | 🔒 | Latest credit score for own company. Returns `null` if never computed. |
| GET | `/api/credit-scores/me/history` | 🔒 | Last 30 score records for own company. Use for trend chart. |
| POST | `/api/credit-scores/me/compute` | 🔒🏢 | Trigger a fresh score computation for own company. Updates `company.creditScoreRef`. |
| GET | `/api/credit-scores/company/:companyId` | 👤 underwriter/admin | Get latest score for any company. |
| POST | `/api/credit-scores/company/:companyId/compute` | 👤 system_admin | Manually trigger score computation for any company. |

**Score range:** 300–900. **Breakdown fields:** `paymentHistory`, `outstandingDebt`, `tradeActivity`, `reviews`, `creditUtilization` (each 0–100).

**V1 scoring weights:**
- Payment history: 35%
- Outstanding debt: 25%
- Trade activity: 20%
- Reviews: 15%
- Credit utilization: 5%

Python ML service will replace the in-process computation in V2.

---

### 15. Admin — `/api/admin/routes`

File: `src/controllers/admin.controller.ts` · `src/routes/admin.routes.ts`

**All `/api/admin/*` routes are IP-whitelisted** at the server middleware level (`ADMIN_ALLOWED_IPS` env var) before any auth check runs. Additionally most routes require 🔒 + 👤 `system_admin`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/users` | 👤 system_admin | List all users. Filters: `?role=buyer\|supplier\|underwriter\|system_admin&search=<name or email>&isDeleted=false&lastId=&limit=`. Passwords and tokens excluded. |
| DELETE | `/api/admin/users/:id` | 👤 system_admin | Soft delete a user. Body: `{ reason? }`. Cannot delete system_admin accounts. |
| GET | `/api/admin/companies` | 👤 system_admin/underwriter | List companies. Filters: `?isVerified=false&type=supplier&lastId=&limit=` |
| PATCH | `/api/admin/companies/:id/verify` | 👤 system_admin | Verify a company and optionally set trust badge. Body: `{ trustBadge?: 'none'\|'silver'\|'gold'\|'platinum' }` |
| GET | `/api/admin/loan-types` | 🔓 | List all active loan types. Used in frontend loan application form. |
| POST | `/api/admin/loan-types` | 👤 system_admin | Create a loan type. Body: `{ name, code, description?, minAmount, maxAmount, minTenureMonths, maxTenureMonths, baseInterestRate, processingFeePercent? }` |
| PATCH | `/api/admin/loan-types/:id` | 👤 system_admin | Update a loan type. Any subset of create fields + `isActive`. |
| POST | `/api/admin/restoration-requests` | 🔒 | Any authenticated user requests restoration of a soft-deleted entity. Body: `{ entityType, entityId, reason }`. Min 10 chars reason. One pending request per entity enforced. |
| GET | `/api/admin/restoration-requests` | 👤 system_admin | List restoration requests. Filters: `?status=pending\|approved\|rejected&lastId=&limit=` |
| POST | `/api/admin/restoration-requests/:id/approve` | 👤 system_admin | Approve and execute restoration. Body: `{ note? }`. Actually restores the entity (unsets isDeleted). |
| POST | `/api/admin/restoration-requests/:id/reject` | 👤 system_admin | Reject request. Body: `{ note? }` |
| GET | `/api/admin/audit-logs` | 👤 system_admin | Immutable audit trail. Filters: `?action=&entityType=&performedBy=<userId>&lastId=&limit=` |

---

## Models Reference

All 17 Mongoose models. All use `{ timestamps: true }` — never manually define `createdAt`/`updatedAt`.

| Model | File | Key fields |
|-------|------|------------|
| User | `models/User.ts` | role, email, companyId, isEmailVerified, isDeleted, ipWhitelist |
| Company | `models/Company.ts` | name, type, gstin, pan, isVerified, trustBadge, averageRating, members[] |
| Product | `models/Product.ts` | supplierId, basePrice (paise), acceptedFinancingMethods, averageRating |
| RFQ | `models/RFQ.ts` | buyerId, supplierId, productId, status, history[], lastMovedBy, expiresAt |
| PurchaseOrder | `models/PurchaseOrder.ts` | rfqId, totalPrice, amountPaid, amountRemaining, paymentStatus, fulfilmentStatus, statusHistory[] |
| Payment | `models/Payment.ts` | purchaseOrderId, amount, method, referenceNumber — **immutable** |
| LoanApplication | `models/LoanApplication.ts` | companyId, loanTypeId, purchaseOrderId?, status, statusHistory[], approvedAmount |
| LoanType | `models/LoanType.ts` | code, minAmount, maxAmount, minTenureMonths, maxTenureMonths, baseInterestRate |
| Document | `models/Document.ts` | s3Key, s3Bucket (B2), documentType, status — s3Key never returned to client |
| DocumentAccessLog | `models/DocumentAccessLog.ts` | documentId, accessedBy, ipAddress — **immutable** |
| Review | `models/Review.ts` | purchaseOrderId, reviewType, rating — one per type per PO |
| CreditScore | `models/CreditScore.ts` | companyId, score (300–900), breakdown, computedAt — versioned |
| Notification | `models/Notification.ts` | userId, type, entityType, entityId, isRead |
| ChatMessage | `models/ChatMessage.ts` | rfqId?, purchaseOrderId?, senderId, message |
| Session | `models/Session.ts` | userId, sessionToken (jti), expiresAt (TTL auto-purge) |
| AuditLog | `models/AuditLog.ts` | action, entityType, entityId, changes (before/after) — **immutable** |
| RestorationRequest | `models/RestorationRequest.ts` | entityType, entityId, status — one pending per entity |

---

## Services

### `services/cloudinary.ts`
- `uploadImage(buffer, folder, filename?)` → `{ url, publicId }`
- `deleteImage(publicId)` → void
- Folders: `product-images` | `company-logos` | `profile-pictures`
- Migration to S3: swap 3 env vars, replace `S3Client` instantiation. Rest is identical.

### `services/b2.ts`
- `uploadDocument(buffer, companyId, loanApplicationId, originalFileName, mimeType)` → `{ b2Key, bucket }`
- `getSignedDocumentUrl(b2Key)` → signed URL (15 min expiry)
- `deleteDocument(b2Key)` → void
- S3-compatible via `@aws-sdk/client-s3`. Migration to AWS S3: change 4 env vars, remove custom endpoint.

---

## Middleware

### `middleware/auth.ts`
- `authenticate` — validates Bearer token, attaches `req.user = { userId, role, companyId }`
- `requireRole(...roles)` — checks `req.user.role` against allowed roles, returns 403 if mismatch

### `middleware/sanitise.ts`
- `sanitiseBody` — recursively sanitises all string fields in `req.body` using the `xss` library
- **Never** uses `validator.escape()` (encodes `'` and `/` as HTML entities which corrupt stored data)

### `middleware/ipWhitelist.ts`
- Checks client IP against `ADMIN_ALLOWED_IPS` env var (comma-separated)
- Applied at server level to all `/api/admin/*` routes before any other middleware
- Returns 403 `Access denied` if IP not in list

---

## Utils

### `utils/jwt.ts`
- `generateAccessToken(payload)` → JWT (15 min)
- `generateRefreshToken(userId)` → `{ token, jti }` (7 days, jti stored in Session)
- `verifyAccessToken(token)` → `AccessTokenPayload`
- `verifyRefreshToken(token)` → `RefreshTokenPayload`
- `generateVerificationToken()` → 32-byte hex string
- `generateResetToken()` → 32-byte hex string

### `utils/email.ts`
- `sendEmail({ to, subject, html })` — Gmail OAuth2 via googleapis + nodemailer
- Full logging: env var check → token fetch → transporter verify → send → messageId
- `emailTemplates.verification(firstName, token)` → `{ subject, html }` — link: `/verify-email?token=`
- `emailTemplates.passwordReset(firstName, token)` → `{ subject, html }` — link: `/reset-password?token=`

---

## Key Business Rules

These are enforced in controllers and must be respected by the frontend:

1. **Prices in paise** — store and send `250000` for ₹2,500. Display with `en-IN` locale.
2. **Company required before products/RFQs** — a user must `POST /api/companies` before they can create products or place RFQs.
3. **RFQ → PO flow** — buyer creates RFQ, either party accepts, then buyer creates PO from accepted RFQ. Direct PO creation without an RFQ is not supported.
4. **Payments are immutable** — once recorded, a payment cannot be edited or deleted.
5. **Reviews gate** — both `fulfilmentStatus === 'completed'` AND `paymentStatus === 'paid'` must be true before reviews unlock.
6. **Signed URLs for documents** — never store or display document URLs directly. Always call `GET /api/documents/:id/url` to get a fresh 15-min signed URL.
7. **Soft deletes only** — no hard deletes on User, Company, Product, RFQ, PurchaseOrder, LoanApplication, Document.
8. **Admin routes are IP-restricted** — `POST /api/admin/loan-types` etc. will 403 from any non-whitelisted IP.
9. **Email verification required** — login is blocked with 403 until email is verified.
10. **One company per user (V1)** — trying to `POST /api/companies` when `user.companyId` is already set returns 409.