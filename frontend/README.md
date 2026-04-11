# Credex Frontend — File Reference

This document lists every file in the Credex Next.js frontend, what it does,
and which backend API endpoints it depends on. Use this as the cross-reference
when building or verifying the backend route map.

All amounts are stored and transmitted in **paise** (1 rupee = 100 paise).
All API calls use the base URL set in `NEXT_PUBLIC_API_URL`.

---

## Project Structure Overview

```
frontend/
├── app/                        Next.js App Router pages
│   ├── (auth)/                 Unauthenticated pages (login, register, etc.)
│   ├── (buyer)/                Buyer-only pages
│   ├── (supplier)/             Supplier-only pages
│   ├── (underwriter)/          Underwriter-only pages
│   ├── layout.tsx              Root layout — mounts AuthProvider + Toaster
│   └── globals.css             Global styles + Tailwind v4 design tokens
├── components/
│   ├── ui/                     Base component library (no API calls)
│   ├── shared/                 Role-agnostic components (Sidebar, Profile, Notifications)
│   └── supplier/               Supplier-specific components (ListingForm)
├── lib/
│   ├── api.ts                  Axios client — attaches JWT, handles silent refresh
│   ├── api-hooks/index.ts      Typed wrappers for every backend endpoint
│   ├── auth-context.tsx        Global auth state (user, login, logout)
│   ├── format.ts               Indian currency, date, and deadline formatting
│   └── utils.ts                cn() — Tailwind class merger
├── hooks/index.ts              useFetch, usePaginated, useDebounce, useDisclosure
├── types/index.ts              TypeScript types mirroring all 17 MongoDB collections
└── middleware.ts               Edge middleware — role-based route protection
```

---

## Configuration Files

### `app/globals.css`
Tailwind v4 design tokens defined via `@theme`. Overrides the built-in `indigo-*`
palette with royal purple (`indigo-600` = `#7C3AED`). Defines the `glass` and
`glass-hover` utility classes used by Card, Modal, Table, Sidebar.
Also sets the dark deep-violet body background with radial purple glow.
**No API calls.**

### `.env.example`
```
NEXT_PUBLIC_API_URL=http://localhost:5000   # Node backend base URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `middleware.ts`
Next.js edge middleware. Reads `credex_role` and `credex_has_session` cookies
(set by the frontend after login). Redirects unauthenticated users to `/login`
and users accessing the wrong role's routes back to their own dashboard.
**No API calls** — cookie-based only.

---

## Infrastructure — lib/

### `lib/api.ts`
Central Axios instance. Every page and component uses this, never raw `fetch`.

- Attaches `Authorization: Bearer <token>` from `localStorage` on every request
- On `401 SESSION_EXPIRED`: calls `POST /api/auth/refresh` silently, retries the
  original request once with the new token
- On second 401: clears token, redirects to `/login?expired=1`
- Sets `withCredentials: true` so the httpOnly refresh token cookie is sent

**Backend endpoints consumed:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/refresh` | Silent token refresh on 401 |

---

### `lib/auth-context.tsx`
React context providing `user`, `loading`, `initialized`, `login()`, `logout()`,
`refreshUser()` to the whole app. Mounted in `app/layout.tsx` as `<AuthProvider>`.

**Backend endpoints consumed:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/me` | Hydrate user on page load (reads from stored token) |
| POST | `/api/auth/login` | Login — returns `{ accessToken, user }` |
| POST | `/api/auth/logout` | Invalidate session server-side |

**Cookies set by frontend after login:**
- `credex_role` — user's role string (read by `middleware.ts`)
- `credex_has_session` — `"1"` flag (read by `middleware.ts`)

---

### `lib/api-hooks/index.ts`
All typed API wrappers. Pages import from here — never call `api` directly.
Every method listed here requires a corresponding backend route.

#### `productsApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/products?search=&category=&city=&minPrice=&maxPrice=&minRating=&financingMethod=&cursor=&limit=` | Discover page |
| GET | `/api/products/:id` | Product detail page |
| GET | `/api/products/my/listings` | Supplier listings page |
| POST | `/api/products` (multipart) | Create listing — images via Cloudinary |
| PATCH | `/api/products/:id` | Edit listing |
| DELETE | `/api/products/:id` | Soft-delete listing |

#### `companiesApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/companies/me/profile` | Profile page, dashboard |
| PATCH | `/api/companies/me/profile` | Profile page save |
| GET | `/api/companies/:id` | Public company view |
| GET | `/api/companies?type=&city=&search=` | Company listing/search |
| POST | `/api/companies` | Register flow — create company after user |

#### `rfqApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/rfqs?role=buyer\|supplier&status=` | RFQ list pages |
| GET | `/api/rfqs/:id` | RFQ detail/negotiation page |
| POST | `/api/rfqs` | Buyer submits RFQ from product detail |
| POST | `/api/rfqs/:id/counter` | Counter offer (buyer or supplier) |
| POST | `/api/rfqs/:id/accept` | Accept RFQ — triggers PO creation |
| POST | `/api/rfqs/:id/decline` | Decline RFQ |

#### `poApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/purchase-orders?role=buyer\|supplier&paymentStatus=` | PO list pages |
| GET | `/api/purchase-orders/:id` | PO detail pages |
| PATCH | `/api/purchase-orders/:id/fulfilment` | Supplier updates delivery status |
| POST | `/api/purchase-orders/:id/cancel` | Cancel PO |
| POST | `/api/purchase-orders/:id/payments` | Buyer records a payment |
| GET | `/api/purchase-orders/:id/payments` | Payment history on PO detail |

#### `loansApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/loans` | Buyer loans list |
| GET | `/api/loans/:id` | Loan detail + document upload |
| POST | `/api/loans` | Create loan application (step 2 of apply flow) |
| POST | `/api/loans/:id/submit` | Submit draft → submitted state |
| POST | `/api/loans/:id/documents` (multipart) | Upload KYC documents to B2 |

#### `optimizerApi`
| Method | Path | Used by |
|--------|------|---------|
| POST | `/api/optimizer/schedule` | Cash flow optimizer page — proxied to Python service |

**Request body:**
```json
{
  "currentCash": 50000000,
  "dailyInflows": [{ "date": "2026-04-15", "amount": 10000000 }]
}
```
**Response:** `{ paymentSchedule[], alerts[], projectedCashBalance[] }`

#### `creditScoreApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/credit-scores/me` | Profile page, buyer dashboard |
| GET | `/api/credit-scores/me/history` | (Available — not yet wired to a page) |

#### `notificationsApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/notifications` | Notifications page |
| PATCH | `/api/notifications/:id/read` | Mark single notification read |
| PATCH | `/api/notifications/read-all` | Mark all read |

#### `reviewsApi`
| Method | Path | Used by |
|--------|------|---------|
| POST | `/api/reviews` | Buyer submits review from PO detail |
| GET | `/api/reviews?companyId=` | (Available — not yet wired to a page) |

#### `underwriterApi`
| Method | Path | Used by |
|--------|------|---------|
| GET | `/api/underwriter/queue` | Underwriter applications list |
| GET | `/api/underwriter/applications/:id` | Application detail — expects populated `company`, `documents`, `po` fields |
| POST | `/api/underwriter/applications/:id/request-docs` | Request additional KYC |
| POST | `/api/underwriter/applications/:id/approve` | Approve with amount + interest rate |
| POST | `/api/underwriter/applications/:id/reject` | Reject with reason |
| GET | `/api/underwriter/documents/:id/view` | Get 15-min signed URL for a document |

---

### `lib/format.ts`
Pure utility — no API calls. Functions:
- `formatCurrency(paise)` → `₹2,500` (Indian numbering system)
- `formatCurrencyCompact(paise)` → `₹2.5L`, `₹1.2Cr`
- `formatDate(date)` → `14 Apr 2026`
- `formatDateTime(date)` → `14 Apr 2026, 3:45 PM`
- `formatRelative(date)` → `2 hours ago`
- `formatDeadline(date)` → `{ label: "3d left", urgency: "medium" }`
- `scoreTierColor(tier)` → Tailwind class string for credit tier badge

### `lib/utils.ts`
`cn(...classes)` — merges Tailwind classes safely using `clsx` + `tailwind-merge`.

### `hooks/index.ts`
- `useFetch<T>(url)` — GET with loading/error/refetch, aborts on unmount
- `usePaginated<T>(url, limit, params)` — cursor-based pagination with prev/next
- `useDebounce(value, delay)` — debounces search input (default 300ms)
- `useDisclosure()` — `{ isOpen, open, close, toggle }` for modals

### `types/index.ts`
Full TypeScript types for all 17 MongoDB collections: `AuthUser`, `Company`,
`Product`, `RFQ`, `NegotiationEntry`, `PurchaseOrder`, `Payment`,
`LoanApplication`, `CreditScore`, `Notification`, `ScheduledPayment`,
`OptimizerAlert`, `ProjectedBalance`, `OptimizerResult`, `PaginatedResponse<T>`.

---

## Pages — Auth `app/(auth)/`

Shared layout: `app/(auth)/layout.tsx`  
Two-column — left panel is deep violet `#1A1535` with glow effects and branding copy.
Right panel is dark `#0F0B1E` containing the form. No API calls in layout itself.

---

### `/login` — `app/(auth)/login/page.tsx`
Login form with email + password. Eye toggle on password field.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| POST | `/api/auth/login` | Form submit — via `auth-context.login()` |

**On success:** sets `credex_role` + `credex_has_session` cookies, redirects by role:
- `buyer` → `/buyer/dashboard`
- `supplier` → `/supplier/dashboard`
- `underwriter` → `/underwriter/dashboard`
- `system_admin` → `/admin/dashboard`

---

### `/register` — `app/(auth)/register/page.tsx`
Registration form: first name, last name, email, phone, role selector (buyer/supplier), password + confirm.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| POST | `/api/auth/register` | Form submit |

**On success:** redirects to `/login` with toast prompting email verification.

---

### `/forgot-password` — `app/(auth)/forgot-password/page.tsx`
Email input. Always shows success state after submit (doesn't reveal if email exists).

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| POST | `/api/auth/forgot-password` | Form submit |

---

### `/reset-password` — `app/(auth)/reset-password/page.tsx`
Reads `?token=` from URL. Shows error state if token missing or expired.
New password + confirm password form.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| POST | `/api/auth/reset-password` | Form submit — sends `{ token, newPassword }` |

**Error codes handled:** `TOKEN_EXPIRED`, `INVALID_TOKEN` → shows "link invalid" state.

---

### `/verify-email` — `app/(auth)/verify-email/page.tsx`
Reads `?token=` from URL. Calls verify endpoint on mount, shows success/error.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/auth/verify-email?token=` | On page mount |

---

## Pages — Buyer `app/(buyer)/`

Layout: `app/(buyer)/layout.tsx` — wraps all buyer pages with `<Sidebar>`.
Nav items: Dashboard, Discover, RFQs, Purchase Orders, Cash Flow, Loans, Messages, Notifications, Profile.

---

### `/buyer/dashboard` — `app/(buyer)/buyer/dashboard/page.tsx`
Overview with 4 metric cards, active POs list, and optimizer alert panel.

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/buyer/dashboard` | Single call returning `{ activePOs, totalOutstanding, nextDeadline, creditScore, optimizerAlerts }` |

> **Note:** This endpoint does not exist yet — it is a dashboard aggregate endpoint the backend needs to implement. It should return pre-computed values to avoid the frontend making 4+ separate calls on load.

---

### `/buyer/discover` — `app/(buyer)/buyer/discover/page.tsx`
Product/supplier search. Category chip row, filter panel (min rating, financing method,
verified-only toggle), responsive 3-column product card grid, cursor pagination.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/products?search=&category=&minRating=&isVerified=&financingMethod=&cursor=&limit=20` | On load and filter change |

---

### `/buyer/discover/[id]` — `app/(buyer)/buyer/discover/[supplierId]/page.tsx`
> Note: the dynamic segment is named `[supplierId]` in the file path but actually holds a **product ID**. The backend endpoint is `/api/products/:id`.

Product detail — image carousel, specs, financing tags, penalty/payment term display.
RFQ submission modal with full form (price, qty, financing, deadline, penalty, message).

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/products/:id` | On page load |
| POST | `/api/rfqs` | RFQ modal submit |

**RFQ payload:**
```json
{
  "productId": "...",
  "supplierId": "...",
  "proposedPrice": 250000,
  "proposedQuantity": 10,
  "proposedFinancingMethod": "deferred_30",
  "proposedPaymentDeadlineDays": 30,
  "proposedPenaltyRate": 0.05,
  "message": "optional note"
}
```

---

### `/buyer/rfqs` — `app/(buyer)/buyer/rfqs/page.tsx`
Tabbed RFQ list: All / Pending / Countered / Accepted / Declined.
Table view with supplier, product, price, qty, financing, status, last updated.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/rfqs?role=buyer&status=` | On load and tab change |

---

### `/buyer/rfqs/[id]` — `app/(buyer)/buyer/rfqs/[id]/page.tsx`
Full negotiation view. Timeline of all counter offers rendered as chat-style bubbles
(buyer entries right-aligned, supplier left-aligned). Current terms sidebar.
Actions: Accept, Counter (inline form), Decline — each with confirm modals.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/rfqs/:id` | On page load |
| POST | `/api/rfqs/:id/counter` | Counter form submit |
| POST | `/api/rfqs/:id/accept` | Accept modal confirm → redirects to `/buyer/purchase-orders` |
| POST | `/api/rfqs/:id/decline` | Decline modal confirm |

**Expected populated fields on GET response:** `buyerId`, `supplierId`, `productId` should be populated objects (not just IDs).

---

### `/buyer/purchase-orders` — `app/(buyer)/buyer/purchase-orders/page.tsx`
Filtered PO list: All / Unpaid / Partial / Paid.
Table shows supplier, product, total, remaining, deadline (colour-coded by urgency), payment status, fulfilment status.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/purchase-orders?role=buyer&paymentStatus=&cursor=&limit=20` | On load and filter change |

---

### `/buyer/purchase-orders/[id]` — `app/(buyer)/buyer/purchase-orders/[id]/page.tsx`
PO detail. Payment progress bar, deadline warning banner, payment history list.
Record Payment modal (amount, method, optional reference). Leave Review modal (type + star rating + comment).

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/purchase-orders/:id` | On page load |
| GET | `/api/purchase-orders/:id/payments` | On page load (payment history) |
| POST | `/api/purchase-orders/:id/payments` | Record payment modal submit |
| POST | `/api/reviews` | Review modal submit |

**Payment payload:** `{ amount: number (paise), method: string, reference?: string }`  
**Review payload:** `{ purchaseOrderId, reviewType: "buyer_to_supplier" | "buyer_to_product", rating: 1-5, comment? }`

---

### `/buyer/cash-flow` — `app/(buyer)/buyer/cash-flow/page.tsx`
Cash flow optimizer. Left: form to enter current balance + add expected inflows by date.
Right: alert banners, Recharts line chart of 90-day projected balance, recommended payment schedule table.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| POST | `/api/optimizer/schedule` | "Optimise my payments" button |

**Request body:**
```json
{
  "currentCash": 50000000,
  "dailyInflows": [
    { "date": "2026-04-15", "amount": 10000000 }
  ]
}
```
**Response shape:**
```json
{
  "paymentSchedule": [{ "date", "purchaseOrderId", "supplierName", "amountToPay", "reason" }],
  "alerts": [{ "purchaseOrderId", "urgency", "message" }],
  "projectedCashBalance": [{ "date", "balance" }]
}
```

---

### `/buyer/loans` — `app/(buyer)/buyer/loans/page.tsx`
Loan application list. Table with amount, tenure, purpose, status, applied date.
"Apply for loan" button links to `/buyer/loans/apply`.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/loans` | On page load |

---

### `/buyer/loans/apply` — `app/(buyer)/buyer/loans/apply/page.tsx`
3-step wizard: (1) Select a PO, (2) Loan details, (3) Review & submit.
Step 1 shows all unpaid/partially paid POs as radio-selectable cards.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/purchase-orders?paymentStatus=unpaid,partially_paid&role=buyer` | Step 1 — load eligible POs |
| POST | `/api/loans` | Step 3 confirm — creates draft |
| POST | `/api/loans/:id/submit` | Immediately after create — auto-submits draft |

**Create payload:**
```json
{
  "purchaseOrderId": "...",
  "loanTypeId": "working_capital",
  "requestedAmount": 25000000,
  "tenureMonths": 12,
  "purpose": "Working capital for supplier payment..."
}
```

---

### `/buyer/loans/[id]` — `app/(buyer)/buyer/loans/[id]/page.tsx`
Loan detail. Status banner (changes colour + message by status). Document upload section
(multipart POST). Credit risk score display. If status is `documents_requested`, shows
a prominent upload CTA.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/loans/:id` | On page load — expects populated `documents[]` |
| POST | `/api/loans/:id/documents` (multipart) | File input change |

---

### `/buyer/notifications` — `app/(buyer)/buyer/notifications/page.tsx`
Delegates to `components/shared/NotificationsPage.tsx` — see shared components section.

### `/buyer/profile` — `app/(buyer)/buyer/profile/page.tsx`
Delegates to `components/shared/ProfilePage.tsx` — see shared components section.

---

## Pages — Supplier `app/(supplier)/`

Layout: `app/(supplier)/layout.tsx` — wraps with `<Sidebar>`.
Nav: Dashboard, My Listings, RFQs, Purchase Orders, Cash Flow, Notifications, Profile.

---

### `/supplier/dashboard` — `app/(supplier)/supplier/dashboard/page.tsx`
4 metric cards + incoming RFQs list + active POs list.

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/supplier/dashboard` | Returns `{ activeListings, pendingRFQs, totalReceivable, averageRating, incomingRFQs[], activePOs[] }` |

> **Note:** Aggregate dashboard endpoint — needs backend implementation.

---

### `/supplier/listings` — `app/(supplier)/supplier/listings/page.tsx`
Card grid of the supplier's own listings. Each card has Edit, Pause/Activate, Delete actions.
Pause/Activate toggles `isAvailable`. Delete is a soft delete with confirm modal.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/products/my/listings` | On page load |
| PATCH | `/api/products/:id` | Pause/Activate toggle — sends `{ isAvailable: bool }` |
| DELETE | `/api/products/:id` | Delete confirm |

---

### `/supplier/listings/new` — `app/(supplier)/supplier/listings/new/page.tsx`
Create listing page — mounts `<ListingForm>` with no product prop.

### `/supplier/listings/[id]/edit` — `app/(supplier)/supplier/listings/[id]/edit/page.tsx`
Edit listing page — fetches product then mounts `<ListingForm product={product}>`.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/products/:id` | On page load (edit mode only) |

Both pages delegate to `components/supplier/ListingForm.tsx` for submission.

---

### `/supplier/rfqs` — `app/(supplier)/supplier/rfqs/page.tsx`
Incoming RFQ list. Tabs: All / Pending / Countered / Accepted / Declined.
"Respond →" label shown for pending RFQs.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/rfqs?role=supplier&status=&cursor=&limit=20` | On load and tab change |

---

### `/supplier/rfqs/[id]` — `app/(supplier)/supplier/rfqs/[id]/page.tsx`
Same negotiation UI as buyer's RFQ detail but flipped — supplier entries are right-aligned.
Counter form, accept, decline.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/rfqs/:id` | On page load |
| POST | `/api/rfqs/:id/counter` | Counter form |
| POST | `/api/rfqs/:id/accept` | Accept → redirects to `/supplier/purchase-orders` |
| POST | `/api/rfqs/:id/decline` | Decline |

---

### `/supplier/purchase-orders` — `app/(supplier)/supplier/purchase-orders/page.tsx`
Supplier's PO list — all POs where they are the seller. Shows buyer name, payment deadline, payment status, fulfilment status.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/purchase-orders?role=supplier&cursor=&limit=20` | On page load |

---

### `/supplier/purchase-orders/[id]` — `app/(supplier)/supplier/purchase-orders/[id]/page.tsx`
PO detail from supplier's perspective. Fulfilment status stepper (pending → processing → shipped → delivered).
"Mark as [next status]" button advances one step. Payment received progress bar. Payment history.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/purchase-orders/:id` | On page load |
| GET | `/api/purchase-orders/:id/payments` | On page load |
| PATCH | `/api/purchase-orders/:id/fulfilment` | Advance fulfilment button — sends `{ fulfilmentStatus: string }` |

---

### `/supplier/notifications` — `app/(supplier)/supplier/notifications/page.tsx`
Delegates to `components/shared/NotificationsPage.tsx`.

### `/supplier/profile` — `app/(supplier)/supplier/profile/page.tsx`
Delegates to `components/shared/ProfilePage.tsx`.

---

## Pages — Underwriter `app/(underwriter)/`

Layout: `app/(underwriter)/layout.tsx` — wraps with `<Sidebar>`.
Nav: Dashboard, Applications, Profile.

---

### `/underwriter/dashboard` — `app/(underwriter)/underwriter/dashboard/page.tsx`
4 stat cards + applications queue table.

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/underwriter/dashboard` | Returns `{ queueCount, approvedToday, rejectedToday, pendingDocs, queue[] }` |

> **Note:** Aggregate dashboard endpoint — needs backend implementation.

---

### `/underwriter/applications` — `app/(underwriter)/underwriter/applications/page.tsx`
All loan applications with status filter tabs: All / New / In Review / Awaiting Docs / Approved / Rejected.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/underwriter/queue?status=&cursor=&limit=20` | On load and tab change |

---

### `/underwriter/applications/[id]` — `app/(underwriter)/underwriter/applications/[id]/page.tsx`
Full application review page. AI credit risk score banner (coloured by tier). Loan details panel.
KYC document list with signed-URL viewer (iframe in modal). Action buttons: Request Docs, Reject, Approve.
Each action opens a modal with a form.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/underwriter/applications/:id` | On page load — expects `{ ...loan, documents[], company, po }` populated |
| GET | `/api/underwriter/documents/:id/view` | "View" button per document — returns `{ url: string }` (15-min signed URL) |
| POST | `/api/underwriter/applications/:id/request-docs` | Request docs modal — sends `{ note: string }` |
| POST | `/api/underwriter/applications/:id/approve` | Approve modal — sends `{ approvedAmount, interestRate, note? }` |
| POST | `/api/underwriter/applications/:id/reject` | Reject modal — sends `{ reason: string }` |

---

## Shared Components

### `components/shared/Sidebar.tsx`
Glassmorphism sidebar with dark violet background. Active route highlighted with purple glow.
Also exports `TopBar` (page header with title/subtitle/actions) and `Breadcrumb`.
**No API calls.**

### `components/shared/ProfilePage.tsx`
Shared between `/buyer/profile` and `/supplier/profile`. Company profile edit form,
change password form, credit score display, avatar upload.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/companies/me/profile` | On page load |
| GET | `/api/credit-scores/me` | On page load |
| PATCH | `/api/companies/me/profile` | Save profile form |
| POST | `/api/users/change-password` | Change password form — sends `{ currentPassword, newPassword }` |
| PATCH | `/api/users/profile` | Avatar upload (multipart) |

---

### `components/shared/NotificationsPage.tsx`
Shared between buyer and supplier notification pages. Sorted list with entity-type icons
(RFQ, PO, loan, review). Click to mark as read. "Mark all read" button.

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| GET | `/api/notifications` | On page load |
| PATCH | `/api/notifications/:id/read` | Click on unread notification |
| PATCH | `/api/notifications/read-all` | "Mark all read" button |

---

### `components/supplier/ListingForm.tsx`
Shared between create and edit listing pages. Full product form: name, description, category,
price, stock, financing method toggles (multi-select), payment deadline, penalty rate,
image upload (up to 5, previewed inline, sent as multipart).

**Endpoints:**
| Method | Path | Trigger |
|--------|------|---------|
| POST | `/api/products` (multipart) | Create mode submit |
| PATCH | `/api/products/:id` | Edit mode submit |

---

## UI Components — `components/ui/`

All are pure presentational — **no API calls**. Styled for the dark glassmorphism theme.

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `Button.tsx` | Variants: primary (purple), secondary (glass), ghost, danger, outline |
| `Input` | `Input.tsx` | Text input with label, error, hint, left/right icon slots |
| `Textarea` | `Input.tsx` | Multi-line input, same styling as Input |
| `Select` | `Input.tsx` | Native select styled for dark theme (`colorScheme: dark`) |
| `Card` | `Card.tsx` | Glassmorphism card — uses `.glass` CSS class |
| `CardHeader` | `Card.tsx` | Flex row with title + optional action |
| `CardTitle` | `Card.tsx` | Small semibold heading |
| `Badge` | `Badge.tsx` | Pill badge — variants: default, success, warning, danger, info, muted |
| `StatusBadge` | `Badge.tsx` | Auto-maps domain status strings to badge variants |
| `Modal` | `Modal.tsx` | Portal-rendered glass modal with Escape-to-close + body scroll lock |
| `ConfirmModal` | `Modal.tsx` | Pre-built confirm/cancel dialog |
| `Table` | `Table.tsx` | Glass-wrapped table with `Th` (sortable), `Td`, `TableRow` |
| `Skeleton` | `Skeleton.tsx` | `SkeletonCard`, `SkeletonTable`, `SkeletonMetricCard`, `SkeletonRow` |
| `StatCard` | `StatCard.tsx` | Metric card with label, value, sub-text, icon, optional trend |
| `Pagination` | `Pagination.tsx` | Prev/Next cursor pagination |
| `EmptyState` | `Pagination.tsx` | Icon + title + description + optional CTA |
| `ErrorState` | `Pagination.tsx` | Error display with retry button |
| `Spinner` | `Pagination.tsx` | Animated spinner — sizes sm/md/lg |
| `FullPageSpinner` | `Pagination.tsx` | Centered full-screen spinner for layout loading states |

---

## Backend Endpoints Summary

Complete list of every API endpoint the frontend calls, for backend cross-reference:

### Auth
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
GET    /api/auth/verify-email?token=
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

### Users
```
POST   /api/users/change-password
PATCH  /api/users/profile               (multipart — avatar upload)
```

### Companies
```
POST   /api/companies
GET    /api/companies/me/profile
PATCH  /api/companies/me/profile
GET    /api/companies/:id
GET    /api/companies?type=&city=&search=
```

### Products
```
GET    /api/products?search=&category=&city=&minRating=&isVerified=&financingMethod=&cursor=&limit=
GET    /api/products/:id
GET    /api/products/my/listings
POST   /api/products                    (multipart — images)
PATCH  /api/products/:id
DELETE /api/products/:id
```

### RFQs
```
GET    /api/rfqs?role=buyer|supplier&status=&cursor=&limit=
GET    /api/rfqs/:id
POST   /api/rfqs
POST   /api/rfqs/:id/counter
POST   /api/rfqs/:id/accept
POST   /api/rfqs/:id/decline
```

### Purchase Orders
```
GET    /api/purchase-orders?role=buyer|supplier&paymentStatus=&cursor=&limit=
GET    /api/purchase-orders/:id
PATCH  /api/purchase-orders/:id/fulfilment
POST   /api/purchase-orders/:id/cancel
POST   /api/purchase-orders/:id/payments
GET    /api/purchase-orders/:id/payments
```

### Loans
```
GET    /api/loans
GET    /api/loans/:id
POST   /api/loans
POST   /api/loans/:id/submit
POST   /api/loans/:id/documents          (multipart — KYC documents)
```

### Optimizer (proxied to Python ML service)
```
POST   /api/optimizer/schedule
```

### Credit Scores
```
GET    /api/credit-scores/me
GET    /api/credit-scores/me/history
```

### Notifications
```
GET    /api/notifications
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/read-all
```

### Reviews
```
POST   /api/reviews
GET    /api/reviews?companyId=
```

### Underwriter
```
GET    /api/underwriter/queue?status=&cursor=&limit=
GET    /api/underwriter/applications/:id
POST   /api/underwriter/applications/:id/request-docs
POST   /api/underwriter/applications/:id/approve
POST   /api/underwriter/applications/:id/reject
GET    /api/underwriter/documents/:id/view
```

### Dashboard aggregates (⚠️ need backend implementation)
```
GET    /api/buyer/dashboard
GET    /api/supplier/dashboard
GET    /api/underwriter/dashboard
```

---

## Response Shape Convention

All endpoints return the same envelope:

```json
// Success
{ "success": true, "data": <T>, "message": "optional" }

// Error
{ "success": false, "error": "human readable", "code": "MACHINE_CODE", "details": {} }
```

Paginated endpoints return:
```json
{ "success": true, "data": { "items": [], "nextCursor": "lastId", "total": 0 } }
```

---

## Notes for Backend Cross-Reference

1. **Three dashboard endpoints don't exist yet** — `GET /api/buyer/dashboard`, `GET /api/supplier/dashboard`, `GET /api/underwriter/dashboard`. The frontend expects pre-aggregated data from a single call rather than making 4+ parallel calls per dashboard load.

2. **`GET /api/underwriter/applications/:id`** must return the loan application with `company`, `documents[]`, and `po` as populated objects, not raw ObjectIds.

3. **`GET /api/rfqs/:id`** must return `buyerId`, `supplierId`, and `productId` as populated objects.

4. **`GET /api/purchase-orders/:id`** must return `buyerId`, `supplierId`, and `productId` as populated objects.

5. **The `role` query param** on `/api/rfqs` and `/api/purchase-orders` is used to filter by the current user's perspective (buyer = show where `buyerId === me`, supplier = show where `supplierId === me`).

6. **`PATCH /api/notifications/read-all`** — ensure this route exists; some backends implement it as `POST /api/notifications/read-all`.

7. **Document signed URLs** expire in 15 minutes per the design spec. The frontend never caches them and calls the view endpoint fresh every time.

---

*Frontend codebase by: Aniruddh Ballal*
*Document generated: April 2026*