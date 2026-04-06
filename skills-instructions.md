# Credex — Build Instructions for AI Assistants

## Who This Document Is For

This document is for any AI assistant (Claude, GPT, Gemini, Cursor, etc.) helping
build Credex. Read this entire document before writing a single line of code.
It contains every convention, decision, and constraint that governs how Credex is built.

---

## What Credex Is

Credex is a **B2B procurement and embedded trade finance platform** for the Indian market.
It unifies three previously separate products:

- **VenPay** — B2B marketplace (suppliers list products, buyers place RFQs, POs, payments)
- **LOANlo** — Loan origination system (KYC, document vault, underwriter workflow)
- **VenPayRL** — Cash flow optimiser (multi-agent payment scheduling engine)

It serves four user roles: **Buyer**, **Supplier**, **Bank Underwriter**, **System Admin**.

**Target users:** Indian SMEs (small and medium enterprises) — businesses with real
procurement workflows, cash flow complexity, and limited access to formal credit.

---

## Absolute Rules — Read Before Anything Else

These are non-negotiable. Do not deviate from these under any circumstance.

1. **Never expose S3 keys or bucket names to the client.** All document access
   is via signed expiring URLs generated server-side. URLs expire in 15 minutes.

2. **Never store file content in MongoDB.** Files go to AWS S3. MongoDB stores
   only metadata (s3Key, s3Bucket, mimeType, fileSize, fileName).

3. **Every destructive operation is a soft delete.** Set `isDeleted: true` and
   `deletedAt: Date`. Never use `.deleteOne()` or `.deleteMany()` on major collections
   (User, Company, Product, RFQ, PurchaseOrder, LoanApplication, Document).

4. **Every significant mutation writes to AuditLog.** Create, update, delete,
   restore, approve, reject — all of these write an AuditLog entry with actor,
   IP, entity, and before/after diff.

5. **Admin routes are IP-restricted at middleware level.** Every route prefixed
   `/api/admin/` must pass through `ipWhitelistMiddleware` before any other middleware.

6. **Payment records are immutable.** Once a Payment document is created, it is
   never updated. The PO's `amountPaid` and `amountRemaining` are updated by the
   controller, not the Payment document itself.

7. **The cash flow optimiser never writes to the database.** It is a read-only
   recommendation engine. It reads PurchaseOrder data and returns a schedule.
   It never modifies any document.

8. **All text inputs are sanitised with the `xss` library** before being stored.
   Never use `validator.escape()` — it encodes characters like `'` and `/` as
   HTML entities which then get stored corrupted.

9. **Timestamps via Mongoose `{ timestamps: true }`** — never manually define
   `createdAt` or `updatedAt` fields. Never write pre-save hooks to set them.

10. **TypeScript everywhere.** No `.js` files in backend or frontend.
    Every interface, every schema, every API response is typed.

---

## Tech Stack

### Frontend
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (no MUI, no module.css, no styled-components)
- **Icons:** Lucide React
- **Charts:** Recharts
- **HTTP client:** Axios
- **State management:** React Context + useReducer for global state;
  local useState for component state. No Redux unless complexity demands it.
- **Form handling:** React Hook Form + Zod for validation
- **Notifications (toast):** react-hot-toast

### Backend (Node)
- **Runtime:** Node.js 20+
- **Framework:** Express + TypeScript (tsx for dev, compiled for prod)
- **Database ODM:** Mongoose
- **Auth:** JWT (jsonwebtoken) — access token (15 min) + refresh token (7 days)
- **Password hashing:** bcrypt (12 rounds)
- **Email:** Gmail API with OAuth2 (not SendGrid, not Nodemailer SMTP)
- **File upload:** Multer (to memory buffer) → AWS SDK v3 → S3
- **Input sanitisation:** xss library
- **Rate limiting:** express-rate-limit on all auth endpoints
- **CORS:** configured explicitly — never use `cors({ origin: '*' })` in production
- **Environment:** dotenv — never hardcode secrets

### Database
- **MongoDB Atlas** (new Credex cluster — separate from VenPay/LOANlo/VenPayRL)
- **ODM:** Mongoose with TypeScript interfaces for every schema

### ML / Optimiser Service
- **Language:** Python 3.11+
- **Framework:** FastAPI
- **Optimiser:** PuLP (Linear Programming) — primary engine
- **ML models:** scikit-learn / XGBoost (credit risk model from LOANlo, ported)
- **Served via:** Uvicorn
- **Communication:** Node backend calls Python service via HTTP (axios to FastAPI)
- **Never called directly from frontend**

### Infrastructure
- **Frontend:** Vercel
- **Node backend:** Render or Railway
- **Python service:** Render (separate service)
- **File storage:** AWS S3 + KMS
- **Secrets:** environment variables only — never committed to git

---

## Project Structure

```
credex/
├── frontend/                    Next.js app
│   ├── app/                     App Router pages
│   │   ├── (auth)/              Login, register, forgot password
│   │   ├── (buyer)/             Buyer-only pages
│   │   ├── (supplier)/          Supplier-only pages
│   │   ├── (underwriter)/       Underwriter-only pages
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                  Base components (Button, Input, Modal, etc.)
│   │   ├── buyer/               Buyer-specific components
│   │   ├── supplier/            Supplier-specific components
│   │   ├── underwriter/         Underwriter-specific components
│   │   └── shared/              Used across roles
│   ├── hooks/                   Custom React hooks
│   ├── lib/                     API clients, utilities
│   ├── types/                   Shared TypeScript types
│   └── middleware.ts             Next.js middleware (route protection by role)
│
├── backend/                     Node + Express API
│   ├── src/
│   │   ├── models/              Mongoose models (one file per collection)
│   │   ├── controllers/         Business logic (one file per domain)
│   │   ├── routes/              Express routers (one file per domain)
│   │   ├── middleware/          auth.ts, ipWhitelist.ts, auditLog.ts, sanitise.ts
│   │   ├── services/            email.ts, s3.ts, optimizer.ts (calls Python), creditScore.ts
│   │   ├── utils/               helpers, constants, error classes
│   │   ├── types/               Shared TypeScript interfaces
│   │   └── server.ts            Entry point
│   └── tests/
│
└── ml-service/                  Python FastAPI service
    ├── main.py                  FastAPI app entry
    ├── routes/
    │   ├── optimizer.py         Cash flow optimisation endpoint
    │   ├── credit_risk.py       Credit risk prediction endpoint
    │   └── credit_score.py      Credit score computation endpoint
    ├── agents/                  Ported from VenPayRL
    │   ├── rule_agent.py
    │   ├── heuristic_agent.py
    │   ├── q_agent.py
    │   └── dqn_agent.py
    ├── models/                  Serialised ML models (.pkl files)
    └── requirements.txt
```

---

## MongoDB Schema — Collections Reference

17 collections. Full schema in `schema.md`. Summary:

| Collection | Purpose |
|---|---|
| User | Identity + auth for all roles |
| Company | Business profile (buyer/supplier/both) |
| CompanyMember | Links Users to Companies (extracted from Company.members) |
| Product | Supplier listings |
| RFQ | Buyer's request + negotiation history (pre-PO) |
| PurchaseOrder | Confirmed exchange — central transactional record |
| Payment | Individual payment events against a PO (immutable) |
| LoanType | Loan product catalogue |
| LoanApplication | Financing request linked to a PO |
| Document | KYC document metadata (file in S3) |
| DocumentAccessLog | Every document view — immutable audit |
| Review | Post-PO ratings (buyer→supplier, supplier→buyer, buyer→product) |
| CreditScore | Versioned credit scores per Company |
| ChatMessage | In-platform messages linked to RFQ or PO |
| Notification | In-platform notification events |
| Session | Active login sessions with TTL auto-expiry |
| AuditLog | Every significant mutation — immutable |
| RestorationRequest | Requests to restore soft-deleted records |

### Schema conventions to always follow:
- `isDeleted: boolean` + `deletedAt?: Date` on all major collections
- `{ timestamps: true }` on every schema
- Sparse unique indexes on optional unique fields (gstin, pan, cin)
- Text indexes on searchable string fields (Product.name, Company.name)
- Compound indexes on every pair of fields that appear together in queries
- Pre-find middleware to exclude soft-deleted documents by default —
  but ONLY check `if (!('isDeleted' in query))` before adding filter,
  so admin queries that explicitly include `isDeleted: true` are not blocked

---

## Authentication & Authorisation

### Token Strategy
- **Access token:** JWT, 15-minute expiry, contains `{ userId, role, companyId }`
- **Refresh token:** JWT, 7-day expiry, stored in httpOnly cookie
- **Session record:** created in MongoDB on login, destroyed on logout
- Every authenticated request updates `User.lastActivity` and `Session.lastActivity`
- Auto-logout: if `Date.now() - lastActivity > 15 minutes`, return 401 with
  code `SESSION_EXPIRED`

### Role-Based Access Control (RBAC)
All protected routes use the `authenticate` middleware followed by a `requireRole`
middleware. Example:

```typescript
// Only buyers can submit RFQs
router.post('/rfq', authenticate, requireRole('buyer'), rfqController.create)

// Only underwriters can approve loans
router.patch('/loan/:id/approve', authenticate, requireRole('underwriter'), loanController.approve)

// Admin routes — IP restricted first, then authenticate
router.get('/admin/users', ipWhitelistMiddleware, authenticate, requireRole('system_admin'), adminController.getUsers)
```

### Frontend Route Protection
Next.js middleware (`middleware.ts`) reads the access token from cookie and
redirects unauthorised users. Role-to-path mapping:

```
/buyer/*        → requires role: 'buyer'
/supplier/*     → requires role: 'supplier'
/underwriter/*  → requires role: 'underwriter'
/admin/*        → served from separate subdomain only (admin.credex.in)
```

### Admin Security
- Separate Next.js deployment on `admin.credex.in`
- IP allowlisting enforced at **infrastructure level** (Vercel/CDN) AND at
  **middleware level** in the backend
- Login requires: email + password + TOTP (authenticator app, not SMS OTP)
- Session timeout: 10 minutes for admins (vs 15 for regular users)
- All admin actions write to AuditLog with full before/after diff

---

## API Design Conventions

### URL Structure
```
/api/auth/...              Public auth routes
/api/buyer/...             Buyer-authenticated routes
/api/supplier/...          Supplier-authenticated routes
/api/underwriter/...       Underwriter-authenticated routes
/api/shared/...            Routes accessible by buyer + supplier (e.g. chat, notifications)
/api/admin/...             Admin-only routes (IP restricted)
/api/optimizer/...         Proxied to Python service (buyer-authenticated)
```

### Response Shape
Every API response follows this envelope:

```typescript
// Success
{
  success: true,
  data: T,
  message?: string
}

// Error
{
  success: false,
  error: string,        // human-readable message
  code?: string,        // machine-readable code (e.g. 'SESSION_EXPIRED', 'NOT_FOUND')
  details?: any         // validation errors etc.
}
```

Never return raw Mongoose documents to the client. Always map to a clean response
object that excludes sensitive fields (password, s3Key, verificationToken, etc.).

### Pagination
All list endpoints support cursor-based pagination:

```
GET /api/buyer/purchase-orders?limit=20&cursor=<lastId>
```

Response includes `nextCursor` for the next page. Never use offset pagination
on large collections — it degrades at scale.

### Error Handling
Centralised error handler in Express. All controllers use `try/catch` and call `next(error)`.
Never send error responses directly from controllers.

```typescript
// Custom error class
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code?: string
  ) { super(message) }
}

// Usage in controller
throw new AppError('RFQ not found', 404, 'NOT_FOUND')
```

---

## Core Feature Build Instructions

---

### Feature: Marketplace & Product Listings

**What it does:**
Suppliers create product/service listings. Buyers browse and search them.

**Build notes:**
- Product images: upload to S3 via Multer in-memory buffer. Store S3 URL in
  `Product.images[]`. Delete old S3 object when image is replaced.
- Search: MongoDB text index on `Product.name` and `Product.description`.
  Filters: category, city/state (via supplierId → Company lookup), min/max price,
  averageRating, acceptedFinancingMethods, isAvailable.
- `Product.averageRating` and `Product.totalReviews` are **denormalised** — updated
  in the Review controller when a review is submitted. Do not recompute on every
  product fetch (too slow at scale).
- `Product.lastPurchasedAt` — updated in the PO controller when a PO reaches
  `fulfilmentStatus: 'completed'`.
- Pagination: cursor-based on `_id`.
- A supplier can only edit/delete their own products. Verify `product.supplierId
  === req.user.companyId` in the controller.

**Scalability note:**
At 100k+ products, text search via MongoDB Atlas Search (Lucene-based) will outperform
native `$text`. Build with native text index first. Switch to Atlas Search when needed
without changing the API contract.

---

### Feature: RFQ & Negotiation

**What it does:**
A buyer submits an RFQ to a supplier for a specific product. Both parties can counter
with different terms (price, financing method, deadline, penalty rate) until one accepts
or declines. Each counter is appended to `RFQ.negotiationHistory`.

**Build notes:**
- On RFQ creation: validate that `product.supplierId` matches the `supplierId` in
  the request body. Never trust the client to send the correct supplierId.
- On counter: append to `negotiationHistory`, update all `proposed*` fields,
  set `status: 'countered'`.
- On acceptance: set `status: 'accepted'`, then immediately create a PurchaseOrder
  in the same controller function (same transaction if possible — use MongoDB sessions).
- The PO's `financingMethod`, `paymentDeadline`, `penaltyRate` come from the
  final accepted `proposed*` fields on the RFQ.
- `paymentDeadline` is computed as: `Date.now() + proposedPaymentDeadlineDays * 86400000`
- Notify both parties via email + Notification on every RFQ state change.
- RFQ expiry: if `expiresAt` is set and `Date.now() > expiresAt`, return the RFQ
  as `status: 'expired'`. Use a scheduled job (cron) to mark expired RFQs in bulk
  daily — do not check expiry on every read.

**Scalability note:**
`negotiationHistory` is an embedded array. In normal B2B negotiation this rarely
exceeds 10–20 entries per RFQ. Safe to embed. If you ever build an auction-style
feature with hundreds of bids, extract to a separate collection then.

---

### Feature: Purchase Order & Payment Tracking

**What it does:**
The PO is the confirmed exchange. Buyers make payments against it (partial or full).
Each payment is recorded as an immutable Payment document. The PO's `amountPaid`
and `amountRemaining` are updated accordingly.

**Build notes:**
- PO is created automatically when RFQ is accepted. Never expose a "create PO"
  endpoint directly — it must flow from RFQ acceptance.
- Payment flow:
  1. Buyer submits payment amount (≤ amountRemaining)
  2. Backend validates amount, creates Payment document
  3. Backend updates PO: `amountPaid += amount`, `amountRemaining -= amount`
  4. If `amountRemaining === 0`: set `paymentStatus: 'paid'`
  5. If `amountPaid > 0 && amountRemaining > 0`: set `paymentStatus: 'partially_paid'`
  6. Append to `PO.statusHistory`
  7. Write AuditLog entry
  8. Email both parties
- `Payment.wasOnTime` = `payment.paidAt <= purchaseOrder.paymentDeadline`
  (used by credit score engine)
- `Payment.penaltyAccrued`: compute days overdue × penaltyRate × amountPaid
  at time of payment. Store the computed value — don't recompute later.
- The PO is considered `fulfilmentStatus: 'completed'` only when both
  `paymentStatus === 'paid'` AND supplier marks it as `'delivered'`.
  Both conditions must be true. Reviews only unlock after `'completed'`.

**Scalability note:**
Payment is append-only and immutable — ideal for time-series archival later.
Index `paidAt` for the credit score engine's time-range queries.

---

### Feature: Cash Flow Optimiser

**What it does:**
Given a buyer's outstanding POs (deadlines, amounts, penalty rates) and their
cash position (current balance + expected daily inflows), the optimizer returns
an optimal day-by-day payment schedule that minimises total penalties while
keeping cash balance non-negative.

**Architecture:**
```
Buyer opens optimizer → Frontend calls Node backend
Node backend:
  1. Fetches all unpaid/partially_paid POs for this buyer from MongoDB
  2. Asks buyer for current cash balance + daily inflow forecast
     (manual input in V1; accounting software integration in V2)
  3. POSTs to Python FastAPI: POST /optimize
  4. Returns schedule to frontend
Python service:
  - Runs LP solver (PuLP) on the input data
  - Returns payment schedule + alerts + projected cash balance curve
```

**Python service — optimizer endpoint:**

```python
# POST /optimize
# Input:
{
  "currentCash": 500000,          # current balance in INR (paise? decide and be consistent)
  "dailyInflows": [               # expected inflows
    { "date": "2026-04-07", "amount": 50000 },
    { "date": "2026-04-10", "amount": 120000 }
  ],
  "payables": [
    {
      "purchaseOrderId": "abc123",
      "supplierName": "Acme Corp",
      "amountRemaining": 250000,
      "deadline": "2026-04-15",
      "penaltyRatePerDay": 0.05   # % per day
    }
  ]
}

# Output:
{
  "paymentSchedule": [
    {
      "date": "2026-04-10",
      "purchaseOrderId": "abc123",
      "supplierName": "Acme Corp",
      "amountToPay": 250000,
      "reason": "Pay today — penalty starts tomorrow and inflow of ₹1,20,000 received today makes this affordable."
    }
  ],
  "alerts": [
    {
      "purchaseOrderId": "abc123",
      "urgency": "high",
      "message": "Acme Corp payment deadline in 5 days. Penalty will be ₹125/day if missed."
    }
  ],
  "projectedCashBalance": [
    { "date": "2026-04-07", "balance": 500000 },
    { "date": "2026-04-08", "balance": 550000 },
    ...
  ]
}
```

**LP formulation (for the Python developer):**
- Decision variable: `pay[i][t]` = amount paid to PO `i` on day `t`
- Constraints:
  - Cash balance never goes negative on any day
  - Total paid per PO ≤ amountRemaining
  - No payment after a PO's deadline (unless penalty is modelled explicitly)
- Objective: minimise `sum(penaltyRate[i] × max(0, daysOverdue[i]) × amountRemaining[i])`
- Use PuLP with CBC solver (open source, no licence needed)

**Scalability note:**
For a buyer with 5–20 outstanding POs over a 90-day horizon, LP solves in milliseconds.
If a buyer ever has 500+ concurrent POs, consider switching to a heuristic pre-filter
before running LP on the top-priority subset.

---

### Feature: Loan & Financing Marketplace

**What it does:**
A buyer applies for a loan linked to a confirmed PO. Bank underwriters on the platform
review the application, request KYC documents, and approve or reject.

**Build notes:**
- Loan application can only be created for a PO with `paymentStatus !== 'paid'`
  (no point financing an already-paid order).
- Document upload flow:
  1. Client sends file via multipart/form-data
  2. Multer reads into memory buffer
  3. Backend generates S3 key: `credex/documents/{companyId}/{loanApplicationId}/{uuid}.{ext}`
  4. Upload to S3 with `ServerSideEncryption: 'aws:kms'`
  5. Store metadata in Document collection (s3Key, s3Bucket, NOT the full URL)
  6. Never return s3Key to client
- Document access (underwriter viewing a document):
  1. Underwriter requests document via `GET /api/underwriter/documents/:id/view`
  2. Backend verifies underwriter is assigned to the loan application
  3. Backend generates signed S3 URL: `getSignedUrl(s3Client, GetObjectCommand, { expiresIn: 900 })`
  4. Backend writes DocumentAccessLog entry
  5. Returns signed URL to underwriter's browser — URL expires in 15 minutes
- Loan status state machine — valid transitions only:
  ```
  draft → submitted
  submitted → under_review
  under_review → approved | rejected | documents_requested
  documents_requested → under_review (after docs uploaded)
  approved → disbursed
  disbursed → closed
  ```
  Enforce transitions in the controller — reject invalid transitions with 400.
- `assignedUnderwriterId` — in V1, manually assigned by admin or round-robin.
  Build a simple round-robin assigner in V2.
- `LoanApplication.creditRiskScore` — call Python service at submission time:
  `POST /credit-risk` with applicant's financial profile. Store result on the application.
  Underwriter sees this score as a decision aid (not the final word).

**Scalability note:**
Documents stored in S3 scale infinitely. The Document collection in MongoDB is only
metadata — lightweight. DocumentAccessLog will grow fast; archive to S3 after 6 months.

---

### Feature: Credit Score Engine

**What it does:**
Computes a 300–900 score for each Company based on their transaction and payment history.
Runs as a daily scheduled job. Each run inserts a new CreditScore document.

**Computation logic (Python service — POST /credit-score):**

```python
# Inputs (pulled from MongoDB via Node backend)
{
  "companyId": "...",
  "totalPOsCompleted": 47,
  "onTimePaymentRate": 0.89,       # payments made on/before deadline / total payments
  "averageReviewScore": 4.2,       # average of all received reviews
  "disputeRate": 0.02,             # disputed POs / total POs
  "loanRepaymentRate": 1.0,        # EMIs paid on time / total EMIs due (1.0 if no loans)
  "isVerified": true,
  "daysSinceFirstTransaction": 180
}

# Score formula (weighted, maps to 300–900):
base = 300
paymentComponent    = onTimePaymentRate × 250          # max 250 pts
volumeComponent     = min(totalPOsCompleted / 100, 1) × 100  # max 100 pts (caps at 100 POs)
reviewComponent     = (averageReviewScore / 5) × 100   # max 100 pts
disputePenalty      = disputeRate × -150               # up to -150 pts
loanComponent       = loanRepaymentRate × 100          # max 100 pts
verificationBonus   = 50 if isVerified else 0
tenureBonus         = min(daysSinceFirstTransaction / 365, 1) × 50  # max 50 pts

score = base + sum(all components), clamped to [300, 900]
```

**Tier mapping:**
```
300–499  → bronze
500–649  → silver
650–799  → gold
800–900  → platinum
```

**Scheduled job:**
- Node backend has a cron job (node-cron) that runs at 2:00 AM IST daily
- Fetches all active Companies
- For each company, aggregates their payment/review/loan data
- POSTs to Python /credit-score endpoint
- Inserts new CreditScore document
- Updates Company.creditScoreRef to the new document's _id

**Scalability note:**
At 10,000 active companies, daily batch computation takes seconds. At 1M+, switch to
incremental updates (only recompute companies with activity in the last 24 hours)
and consider a message queue (Bull/BullMQ) to process in parallel workers.

---

### Feature: Admin Panel

**What it does:**
System admins can view all platform data, restore soft-deleted records, terminate sessions,
manage user verification, and override any field. All actions are logged.

**Security rules — non-negotiable:**
- Served from `admin.credex.in` — separate Next.js deployment
- IP allowlisting enforced at Vercel/CDN level (environment variable: ALLOWED_ADMIN_IPS)
  AND at Express middleware level (`ipWhitelistMiddleware`)
- Login requires TOTP (Time-based One-Time Password via authenticator app)
  Use `speakeasy` or `otpauth` library. Never use SMS OTP for admin.
- Session timeout: 10 minutes inactivity
- All admin actions write AuditLog with full before/after diff

**Admin capabilities:**
- View all collections with filtering, sorting, pagination
- Soft delete and restore: User, Company, Product, RFQ, PurchaseOrder, LoanApplication
- Cancel payments (marks PO accordingly, writes AuditLog)
- View all active sessions; remote terminate any session
- View all loan applications and their documents
- View all AuditLog entries (read-only — AuditLog is never modified)
- Manage LoanTypes (create, edit, activate/deactivate)
- Override credit scores (with mandatory note written to AuditLog)
- Manage IP whitelist for admin accounts

**Build pattern for admin endpoints:**
```typescript
// Every admin controller function follows this pattern:
export const adminRestoreUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params
    const { reason } = req.body

    const user = await User.findOne({ _id: userId, isDeleted: true })
    if (!user) throw new AppError('User not found or not deleted', 404, 'NOT_FOUND')

    const before = { isDeleted: user.isDeleted, deletedAt: user.deletedAt }

    user.isDeleted = false
    user.deletedAt = undefined
    await user.save()

    // Always write audit log on admin actions
    await AuditLog.create({
      performedBy: req.user._id,
      performedByRole: req.user.role,
      ipAddress: req.ip,
      action: 'user.restore',
      entityType: 'User',
      entityId: user._id,
      changes: { isDeleted: { before: before.isDeleted, after: false } },
      note: reason,
      timestamp: new Date()
    })

    return res.json({ success: true, data: null, message: 'User restored successfully' })
  } catch (err) {
    next(err)
  }
}
```

---

### Feature: Email Notifications

**What it does:**
Every significant state change on the platform triggers an email to the relevant parties.

**Architecture:**
- Gmail API with OAuth2 (not SMTP, not SendGrid)
- Environment variables: `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`,
  `GMAIL_OAUTH_REFRESH_TOKEN`, `GMAIL_SENDER_ADDRESS`
- Central `emailService.ts` with a `sendEmail(to, subject, htmlBody)` helper
- Individual email template functions for each trigger:
  `sendRFQReceivedEmail`, `sendPOConfirmedEmail`, `sendPaymentDueReminderEmail`,
  `sendLoanApprovedEmail`, etc.
- Email sending is **fire-and-forget** in V1 — do not await email sends in the
  request/response cycle. Use `.catch(console.error)` to prevent unhandled rejections.
- In V2: move emails to a queue (Bull/BullMQ + Redis) for retry on failure.

**Email triggers — minimum required set:**

| Trigger | Recipients |
|---|---|
| RFQ submitted | Supplier |
| RFQ countered | Other party |
| RFQ accepted | Both |
| RFQ declined | Buyer |
| PO created | Both |
| Payment received | Supplier |
| Payment due (3 days before deadline) | Buyer |
| Payment overdue | Buyer + Supplier |
| Loan application submitted | Underwriter |
| Loan under review | Buyer |
| Loan approved | Buyer |
| Loan rejected | Buyer |
| Documents requested | Buyer |
| Documents uploaded | Underwriter |
| Review received | Target company |
| Account verified | User |
| Credit score updated (significant change ±50pts) | Company owner |
| Session terminated remotely | Affected user |

---

### Feature: Reviews & Ratings

**What it does:**
After a PO is completed, both buyer and supplier can review each other.
The buyer can also review the product. Three review types, one collection.

**Build notes:**
- Reviews only unlock when `PO.fulfilmentStatus === 'completed'` AND
  `PO.paymentStatus === 'paid'`. Enforce in the controller.
- One review per type per PO — enforced by compound unique index on
  `{ purchaseOrderId, reviewType }`.
- On review submission, update the target's aggregate rating:
  - For `buyer_to_product`: update `Product.averageRating` and `Product.totalReviews`
  - For `buyer_to_supplier` / `supplier_to_buyer`: update the equivalent fields
    on Company (add `averageRating` and `totalReviews` to Company schema)
  - Use MongoDB's `$inc` and a recomputation of the running average:
    `newAvg = (oldAvg × oldCount + newRating) / (oldCount + 1)`
- Mark `PO.buyerReviewed` or `PO.supplierReviewed` accordingly after submission.
- Trigger credit score recomputation for the reviewed company after review submission.

---

## Frontend Build Instructions

### Design System

**Colour palette (Credex):**
```
Primary:     #1A1A2E  (deep navy — trust, finance)
Accent:      #4F46E5  (indigo — action, interactive)
Success:     #10B981  (emerald — paid, verified, approved)
Warning:     #F59E0B  (amber — pending, due soon)
Danger:      #EF4444  (red — overdue, rejected, dispute)
Background:  #F8F9FA  (near-white — clean, professional)
Surface:     #FFFFFF  (card backgrounds)
Text:        #111827  (primary text)
Muted:       #6B7280  (secondary text, labels)
Border:      #E5E7EB  (card borders, dividers)
```

**Typography:**
- Headings: `DM Serif Display` (weight 400 only — it's a display face)
- Body / UI: `Inter` (weights 400, 500, 600)
- Monospace (amounts, IDs): `JetBrains Mono`
- Load via `next/font/google`

**Component conventions:**
- All base UI components live in `components/ui/` — Button, Input, Select, Modal,
  Badge, Card, Skeleton, Toast, Table, Pagination
- Never build one-off styled elements inline — always extract to a component
- Loading states: always show Skeleton components, never blank space
- Empty states: always show an illustrated empty state with a CTA, never blank space
- Error states: always show an error message with a retry action

### Key Page Patterns

**Dashboard (Buyer):**
- Hero metric cards: Cash balance, Total outstanding (sum of amountRemaining across POs),
  Next payment due (closest deadline), Credit score
- Cash flow optimizer widget: next 7 days of recommended payments
- Active POs list (compact, sorted by paymentDeadline ascending)
- Recent notifications (last 5)

**Supplier Discovery:**
- Search bar (prominent, above the fold)
- Filters sidebar: category, location, rating, financing methods, verified only
- Product card grid: image, name, supplier name + badge, price, rating, financing tags
- Infinite scroll (not pagination — better for browsing)

**RFQ / Negotiation View:**
- Timeline showing negotiation history (who countered what, when)
- Current proposed terms displayed prominently
- Counter form — only show fields that can be changed
- Chat panel alongside (linked to this RFQ)
- Accept / Counter / Decline actions with confirmation modals

**Cash Flow Optimizer:**
- Input panel: current balance, add inflow entries
- Payment schedule table: date | supplier | amount | reason
- Cash balance curve chart (Recharts LineChart)
- Alert cards for urgent payments (sorted by urgency)
- Explainer: "Why this schedule?" — show the optimizer's reasoning in plain language

---

## Scalability Principles

### Database
- **Indexes first** — before any query goes to production, verify its index exists.
  Run `explain()` on any query that touches more than 1,000 documents.
- **Avoid unbounded arrays** — embedded arrays that grow without limit (messages,
  log entries) should be extracted to their own collection. Current schema is clean on this.
- **Denormalise read-heavy aggregates** — `Product.averageRating`, `Company.averageRating`,
  `PO.amountRemaining` are stored computed values. Update them on write, don't recompute
  on every read.
- **Cursor pagination** — never use `.skip()` on large collections.
  Always paginate with `{ _id: { $gt: lastId } }`.

### Backend
- **Stateless API** — no in-memory state in the Node process. All state in MongoDB or Redis.
  This means you can scale horizontally by running multiple Node instances behind a load balancer.
- **Fire-and-forget for non-critical tasks** — emails, audit logs, notification inserts
  should not block the HTTP response. In V1, use `.catch()`. In V2, use a job queue.
- **Rate limit all auth endpoints** — login, register, OTP, password reset:
  max 10 requests per IP per 15 minutes.
- **Never block the event loop** — no synchronous file I/O, no heavy computation in Node.
  Heavy computation (optimizer, credit score) lives in Python.

### Python Service
- **FastAPI is async** — use `async def` for all endpoints.
- **The optimizer is stateless** — it takes inputs and returns outputs. No DB writes.
  This means it can scale horizontally trivially.
- **Model files (.pkl) are loaded once at startup** — not on every request.
  Use module-level globals for loaded models.
- **DQN training is CPU-intensive** — run in a background thread or process,
  never in the request thread.

### Frontend
- **Server Components by default** — use Next.js Server Components for data fetching.
  Only use Client Components when interactivity is required.
- **Image optimisation** — all images served via Next.js `<Image>` component.
  S3 URLs should be served via a CDN (CloudFront) in production.
- **Bundle size** — import only what you use from Recharts and Lucide.
  Avoid barrel imports.

---

## India-Specific Considerations

- **Currency:** Always display amounts in INR (₹). Store as integers in paise
  (1 rupee = 100 paise) to avoid floating point errors. Display by dividing by 100.
  Example: store `250000` for ₹2,500.
- **GST:** GSTIN format validation: 15-character alphanumeric.
  Use regex: `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/`
- **PAN:** 10-character alphanumeric. Regex: `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/`
- **Phone numbers:** Store with country code. Validate Indian numbers:
  `/^(\+91)?[6-9]\d{9}$/`
- **Date/time:** Always store UTC in MongoDB. Display in IST (UTC+5:30) to users.
  Use `date-fns-tz` or `dayjs` with timezone plugin.
- **UPI reference numbers:** 12-digit numeric string. Store as string, not number.
- **Financial amounts:** Indian numbering system for display
  (lakhs and crores, not millions and billions):
  Use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

---

## What Not To Build (V1 Scope Limits)

Do not build these in V1 — they are intentionally deferred:

- **Actual money movement** through the platform (payment gateway integration)
  → V1 tracks payments manually; V2 integrates Razorpay/Cashfree
- **WhatsApp Business API notifications** → V1 is email only
- **Mobile app** → V1 is web only (mobile-responsive)
- **Accounting software integrations** (Tally, Zoho, QuickBooks) → V1 cash inflows
  are manually entered in the optimizer
- **Multi-user companies** (team members per company) → V1 is one user per company;
  CompanyMember collection is in the schema but not surfaced in UI
- **EMI repayment schedule** (detailed month-by-month table) → V1 tracks
  `totalRepaid` and `nextEmiDate` only
- **Escrow** → not in scope
- **Supplier inventory management** beyond a simple stock count
- **Multi-currency** → INR only

---

## Handoff Checklist (Before Passing To Another AI)

If you are handing this task to another AI assistant, verify and share:

- [ ] This `skills-instructions.md` file
- [ ] `schema.md` — the full MongoDB schema
- [ ] `idea.md` — what Credex is
- [ ] `roadmap.md` — what's built in which order
- [ ] Any model files already written (`/backend/src/models/`)
- [ ] Any controller files already written
- [ ] The current phase and what was last completed
- [ ] Any deviations from this document that were made and why

---

*Document version: 1.0*
*Maintained by: Aniruddh Ballal*
*Last updated: April 2026*
*This document supersedes any conflicting instructions given in chat.*