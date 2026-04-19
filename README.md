# Credex

**B2B Procurement & Embedded Trade Finance Platform**

Credex is a full-stack platform for Indian SMEs that unifies procurement, payment tracking, cash flow optimisation, and trade finance into a single product. Buyers discover suppliers, negotiate orders, track payments, and access working capital — all without leaving the platform.

---

## What It Does

### For Buyers
- Discover verified suppliers and browse product/service listings
- Submit RFQs (Requests for Quotation) and negotiate terms — price, financing method, payment deadline, penalty rate
- Confirm Purchase Orders and track payments (full or partial)
- Use the **Cash Flow Optimiser** to get an AI-generated payment schedule that maximises liquidity while minimising late payment penalties
- Apply for loans linked to confirmed orders — with KYC document upload and real-time status tracking

### For Suppliers
- List products and services with pricing, financing options accepted, and penalty terms
- Receive and respond to RFQs — counter, accept, or decline
- Track fulfilment status and incoming payments
- Build a verified profile with trust badges and credit scores

### For Bank Underwriters
- Review loan applications from a dedicated queue
- Access KYC documents via signed, expiring secure URLs
- Approve, reject, or request additional documents with full audit trail

### For System Admins
- Oversee all platform activity from a separate IP-restricted admin interface
- Soft delete and restore users, companies, products, loans, and POs
- View immutable audit logs of every action on the platform
- Manage loan type catalogue and company verification

---

## Architecture

Credex is three services:

```
credex/
├── frontend/        Next.js 16 (App Router) — buyer, supplier, underwriter UI
├── backend/         Node.js + Express + TypeScript — REST API
└── ml-service/      Python + FastAPI — cash flow optimiser + credit scoring
```

Each service is deployed independently. The frontend calls the Node backend; the Node backend proxies intelligence requests to the Python service. The frontend never calls the Python service directly.

---

## Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| State | React Context + useReducer |
| Forms | React Hook Form + Zod |
| HTTP | Axios (with silent JWT refresh interceptor) |
| Charts | Recharts |
| Icons | Lucide React |
| Toasts | react-hot-toast |

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express + TypeScript |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | JWT (access token 15min + refresh token 7d, httpOnly cookie) |
| Email | Gmail API with OAuth2 |
| Images | Cloudinary |
| Documents | Backblaze B2 (S3-compatible) |
| File upload | Multer (memory buffer) |
| Input safety | xss library |
| Rate limiting | express-rate-limit |

### ML Service
| Layer | Technology |
|---|---|
| Framework | FastAPI + Uvicorn |
| Optimiser | PuLP (Linear Programming / CBC solver) |
| Credit risk | XGBoost |
| Language | Python 3.11+ |

---

## Database

MongoDB Atlas — 17 collections:

| Collection | Purpose |
|---|---|
| `users` | Identity and auth for all roles |
| `companies` | Business profiles (buyer / supplier / both) |
| `products` | Supplier listings |
| `rfqs` | Buyer requests with full negotiation history |
| `purchaseorders` | Confirmed exchanges — central transactional record |
| `payments` | Immutable payment events against POs |
| `loanapplications` | Financing requests linked to POs |
| `loantypes` | Loan product catalogue |
| `documents` | KYC document metadata (files in B2) |
| `documentaccesslogs` | Every document view — immutable |
| `reviews` | Post-PO ratings (buyer→supplier, supplier→buyer, buyer→product) |
| `creditscores` | Versioned 300–900 scores per company |
| `chatmessages` | In-platform messages linked to RFQ or PO |
| `notifications` | In-platform notification events |
| `sessions` | Active login sessions with TTL auto-expiry |
| `auditlogs` | Every significant mutation — immutable |
| `restorationrequests` | Requests to restore soft-deleted records |

Key schema rules:
- All prices stored in **paise** (₹1 = 100 paise) to avoid floating point errors
- All major collections have `isDeleted` + `deletedAt` for soft delete
- `{ timestamps: true }` on every schema — no manual `createdAt`/`updatedAt`
- Payment documents are **immutable** — never updated after creation
- AuditLog documents are **immutable** — never updated or deleted

---

## User Roles & Onboarding

| Role | Description |
|---|---|
| `buyer` | Sources and purchases from suppliers |
| `supplier` | Lists products/services and fulfils orders |
| `underwriter` | Reviews loan applications at a bank/NBFC |
| `system_admin` | Platform administrator — IP-restricted access |

**Onboarding flow:**
```
Register → Verify email → Login → Create company (/onboarding) → Dashboard
```

Buyers and suppliers must create a company before accessing any platform features. Underwriters and system admins skip company creation.

---

## API Overview

Base URL: `http://localhost:5000` (dev)

All responses follow this envelope:
```json
{ "success": true, "data": { ... }, "message": "optional" }
```
```json
{ "success": false, "error": "human readable", "code": "MACHINE_CODE" }
```

Paginated list responses:
```json
{ "success": true, "data": { "items": [], "nextCursor": "lastId", "total": 0 } }
```

### Route Groups

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/verify-email?token=
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/users/profile
PATCH  /api/users/profile
POST   /api/users/change-password

POST   /api/companies
GET    /api/companies/me/profile
PATCH  /api/companies/me/profile
GET    /api/companies/:id
GET    /api/companies

GET    /api/products
GET    /api/products/:id
GET    /api/products/my/listings
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id

GET    /api/rfqs
GET    /api/rfqs/:id
POST   /api/rfqs
POST   /api/rfqs/:id/counter
POST   /api/rfqs/:id/accept
POST   /api/rfqs/:id/decline

GET    /api/purchase-orders
GET    /api/purchase-orders/:id
POST   /api/purchase-orders
PATCH  /api/purchase-orders/:id/fulfilment
POST   /api/purchase-orders/:id/cancel
POST   /api/purchase-orders/:id/payments
GET    /api/purchase-orders/:id/payments

GET    /api/loans
GET    /api/loans/:id
POST   /api/loans
POST   /api/loans/:id/submit
POST   /api/loans/:id/documents
PATCH  /api/loans/:id/assign
POST   /api/loans/:id/request-documents
POST   /api/loans/:id/approve
POST   /api/loans/:id/reject

GET    /api/notifications
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/read-all

POST   /api/reviews
GET    /api/reviews

GET    /api/chat
POST   /api/chat

GET    /api/documents
POST   /api/documents
GET    /api/documents/:id/url
PATCH  /api/documents/:id/accept
PATCH  /api/documents/:id/reject
DELETE /api/documents/:id

PATCH  /api/images/profile
PATCH  /api/images/company-logo
POST   /api/images/product/:productId
DELETE /api/images/product/:productId

GET    /api/credit-scores/me
GET    /api/credit-scores/me/history
POST   /api/credit-scores/me/compute

POST   /api/optimizer/schedule

GET    /api/buyer/dashboard
GET    /api/supplier/dashboard

GET    /api/underwriter/queue
GET    /api/underwriter/applications/:id
POST   /api/underwriter/applications/:id/request-docs
POST   /api/underwriter/applications/:id/approve
POST   /api/underwriter/applications/:id/reject
GET    /api/underwriter/documents/:id/view

GET    /api/admin/users
DELETE /api/admin/users/:id
GET    /api/admin/companies
PATCH  /api/admin/companies/:id/verify
GET    /api/admin/loan-types
POST   /api/admin/loan-types
PATCH  /api/admin/loan-types/:id
POST   /api/admin/restoration-requests
GET    /api/admin/restoration-requests
POST   /api/admin/restoration-requests/:id/approve
POST   /api/admin/restoration-requests/:id/reject
GET    /api/admin/audit-logs
```

---

## Cash Flow Optimiser

The optimizer is a Linear Programming model served by the Python FastAPI microservice.

**How it works:**
1. Buyer opens the Cash Flow page and enters their current cash balance and expected daily inflows
2. Frontend calls `POST /api/optimizer/schedule` on the Node backend
3. Node backend fetches all unpaid/partially-paid POs for that buyer from MongoDB
4. Node backend POSTs to the Python service: `POST /optimize`
5. Python runs PuLP LP solver — minimises total penalties while keeping cash balance non-negative across a 90-day horizon
6. Returns a day-by-day payment schedule, urgency alerts, and projected cash balance curve
7. Frontend renders as a table + Recharts line chart

**Python service endpoints:**
```
POST /optimize        Cash flow payment schedule
POST /credit-risk     XGBoost default probability (0–1)
POST /credit-score    300–900 composite score with breakdown
GET  /health          Service health check
```

---

## Credit Scoring

Each company gets a credit score (300–900) computed from five weighted components:

| Component | Weight | Source |
|---|---|---|
| Payment history | 35% | % of PO payments made on or before deadline |
| Outstanding debt | 25% | Total amountRemaining across active POs |
| Trade activity | 20% | Number of completed POs (capped at 20) |
| Reviews | 15% | Average rating received from counterparties |
| Credit utilisation | 5% | Placeholder in V1 |

Scores are versioned — a new record is inserted each time a score is computed. Historical records are preserved for trend analysis. A daily cron job recomputes scores for all active companies at 2:00 AM IST.

**Tiers:**
- 300–499 → Bronze
- 500–649 → Silver
- 650–799 → Gold
- 800–900 → Platinum

---

## Document Security

KYC documents are stored in **Backblaze B2** (S3-compatible). The storage key is never returned to the client under any circumstances.

Access flow:
1. Underwriter clicks "View" on a document
2. Backend verifies the underwriter is assigned to that loan application
3. Backend generates a **signed URL expiring in 15 minutes** using the S3-compatible SDK
4. Backend writes a `DocumentAccessLog` entry (who, when, from which IP)
5. Signed URL is returned to the browser — discarded after use, never cached

Future migration from B2 to AWS S3 + KMS requires only a credential and endpoint change — no code rewrite — because the `storageProvider` field on each Document record routes requests to the correct service.

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- MongoDB Atlas account (or local MongoDB)
- Cloudinary account (free tier)
- Backblaze B2 account (free tier)
- Gmail account with OAuth2 credentials

### 1. Clone the repository

```bash
git clone https://github.com/your-username/credex.git
cd credex
```

### 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in all values in .env (see Environment Variables below)
npm run dev
# Server starts on http://localhost:5000
```

### 3. ML service setup

```bash
cd ml-service
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Service starts on http://localhost:8000
```

### 4. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL
npm run dev
# App starts on http://localhost:3000
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/credex

# JWT
JWT_ACCESS_SECRET=        # min 32 chars — generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_REFRESH_SECRET=       # min 32 chars — generate separately
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
GMAIL_USER=your@gmail.com

# Admin IP whitelist (comma-separated — use 127.0.0.1,::1 for local dev)
ADMIN_ALLOWED_IPS=127.0.0.1,::1

# Cloudinary (images)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Backblaze B2 (KYC documents)
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET_NAME=credex-documents

# ML service
ML_SERVICE_URL=http://localhost:8000
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3001
```

---

## Getting Gmail OAuth2 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable Gmail API
3. Create OAuth 2.0 credentials (Desktop app type)
4. Use the OAuth playground or a script to generate a refresh token with `https://mail.google.com/` scope
5. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER` in `.env`

---

## Deployment

| Service | Platform | Notes |
|---|---|---|
| Frontend | Vercel | Connect GitHub repo, set env vars |
| Backend | Render | Web service, set env vars, auto-deploy from main |
| ML service | Render | Separate web service, use `requirements.txt` |
| Database | MongoDB Atlas | M0 free tier sufficient for development |
| Images | Cloudinary | Free tier — 25GB storage |
| Documents | Backblaze B2 | Free tier — 10GB storage |

**Admin frontend** is a separate deployment (not included in this repo). Use Retool or a separate Next.js app pointed at `/api/admin/*` routes. Admin routes are IP-whitelisted — set `ADMIN_ALLOWED_IPS` to your production admin IP in the backend env vars.

---

## Key Business Rules

These are enforced in backend controllers — the frontend must respect them:

1. **Prices in paise** — store and transmit `250000` for ₹2,500. Display with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
2. **Company required** — buyers and suppliers must create a company before placing RFQs or listing products
3. **RFQ → PO flow** — a PO can only be created from an accepted RFQ. Direct PO creation is not supported
4. **Payments are immutable** — once a Payment document is created it cannot be edited or deleted
5. **Reviews gate** — reviews only unlock when `fulfilmentStatus === 'completed'` AND `paymentStatus === 'paid'`
6. **Signed URLs for documents** — never store or cache document URLs. Call `GET /api/documents/:id/url` fresh each time
7. **Soft deletes only** — no hard deletes on User, Company, Product, RFQ, PurchaseOrder, LoanApplication, Document
8. **Admin routes are IP-restricted** — will 403 from any non-whitelisted IP
9. **Email verification required** — login is blocked until email is verified
10. **One company per user (V1)** — a user cannot create more than one company

---

## Project Structure

```
credex/
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/              login, register, forgot-password,
│   │   │                        reset-password, verify-email, onboarding
│   │   ├── (buyer)/             dashboard, discover, rfqs, purchase-orders,
│   │   │                        cash-flow, loans, notifications, profile
│   │   ├── (supplier)/          dashboard, listings, rfqs, purchase-orders,
│   │   │                        notifications, profile
│   │   └── (underwriter)/       dashboard, applications
│   ├── components/
│   │   ├── ui/                  Button, Input, Card, Badge, Modal, Table,
│   │   │                        Skeleton, StatCard, Pagination
│   │   ├── shared/              Sidebar, ProfilePage, NotificationsPage
│   │   └── supplier/            ListingForm
│   ├── lib/
│   │   ├── api.ts               Axios instance + token storage + interceptors
│   │   ├── api-hooks/           Typed wrappers for every endpoint
│   │   ├── auth-context.tsx     Global auth state + onboarding gate
│   │   └── format.ts            Indian currency, date, deadline formatters
│   ├── hooks/                   useFetch, usePaginated, useDebounce, useDisclosure
│   ├── types/                   TypeScript types for all 17 collections
│   └── proxy.ts                 Edge middleware — route protection by role
│
├── backend/
│   └── src/
│       ├── controllers/         auth, user, company, product, rfq,
│       │                        purchaseOrder, payment, loan, notification,
│       │                        review, chat, document, image, creditScore,
│       │                        dashboard, admin
│       ├── middleware/          auth.ts, ipWhitelist.ts, sanitise.ts
│       ├── models/              17 Mongoose models
│       ├── routes/              one file per domain
│       ├── services/            cloudinary.ts, b2.ts, email.ts, mlService.ts
│       ├── utils/               jwt.ts, response.ts
│       └── server.ts
│
└── ml-service/
    ├── main.py                  FastAPI entry point
    ├── routes/
    │   ├── optimizer.py         POST /optimize — PuLP LP solver
    │   ├── credit_risk.py       POST /credit-risk — XGBoost model
    │   └── credit_score.py      POST /credit-score — composite scoring
    ├── agents/                  Rule, heuristic, Q-table, DQN agents
    ├── models/                  Serialised .pkl model files
    └── requirements.txt
```

---

## Origin

Credex is the unification of three independently built products:

- **VenPay** — B2B marketplace with product listings, RFQs, payments, and reviews
- **LOANlo** — Loan origination system with document vault, underwriter workflow, and session management
- **VenPayRL** — Multi-agent cash flow simulator (rule-based, heuristic, Q-table, DQN)

All three are still deployed independently. Credex rebuilds and unifies them with a shared database, shared user identity, and a connected intelligence layer.

---

## What's Not Built Yet (V1 Scope Limits)

- **Admin frontend** — admin routes exist, UI is not built. Use Retool as a temporary interface
- **Real money movement** — payments are tracked manually. Razorpay/Cashfree integration is V2
- **WhatsApp notifications** — email only in V1
- **Mobile app** — web-only, mobile-responsive
- **Accounting integrations** — Tally, Zoho Books, QuickBooks (V2)
- **Multi-user companies** — one user per company in V1
- **AWS S3** — using Backblaze B2 (S3-compatible). Migration is a credential swap when ready

---

## Contributing

This is a private project. Please contact the maintainer before submitting changes.

---

## Maintained By

**Aniruddh Ballal**

*Last updated: April 2026*