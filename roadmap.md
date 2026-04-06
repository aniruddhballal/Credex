# Credex — Build Roadmap

## Context

This is not a greenfield project. Three working products already exist:
- **VenPay** — marketplace, product listings, payment tracking, reviews
- **LOANlo** — loan origination, document vault, underwriter workflow, admin panel,
  session management, email system, credit risk ML microservice
- **VenPayRL** — multi-agent cash flow simulation (rule, heuristic, Q-table, DQN)

The task is **Option A: migrate and merge** — rebuild as one unified platform (Credex)
with a shared codebase, shared database, and shared intelligence layer.
The three old deployments remain live independently.

---

## Guiding Principles For This Build

1. **Don't rebuild what already works well** — carry logic forward, don't rewrite for the sake of it
2. **Tailwind throughout** — VenPay's MUI is the only outlier; Credex standardises on Tailwind
3. **One database, one schema** — the credit score and optimizer only work with unified data
4. **Python microservice for intelligence** — keep Node for API/business logic,
   Python for ML/optimization (already established in LOANlo's credit-risk-ml service)
5. **LOANlo's backend is the most mature** — its auth, session management, audit logging,
   email system, and admin architecture should be the foundation Credex builds on

---

## Phase 0 — Schema Design & Project Setup
**Time estimate: 1–2 weeks**
**Do this before writing any feature code**

This is the most important phase. The unified MongoDB schema is the backbone of everything.

### Unified MongoDB Collections

```
users                    Core identity — all roles (buyer, supplier, underwriter, admin)
companies                Company/org profile linked to user(s)
products                 Supplier listings
rfqs                     Buyer requests (Request for Quotation)
purchase_orders          Confirmed exchanges (PO) — links buyer, supplier, product
payments                 Payment records linked to POs (partial, full, deferred)
loan_applications        Linked to POs and buyer company
loan_documents           KYC documents linked to loan applications
document_access_logs     Every document view — who, when (from LOANlo)
reviews                  Post-PO reviews — buyer reviews supplier and vice versa
notifications            All notification events per user
sessions                 Active login sessions (from LOANlo)
login_audit              Login history with IP, device (from LOANlo)
audit_logs               Every mutation — actor, action, timestamp, IP (from LOANlo)
credit_scores            Computed scores per company, versioned over time
chat_messages            In-platform chat linked to RFQ or PO
```

### Tasks
- [ ] Design full schema for each collection with all fields, types, indexes
- [ ] Define relationships (which fields reference which other collections)
- [ ] Define soft delete strategy (deletedAt field on all major collections)
- [ ] Set up new MongoDB Atlas cluster for Credex
- [ ] Set up new GitHub repository (monorepo or separate frontend/backend/ml repos)
- [ ] Set up project structure for all three services:
  - `/frontend` — Next.js
  - `/backend` — Node + Express + TypeScript
  - `/ml-service` — Python + FastAPI

---

## Phase 1 — Backend Foundation
**Time estimate: 3–4 weeks**
**Build the API before the UI**

Start with the Node backend. This is where LOANlo's architecture is most reusable.

### Auth & Users (carry from LOANlo, extend for new roles)
- [ ] User model with roles: buyer, supplier, underwriter, system_admin
- [ ] JWT-based auth (access token + refresh token)
- [ ] Register, login, logout endpoints
- [ ] OTP via email (Gmail API + OAuth2 — carry from LOANlo)
- [ ] Password reset (token-based — carry from LOANlo)
- [ ] Session model — track all active sessions per user (carry from LOANlo)
- [ ] Auto-logout after 15 min inactivity (carry from LOANlo)
- [ ] Remote session termination (carry from LOANlo)
- [ ] IP allowlisting middleware for system_admin routes
- [ ] Role-based route protection middleware (RBAC)
- [ ] Audit log middleware — log every mutation with actor + IP (carry from LOANlo)
- [ ] XSS sanitisation middleware (carry from LOANlo)
- [ ] Input validation layer

### Company & Supplier Profiles
- [ ] Company model (linked to user)
- [ ] CRUD endpoints for company profile
- [ ] Profile picture upload (AWS S3, replace Cloudinary)

### Products & Listings
- [ ] Product model (linked to supplier/company)
- [ ] CRUD endpoints for product listings
- [ ] Image upload to S3
- [ ] Product search endpoint (text search + filters: category, location, rating,
      financing options accepted)

### RFQ & Purchase Orders
- [ ] RFQ model + endpoints (create, view, counter, accept, reject)
- [ ] PO model + endpoints (created on RFQ acceptance)
- [ ] PO includes: financing method, payment deadline, penalty rate, status
- [ ] Payment model + endpoints (record partial/full payments against PO)
- [ ] Status transitions: rfq_pending → rfq_countered → rfq_accepted → po_active
  → payment_pending → partially_paid → paid → completed

### Reviews
- [ ] Review model + endpoints
- [ ] Enforce: review only unlocks after PO status = completed
- [ ] Aggregate rating computation for products, suppliers, buyers

### Email Notifications (carry Gmail API + OAuth2 from LOANlo)
- [ ] Notification triggers for every status change:
  RFQ received, counter made, PO confirmed, payment due (3 days before),
  payment received, review posted, account verified
- [ ] Modular email template system (extend LOANlo's template architecture)

---

## Phase 2 — Loan & Document Vault (carry from LOANlo)
**Time estimate: 2–3 weeks**
**Most of this logic already exists — port and adapt**

### Loan Applications
- [ ] Loan application model (linked to PO + buyer company)
- [ ] Multi-step application form endpoints
- [ ] Loan types: working capital, LAP, invoice discounting, others
- [ ] Loan status state machine (carry from LOANlo):
  pending → under_review → approved / rejected / request_documents → pending
- [ ] Underwriter actions: approve, reject, request additional documents

### Document Vault (upgrade from LOANlo)
- [ ] Migrate from LOANlo's storage to AWS S3 + KMS
- [ ] Signed expiring URLs only (no public S3 links)
- [ ] Document type tagging (GST, PAN, incorporation cert, ITR, bank statements, etc.)
- [ ] document_access_logs — every view recorded (carry from LOANlo)
- [ ] Conflict resolution: handle concurrent document actions by applicant + underwriter

### Email Notifications for Loans
- [ ] Application submitted, under review, approved, rejected,
      documents requested, documents uploaded, restoration (carry from LOANlo)

---

## Phase 3 — Python ML Microservice
**Time estimate: 2–3 weeks**
**Port VenPayRL engine to Python; integrate LOANlo's credit risk model**

### Cash Flow Optimiser
- [ ] FastAPI service setup
- [ ] Port simulation engine from VenPayRL TypeScript → Python
- [ ] Port agent logic:
  - Rule-based agent
  - Heuristic agent
  - Q-table agent (with persistent weights — serialize to disk/DB)
  - DQN agent (move off main thread — use Python multiprocessing or background worker)
- [ ] New endpoint: POST /optimize
  - Input: buyer's current cash balance, daily inflow forecast, list of active POs
    (amount, deadline, penalty rate) — all pulled from Credex DB
  - Output: day-by-day payment schedule + alert flags
- [ ] Explainability layer — plain language reason for each recommendation
- [ ] Node backend calls /optimize and returns results to frontend

### Credit Risk Model (carry from LOANlo)
- [ ] XGBoost .pkl model already exists — reuse in the same FastAPI service
- [ ] POST /credit-risk endpoint (already integrated in LOANlo, port to new service)
- [ ] Extend inputs to include Credex transaction data (not just loan application data)

### Credit Score Engine (new)
- [ ] POST /credit-score endpoint
  - Inputs: payment history, timeliness rate, dispute count, order volume,
    review average, verification status
  - Output: numerical score (300–900 scale) + tier label
- [ ] Scheduled job: recompute credit scores for all active users daily

---

## Phase 4 — Frontend (Next.js)
**Time estimate: 4–6 weeks**
**Build after backend APIs are stable**

### Design System
- [ ] Tailwind CSS configuration — define colour palette, typography, spacing
- [ ] Consider VenPayRL's aesthetic as inspiration: warm, clean, modern
  (#F5F3EF cream, DM Serif Display for headings, Inter for body)
- [ ] Component library: buttons, inputs, modals, cards, tables, skeletons,
      toast notifications — build these first before pages

### Pages — Buyer
- [ ] Auth: register, login, forgot password, reset password
- [ ] Dashboard: overview of active POs, payment schedule from optimizer,
      credit score, notifications
- [ ] Supplier discovery: search, browse, filters
- [ ] Supplier profile page (with products, reviews, credit score/badge)
- [ ] Product detail page
- [ ] RFQ submission flow
- [ ] Negotiation view (counter offers, chat)
- [ ] Active POs list + individual PO detail
- [ ] Payment flow (mark payment, partial payment)
- [ ] Cash flow optimizer view (schedule table, alert list, explainability)
- [ ] Loan application flow (multi-step)
- [ ] Loan status tracker
- [ ] Profile page + edit profile
- [ ] Reviews (submit, view)

### Pages — Supplier
- [ ] Dashboard: active listings, incoming RFQs, payment status
- [ ] Product management (create, edit inline, delete)
- [ ] Image upload
- [ ] RFQ management (view, accept, reject, counter)
- [ ] Active POs list
- [ ] Payment received tracker
- [ ] Profile page + edit
- [ ] Reviews (view received)
- [ ] Cash flow optimizer (supplier-side: receivables view)

### Pages — Underwriter
- [ ] Dashboard: incoming loan applications, queue
- [ ] Application detail view
- [ ] Document vault viewer (signed URL access, logged)
- [ ] Approve / reject / request documents actions
- [ ] Profile

### Admin Frontend (separate subdomain)
- [ ] IP-restricted access (handled at infra level)
- [ ] Login with 2FA (authenticator app)
- [ ] DB overview dashboard — all collections, filterable, sortable
- [ ] User management (view, soft delete, restore)
- [ ] Loan application management (view, restore)
- [ ] PO management (view, cancel)
- [ ] Audit log viewer
- [ ] Session management (view all active sessions, remote terminate)
- [ ] Credit score overrides (if needed)

---

## Phase 5 — Integration, Testing & Hardening
**Time estimate: 2–3 weeks**

- [ ] End-to-end flow testing: register → list product → RFQ → negotiate →
      PO → payment → review
- [ ] End-to-end loan flow: PO confirmed → loan application → document upload →
      underwriter review → approval → EMI tracked in optimizer
- [ ] Optimizer integration test: real PO data flows into Python service,
      schedule returned and displayed correctly
- [ ] Security audit:
  - All S3 URLs are signed + expiring (no public access)
  - Admin routes IP-restricted
  - JWT validation on all protected routes
  - Input sanitisation everywhere
  - Rate limiting on auth endpoints
- [ ] DPDP Act 2023 compliance:
  - Data deletion request flow
  - Data retention policy enforced in code
  - Privacy policy page
- [ ] Load test critical endpoints (optimizer, document upload, search)
- [ ] Error handling audit — every API endpoint returns consistent error shapes

---

## Phase 6 — Deployment
**Time estimate: 1 week**

- [ ] Frontend: Vercel (Next.js)
- [ ] Backend (Node): Render or Railway
- [ ] ML Service (Python/FastAPI): Render (separate service)
- [ ] Database: MongoDB Atlas (new Credex cluster)
- [ ] File storage: AWS S3 + KMS
- [ ] Environment variables: all secrets in .env, never committed
- [ ] Admin subdomain: admin.credex.in (or equivalent), IP-restricted at CDN/infra level
- [ ] Domain setup, SSL
- [ ] Monitoring: basic uptime monitoring (Better Uptime or similar)
- [ ] Error tracking: Sentry (frontend + backend)

---

## Summary Timeline

| Phase | What | Estimate |
|---|---|---|
| 0 | Schema design + project setup | 1–2 weeks |
| 1 | Backend foundation (auth, profiles, marketplace, RFQs, POs, payments, email) | 3–4 weeks |
| 2 | Loan marketplace + document vault | 2–3 weeks |
| 3 | Python ML microservice (optimizer + credit risk + credit score) | 2–3 weeks |
| 4 | Next.js frontend (all roles + admin) | 4–6 weeks |
| 5 | Integration testing + security hardening | 2–3 weeks |
| 6 | Deployment | 1 week |
| **Total** | | **~15–22 weeks** |

---

## What To Build First (Within Phase 1)

If you start tomorrow, this is the order:

1. Set up monorepo structure and MongoDB schema (Phase 0)
2. Auth system — users, roles, JWT, sessions, OTP email (Phase 1)
3. Company + supplier profiles (Phase 1)
4. Product listings CRUD (Phase 1)
5. RFQ → PO → payment flow (Phase 1)
6. FastAPI microservice skeleton + optimizer port (Phase 3, can run in parallel)

The frontend comes after the APIs exist.
The optimizer connects to real data after the PO system works.
The loan system connects to POs after both exist.

---

## The One Thing To Remember

> The cash flow optimizer and credit scoring engine are Credex's moat.
> But they are useless without real PO and payment data.
> Build the marketplace first. The intelligence follows.

---

*Maintained by: Aniruddh Ballal*
*Last updated: April 2026*