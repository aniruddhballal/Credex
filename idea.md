# Platform Idea — B2B Procurement & Embedded Trade Finance Platform

## What Is This?

A **B2B marketplace with embedded trade finance** — a platform where businesses can discover suppliers, place orders, negotiate financing terms, track payments, and access working capital — all in one place.

Think of it as a combination of:
- A **procurement marketplace** (suppliers list, buyers discover and order)
- A **trade finance layer** (flexible payment structures — deferred, credit, loans, leases, equity, etc.)
- A **cash flow optimizer** (AI/ML engine that tells buyers exactly when to pay which supplier to maximise liquidity)
- A **lending marketplace** (banks and underwriters participate to approve loans on-platform)
- A **trust and compliance layer** (KYC, document vault, transaction history, credit scoring)

---

## User Types

| Role | Description |
|---|---|
| **Supplier** | Lists products/services with pricing and accepted payment methods |
| **Buyer** | Searches for products/services, places RFQs, manages payables |
| **Bank Underwriter** | Reviews loan applications, verifies KYC documents, approves/rejects loans |
| **System Admin** | Oversees all platform activity, has elevated privileges, IP-restricted access |

---

## Core Features

### 1. Marketplace & Order Management

- Suppliers onboard and list products/services with pricing, payment methods accepted, and financing options available
- Buyers browse listings or search for specific products/services
- Buyers submit an **RFQ (Request for Quotation)** to a supplier — they can request customisation, a different payment mode, or an alternative financing structure
- Negotiation happens in two layers:
  - **Structured UI** — predefined options for payment type, financing method, deadlines
  - **In-platform chat** — free-form discussion for edge cases and custom arrangements
- Once both parties agree, the exchange is confirmed as a **Purchase Order (PO)**
- The PO records the financing method chosen, which may include:
  - Immediate full payment
  - Deferred payment (credit basis)
  - Installment/split payments
  - Short-term or long-term loans
  - Lease or rent arrangements
  - Equity-based or bond/debt financing
- If payment is deferred, a **deadline** is set and tracked on the platform
- Payment status is tracked through to completion

### 2. Post-Transaction Layer

- Once an order is fully complete and paid, both parties can **review each other**
- Buyers can also review the **specific product or service** used
- Reviews include a rating and written comments
- Reviews are displayed on supplier profiles, buyer profiles, and product/service pages
- Full **transaction history and audit log** is maintained per order, per payment, per user

### 3. Trust & Credit Scoring

- Transaction history (payment timeliness, dispute rate, order volume) is used to:
  - Verify suppliers and buyers — displayed as a **trust badge / green tick**
  - Calculate a **credit score** for both buyers and suppliers
- Credit scores are visible on profiles and used by bank underwriters when evaluating loan applications

### 4. Cash Flow Optimiser (AI/ML Engine)

- A decision-support tool for **buyers** who have multiple payables across multiple suppliers
- Inputs:
  - Current liquid cash balance
  - Expected daily cash inflows
  - All outstanding payables (amounts, deadlines, penalty structures per supplier/product)
- Goal: **Maximise liquidity** at all times while **minimising penalties**
- The engine calculates the optimal payment schedule — when to pay which supplier, how much, and on which day — across the full period
- Handles scenarios like: pay everything on the last possible day, pay in tranches, or pay some vendors early to unlock better terms
- Technically this is best implemented as a **constrained optimisation model** (e.g. Linear Programming / Mixed Integer Programming) with a **cash flow forecasting layer** (time-series ML) feeding into it — not pure RL, which would be harder to interpret and explain to a CFO

### 5. Loan & Financing Marketplace

- Buyers (or suppliers) who don't want to use their own cash can apply for financing directly on the platform
- Financing types supported: loans, Loan Against Property (LAP), working capital credit lines, and others
- **Bank underwriters** on the platform receive notifications of new loan applications
- Underwriters can view:
  - Applicant profile and credit score
  - Loan amount requested, purpose, linked PO/supplier
  - Interest rate, loan type, principal
  - Submitted KYC documents
- Applicants upload documents to a **secure document vault** (encrypted, access-controlled, signed expiring URLs only — no public access)
- KYC documents include: GST certificate, PAN, incorporation certificate, bank statements, ITR, audited financials
- Underwriters can: approve, reject, or request additional documents
- Loan status is tracked and visible to the applicant throughout

### 6. System Administration

- System admins have a **separate frontend** (separate subdomain, IP-restricted at network level)
- Admin capabilities:
  - View all records across the entire database
  - Edit any field (with audit trail)
  - Restore soft-deleted accounts, loan applications, product requests, payments
  - Cancel payments
  - Oversee underwriter activity and buyer/supplier accounts
- Admin login requires: username + password + OTP + **IP allowlisting**
- All admin actions are logged with timestamp, admin ID, and IP address
- Recommended: role-scoped permissions even within admins (e.g. finance admin vs user admin)

### 7. Authentication & Access Control

- **Buyers, Suppliers, Underwriters** share one frontend with Role-Based Access Control (RBAC)
  - Login via email/username + OTP (email link or code)
  - Users only see routes and components permitted for their role
- **System Admins** use a separate frontend on a separate subdomain
  - IP allowlisted at the infrastructure level
  - Login: username + password + OTP + IP check
  - Recommended: 2FA via authenticator app (not just email OTP)
- Session timeouts enforced for all user types

### 8. Notifications & Email Triggers

- Every significant action/status change triggers an email notification to all relevant parties
- Examples: RFQ submitted, PO confirmed, payment due reminder, payment received, loan application received, loan approved/rejected, document requested, review posted, account verified
- Notifications should be meaningful, not spammy — triggered by state changes, not activity pings
- Future scope: WhatsApp Business API (high open rates in India for SMEs), in-app notification centre, push notifications (if mobile app is built)

---

## Technical Notes & Decisions Made

| Topic | Decision / Recommendation |
|---|---|
| Frontend architecture | Single frontend (RBAC) for buyers/suppliers/underwriters; separate frontend for admins |
| Cash flow engine | Constrained optimisation (LP/MIP) + time-series ML forecasting — not pure RL |
| Document storage | Encrypted cloud storage (e.g. AWS S3 + KMS); signed expiring URLs; no public access |
| Soft deletes | All major entities should support soft delete |
| Audit logging | All mutations (especially admin actions) logged with actor, timestamp, IP |
| Terminology | Vendor → **Supplier** | Company → **Buyer** | Apply/Request → **RFQ** | Confirmed exchange → **Purchase Order (PO)** |

---

## Market Context

- The Indian B2B marketplace space is competitive (IndiaMART, Udaan, OfBusiness, Moglix) but none have built a **cash flow optimizer** or a **multi-party lending marketplace** natively into procurement
- The MSME credit gap in India is ~$1.1 trillion — only 16% of MSMEs have access to formal credit
- Embedded finance in B2B is the fastest growing segment in Indian fintech (2025–2026)
- The platform's **moat** (competitive advantage) is the proprietary transaction and payment data it accumulates, which powers the credit scoring and the optimiser — neither can be replicated without the user base
- Regulatory note: if money passes through the platform, an RBI payment aggregator license (or partnership with a licensed aggregator like Razorpay/Cashfree) is required

---

*Document status: Work in progress — requirements gathering phase*
*Last updated: April 2026*