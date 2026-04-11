# Credex — Backend Fixes Needed

**Prepared by:** Cross-reference of backend and frontend READMEs  
**Date:** April 2026  
**Priority:** Fix all of these before Phase 5 testing begins

Each issue below specifies exactly what the backend needs to add, change, or expose
differently. The frontend team is working from their own fixes document simultaneously —
do not change your endpoints to match the frontend's wrong assumptions where this document
tells you you are correct. Trust this document.

---

## 🔴 Critical — These break entire features right now

---

### FIX 1 — Entire underwriter flow uses wrong URL namespace

**The problem:**
The frontend calls a completely different set of URLs for underwriters than what the backend built.

Frontend expects:
```
GET  /api/underwriter/queue?status=&cursor=&limit=
GET  /api/underwriter/applications/:id
POST /api/underwriter/applications/:id/request-docs
POST /api/underwriter/applications/:id/approve
POST /api/underwriter/applications/:id/reject
GET  /api/underwriter/documents/:id/view
```

Backend built:
```
GET  /api/loans                              (underwriter sees all non-draft)
GET  /api/loans/:id
POST /api/loans/:id/request-documents        (note: "documents" not "docs")
POST /api/loans/:id/approve
POST /api/loans/:id/reject
GET  /api/documents/:id/url                  (completely different path)
```

**Decision: Add the `/api/underwriter/` namespace as aliases in the backend.**
Reason: The frontend has 3 pages all wired to `/api/underwriter/*`. Changing 3 pages
of frontend is more disruptive than adding route aliases. Keep the existing `/api/loans/*`
routes as-is and add new underwriter-scoped routes that proxy to the same controllers.

**What to build — add a new `routes/underwriter.routes.ts`:**

```typescript
// All routes require authenticate + requireRole('underwriter', 'system_admin')

// GET /api/underwriter/queue?status=&cursor=&limit=
// → same controller as GET /api/loans (already filters for underwriter role)
// → rename query param: frontend uses ?status=, backend uses ?status= ✓ (already matches)
router.get('/queue', authenticate, requireRole('underwriter', 'system_admin'), loanController.getLoans)

// GET /api/underwriter/applications/:id
// → same controller as GET /api/loans/:id
// → MUST populate: company, documents[], po (see FIX 2)
router.get('/applications/:id', authenticate, requireRole('underwriter', 'system_admin'), loanController.getLoanById)

// POST /api/underwriter/applications/:id/request-docs
// → same controller as POST /api/loans/:id/request-documents
// NOTE: frontend sends { note } — backend expects { note } ✓ matches
router.post('/applications/:id/request-docs', authenticate, requireRole('underwriter', 'system_admin'), loanController.requestDocuments)

// POST /api/underwriter/applications/:id/approve
// → same controller as POST /api/loans/:id/approve
// NOTE: frontend sends { approvedAmount, interestRate, note? }
//       backend expects { approvedAmount, approvedInterestRate, approvedTenureMonths, emiAmount?, note? }
// → See FIX 3 for the field name mismatch on approve
router.post('/applications/:id/approve', authenticate, requireRole('underwriter', 'system_admin'), loanController.approveLoan)

// POST /api/underwriter/applications/:id/reject
// → same controller as POST /api/loans/:id/reject
// NOTE: frontend sends { reason } — backend expects { reason, note? } ✓ compatible
router.post('/applications/:id/reject', authenticate, requireRole('underwriter', 'system_admin'), loanController.rejectLoan)

// GET /api/underwriter/documents/:id/view
// → same controller as GET /api/documents/:id/url
// → must return { url: string } (signed 15-min URL) — see FIX 4 for response shape
router.get('/documents/:id/view', authenticate, requireRole('underwriter', 'system_admin'), documentController.getSignedUrl)
```

Register in `server.ts`:
```typescript
app.use('/api/underwriter', underwriterRoutes)
```

---

### FIX 2 — Three dashboard endpoints are completely missing

**The problem:**
The frontend's buyer, supplier, and underwriter dashboards each make a single aggregated
API call that the backend never built. These pages will show blank/error on load.

**Missing endpoints:**
```
GET /api/buyer/dashboard
GET /api/supplier/dashboard
GET /api/underwriter/dashboard
```

**What each must return:**

#### `GET /api/buyer/dashboard` (requires authenticate + buyer role + company)
```typescript
{
  success: true,
  activePOs: number,           // count of POs where paymentStatus !== 'paid' AND status !== 'cancelled'
  totalOutstanding: number,    // sum of amountRemaining across all unpaid/partially_paid POs (paise)
  nextDeadline: {              // the PO with the nearest paymentDeadline
    purchaseOrderId: string,
    supplierName: string,
    amountRemaining: number,   // paise
    paymentDeadline: string    // ISO date
  } | null,
  creditScore: {
    score: number,
    tier: string
  } | null,
  optimizerAlerts: {           // POs where deadline is within 7 days and not fully paid
    purchaseOrderId: string,
    supplierName: string,
    amountRemaining: number,
    paymentDeadline: string,
    urgency: 'high' | 'medium' | 'low'
  }[]
}
```

Implementation: aggregate from PurchaseOrder + CreditScore collections.
`optimizerAlerts`: query POs where `paymentDeadline <= now + 7 days` AND `paymentStatus !== 'paid'`.

#### `GET /api/supplier/dashboard` (requires authenticate + supplier role + company)
```typescript
{
  success: true,
  activeListings: number,       // count of non-deleted, isAvailable products
  pendingRFQs: number,          // count of RFQs where supplierId = me AND status = 'pending'
  totalReceivable: number,      // sum of amountRemaining on POs where supplierId = me (paise)
  averageRating: number,        // company.averageRating
  incomingRFQs: RFQ[],          // last 5 pending RFQs, populated with buyerId.name + productId.name
  activePOs: PurchaseOrder[]    // last 5 POs where paymentStatus !== 'paid', populated
}
```

#### `GET /api/underwriter/dashboard` (requires authenticate + underwriter/admin role)
```typescript
{
  success: true,
  queueCount: number,           // loans in 'submitted' status (unassigned)
  approvedToday: number,        // loans approved today (approvedAt date = today)
  rejectedToday: number,        // loans rejected today
  pendingDocs: number,          // loans in 'documents_requested' status
  queue: LoanApplication[]      // last 10 submitted/under_review loans, populated with company + loanType
}
```

**Create a new `controllers/dashboard.controller.ts` and `routes/dashboard.routes.ts`.**
Register three separate route groups:
```typescript
app.use('/api/buyer', buyerDashboardRoutes)       // GET /api/buyer/dashboard
app.use('/api/supplier', supplierDashboardRoutes) // GET /api/supplier/dashboard
app.use('/api/underwriter', underwriterRoutes)    // GET /api/underwriter/dashboard (merge with FIX 1)
```

---

### FIX 3 — Document upload for loans uses wrong URL

**The problem:**
Frontend uploads KYC documents to:
```
POST /api/loans/:id/documents
```

Backend has document upload at:
```
POST /api/documents
```
with body `{ loanApplicationId, documentType }`.

**Decision: Add the loan-scoped upload route as an alias.**

Add to `loan.routes.ts`:
```typescript
// POST /api/loans/:id/documents (multipart, field: 'document')
// Extracts loanApplicationId from URL param, passes to document controller
router.post('/:id/documents',
  authenticate,
  requireCompany,
  upload.single('document'),
  async (req, res, next) => {
    req.body.loanApplicationId = req.params.id  // inject from URL
    return documentController.uploadDocument(req, res, next)
  }
)
```

This keeps all document storage logic in `document.controller.ts` unchanged.

---

### FIX 4 — Signed document URL response shape mismatch

**The problem:**
Backend's `GET /api/documents/:id/url` returns (inferred from README):
```json
{ "success": true, "signedUrl": "https://..." }
```

Frontend expects from `GET /api/underwriter/documents/:id/view`:
```json
{ "url": "https://..." }
```

**Fix in `document.controller.ts`** — ensure the signed URL response always includes both:
```typescript
return res.json({
  success: true,
  url: signedUrl,           // frontend expects this field name
  signedUrl: signedUrl,     // keep for backward compat if any other consumer uses it
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
})
```

---

### FIX 5 — Loan approve field name mismatch

**The problem:**
Frontend's approve modal sends:
```json
{ "approvedAmount": 25000000, "interestRate": 12.5, "note": "..." }
```

Backend expects:
```json
{ "approvedAmount": 25000000, "approvedInterestRate": 12.5, "approvedTenureMonths": 12, "emiAmount": 0, "note": "..." }
```

Two issues:
1. Frontend sends `interestRate`, backend reads `approvedInterestRate`
2. Frontend doesn't send `approvedTenureMonths` — backend may reject or store undefined

**Fix in `loan.controller.ts` — approveLoan function:**
Accept both field names and make tenure optional:
```typescript
const {
  approvedAmount,
  approvedInterestRate,
  interestRate,                          // accept frontend's field name
  approvedTenureMonths,
  emiAmount,
  note
} = req.body

const resolvedInterestRate = approvedInterestRate ?? interestRate  // accept either
const resolvedTenure = approvedTenureMonths ?? loan.requestedTenureMonths  // fallback to requested
```

---

### FIX 6 — Optimizer endpoint is missing from Node backend

**The problem:**
Frontend calls:
```
POST /api/optimizer/schedule
```

This route does not appear anywhere in the backend README. The Python ML service has
`POST /optimize` but there is no Node proxy route at `/api/optimizer/schedule`.

**Fix — create `routes/optimizer.routes.ts`:**
```typescript
// POST /api/optimizer/schedule
// Fetches buyer's active POs from MongoDB, merges with request body, proxies to Python
router.post('/schedule', authenticate, requireRole('buyer'), async (req, res, next) => {
  try {
    const { currentCash, dailyInflows } = req.body
    const companyId = req.user.companyId

    // Fetch all unpaid/partially_paid POs for this buyer
    const pos = await PurchaseOrder.find({
      buyerId: companyId,
      paymentStatus: { $in: ['unpaid', 'partially_paid'] },
      isDeleted: { $ne: true }
    }).populate('supplierId', 'name')

    const payables = pos.map(po => ({
      purchaseOrderId: po._id,
      supplierName: (po.supplierId as any).name,
      amountRemaining: po.amountRemaining,
      deadline: po.paymentDeadline,
      penaltyRatePerDay: po.penaltyRate
    }))

    // Call Python ML service
    const result = await mlService.optimize({ currentCash, dailyInflows, payables })

    return res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})
```

Register in `server.ts`:
```typescript
app.use('/api/optimizer', optimizerRoutes)
```

---

## 🟠 Important — These cause partial failures or wrong data

---

### FIX 7 — RFQ create payload field name mismatch

**The problem:**
Frontend sends RFQ creation with these field names:
```json
{
  "productId": "...",
  "supplierId": "...",
  "proposedPrice": 250000,
  "proposedQuantity": 10,
  "proposedFinancingMethod": "deferred_30",
  "proposedPaymentDeadlineDays": 30,
  "proposedPenaltyRate": 0.05,
  "message": "..."
}
```

Backend expects (from README):
```json
{
  "productId": "...",
  "quantity": "...",
  "financingMethod": "...",
  "proposedPrice": "...",
  "paymentDeadlineDays": "...",
  "penaltyRate": "...",
  "message": "..."
}
```

Mismatched fields:
| Frontend sends | Backend expects |
|---|---|
| `proposedQuantity` | `quantity` |
| `proposedFinancingMethod` | `financingMethod` |
| `proposedPaymentDeadlineDays` | `paymentDeadlineDays` |
| `proposedPenaltyRate` | `penaltyRate` |
| `supplierId` (extra field) | not expected — backend derives from product |

**Fix in `rfq.controller.ts` — createRFQ:**
Accept both naming conventions:
```typescript
const {
  productId,
  quantity,
  proposedQuantity,                              // accept frontend name
  financingMethod,
  proposedFinancingMethod,                       // accept frontend name
  proposedPrice,
  paymentDeadlineDays,
  proposedPaymentDeadlineDays,                   // accept frontend name
  penaltyRate,
  proposedPenaltyRate,                           // accept frontend name
  message
} = req.body

const resolvedQuantity = quantity ?? proposedQuantity
const resolvedFinancing = financingMethod ?? proposedFinancingMethod
const resolvedDeadlineDays = paymentDeadlineDays ?? proposedPaymentDeadlineDays
const resolvedPenaltyRate = penaltyRate ?? proposedPenaltyRate
// supplierId from frontend is ignored — always derive from product lookup
```

---

### FIX 8 — Loan create payload field name mismatch

**The problem:**
Frontend sends:
```json
{
  "purchaseOrderId": "...",
  "loanTypeId": "working_capital",
  "requestedAmount": 25000000,
  "tenureMonths": 12,
  "purpose": "..."
}
```

Backend expects:
```json
{
  "loanTypeId": "...",
  "requestedAmount": "...",
  "requestedTenureMonths": 12,
  "purpose": "...",
  "purchaseOrderId?": "..."
}
```

Mismatch: frontend sends `tenureMonths`, backend reads `requestedTenureMonths`.

**Fix in `loan.controller.ts` — createLoan:**
```typescript
const { loanTypeId, requestedAmount, requestedTenureMonths, tenureMonths, purpose, purchaseOrderId } = req.body
const resolvedTenure = requestedTenureMonths ?? tenureMonths  // accept either
```

---

### FIX 9 — Payment payload field name mismatch

**The problem:**
Frontend sends payment with:
```json
{ "amount": 125000, "method": "upi", "reference": "UTR123456789012" }
```

Backend expects:
```json
{ "amount": 125000, "method": "upi", "referenceNumber": "UTR123456789012", "paidAt?": "...", "note?": "..." }
```

Mismatch: frontend sends `reference`, backend reads `referenceNumber`.

**Fix in `payment.controller.ts`:**
```typescript
const { amount, method, referenceNumber, reference, paidAt, note } = req.body
const resolvedReference = referenceNumber ?? reference  // accept either
```

---

### FIX 10 — Review query param mismatch

**The problem:**
Frontend calls:
```
GET /api/reviews?companyId=<id>
```

Backend accepts:
```
GET /api/reviews?targetCompanyId=<id>&targetProductId=<id>&reviewType=...
```

Frontend sends `companyId`, backend reads `targetCompanyId`.

**Fix in `review.controller.ts` — getReviews:**
```typescript
const { targetCompanyId, companyId, targetProductId, reviewType } = req.query
const resolvedCompanyId = targetCompanyId ?? companyId  // accept either
```

---

### FIX 11 — Products search uses `cursor` but backend expects `lastId`

**The problem:**
Frontend calls:
```
GET /api/products?cursor=<id>&limit=20
```

Backend implements cursor pagination with `lastId` param:
```
GET /api/products?lastId=<id>&limit=20
```

Same mismatch exists on `/api/rfqs`, `/api/purchase-orders`, `/api/notifications`.

**Fix in each affected controller — accept both param names:**
```typescript
// In product.controller.ts, rfq.controller.ts, purchaseOrder.controller.ts, notification.controller.ts
const { lastId, cursor, limit = '20' } = req.query
const resolvedCursor = lastId ?? cursor
// Use resolvedCursor in the MongoDB query: { _id: { $gt: resolvedCursor } }
```

Affected controllers:
- `product.controller.ts` — getProducts, getMyListings
- `rfq.controller.ts` — getRFQs
- `purchaseOrder.controller.ts` — getPurchaseOrders
- `notification.controller.ts` — getNotifications

---

### FIX 12 — Response shape inconsistency

**The problem:**
Backend README states responses return fields at root level (no `data` wrapper):
```json
{ "success": true, "user": {...} }
```

Frontend README states it expects a `data` wrapper:
```json
{ "success": true, "data": {...}, "message": "optional" }
```

And for paginated endpoints, frontend expects:
```json
{ "success": true, "data": { "items": [], "nextCursor": "...", "total": 0 } }
```

This is the most pervasive mismatch. It means every single list endpoint will fail
to render on the frontend.

**Decision: Backend adopts the wrapper format** — it is the cleaner convention
and matches the `skills-instructions.md` spec.

**Fix: Create a response helper in `utils/response.ts`:**
```typescript
export const sendSuccess = (res: Response, data: any, message?: string, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data, message })
}

export const sendPaginated = (res: Response, items: any[], nextCursor: string | null, total?: number) => {
  return res.json({ success: true, data: { items, nextCursor, total } })
}

export const sendError = (res: Response, message: string, statusCode = 400, code?: string) => {
  return res.status(statusCode).json({ success: false, error: message, code })
}
```

**Then update every controller** to use `sendSuccess` / `sendPaginated` / `sendError`
instead of `res.json({ success: true, ...fields })`.

This is tedious but mechanical. Work through one controller at a time.
Priority order: auth → users → companies → products → rfqs → purchase-orders → loans → rest.

---

### FIX 13 — `isVerified` filter on products endpoint missing

**The problem:**
Frontend discover page calls:
```
GET /api/products?isVerified=true
```

Backend README does not list `isVerified` as a supported filter on `/api/products`.
`isVerified` is a property of the supplier's Company, not the Product itself.

**Fix in `product.controller.ts` — getProducts:**
Add a join/lookup when `isVerified` filter is present:
```typescript
if (req.query.isVerified === 'true') {
  // Get verified company IDs first, then filter products by supplierId
  const verifiedCompanies = await Company.find({ isVerified: true }).select('_id')
  const verifiedIds = verifiedCompanies.map(c => c._id)
  query.supplierId = { $in: verifiedIds }
}
```

---

## 🟡 Minor — Small gaps, easy fixes

---

### FIX 14 — `GET /api/loans/:id` must return populated documents array

**The problem:**
Loan detail page (`/buyer/loans/[id]`) expects the loan response to include
a `documents[]` array populated with document metadata. Backend likely returns
only the loan document without joining the Document collection.

**Fix in `loan.controller.ts` — getLoanById:**
After fetching the loan, fetch related documents separately and attach:
```typescript
const loan = await LoanApplication.findById(id).populate('loanTypeId companyId applicantId assignedUnderwriterId purchaseOrderId')
const documents = await Document.find({ loanApplicationId: id, isDeleted: { $ne: true } })
  .select('-storageKey -storageBucket')  // never return storage keys

return sendSuccess(res, { ...loan.toObject(), documents })
```

---

### FIX 15 — `GET /api/purchase-orders` must support `paymentStatus=unpaid,partially_paid`

**The problem:**
Loan apply page (step 1) fetches eligible POs with:
```
GET /api/purchase-orders?paymentStatus=unpaid,partially_paid&role=buyer
```

Backend likely handles `paymentStatus` as a single value, not a comma-separated list.

**Fix in `purchaseOrder.controller.ts`:**
```typescript
const { paymentStatus } = req.query
if (paymentStatus) {
  const statuses = (paymentStatus as string).split(',').map(s => s.trim())
  query.paymentStatus = statuses.length === 1 ? statuses[0] : { $in: statuses }
}
```

---

### FIX 16 — `GET /api/rfqs/:id` must return populated `buyerId`, `supplierId`, `productId`

Backend README does not explicitly mention population on the single RFQ fetch.
Frontend negotiation page directly accesses `rfq.buyerId.name`, `rfq.supplierId.name`,
`rfq.productId.name`.

**Fix in `rfq.controller.ts` — getRFQById:**
```typescript
const rfq = await RFQ.findById(id)
  .populate('buyerId', 'name logo type trustBadge isVerified')
  .populate('supplierId', 'name logo type trustBadge isVerified')
  .populate('productId', 'name images basePrice category')
```

---

### FIX 17 — `GET /api/purchase-orders/:id` must return populated fields

Same issue as FIX 16 — PO detail page accesses `po.buyerId.name`, `po.supplierId.name`,
`po.productId.name`.

**Fix in `purchaseOrder.controller.ts` — getPurchaseOrderById:**
```typescript
const po = await PurchaseOrder.findById(id)
  .populate('buyerId', 'name logo type trustBadge isVerified city state')
  .populate('supplierId', 'name logo type trustBadge isVerified city state')
  .populate('productId', 'name images basePrice category priceUnit')
  .populate('rfqId', 'history currentFinancingMethod currentPaymentDeadlineDays')
```

---

## Summary — Fix Priority Order

Work through fixes in this order to unblock the most functionality fastest:

| Priority | Fix | Impact |
|---|---|---|
| 1 | FIX 12 — Response wrapper | Every single page |
| 2 | FIX 2 — Dashboard endpoints | All three dashboards |
| 3 | FIX 1 — Underwriter namespace | Entire underwriter flow |
| 4 | FIX 6 — Optimizer route | Cash flow page |
| 5 | FIX 3 — Loan document upload URL | Document upload |
| 6 | FIX 4 — Signed URL response shape | Document viewing |
| 7 | FIX 5 — Approve field names | Loan approval |
| 8 | FIX 7 — RFQ create fields | RFQ submission |
| 9 | FIX 8 — Loan create tenure field | Loan creation |
| 10 | FIX 9 — Payment reference field | Payment recording |
| 11 | FIX 11 — cursor vs lastId | All paginated lists |
| 12 | FIX 10 — Review query param | Review listing |
| 13 | FIX 13 — isVerified product filter | Discover page |
| 14 | FIX 14 — Loan documents populated | Loan detail |
| 15 | FIX 15 — Multiple paymentStatus values | Loan apply step 1 |
| 16 | FIX 16 — RFQ populate | Negotiation page |
| 17 | FIX 17 — PO populate | PO detail page |

---

*Document version: 1.0*  
*Cross-referenced against: credexBackendReadme.md + credexFrontendReadme.md*  
*Do not change endpoints that are correct — only apply the fixes listed here*