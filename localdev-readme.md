# Credex — Local Development Setup

## Prerequisites
- Node.js 20+, Python 3.11+, MongoDB Atlas cluster

## 1. Run everything

```bash
# Backend
cd backend && npm install && cp .env.example .env && npm run dev

# ML Service
cd ml-service && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

## 2. Verify

| Service    | URL                          | Expected                     |
|------------|------------------------------|------------------------------|
| Backend    | localhost:5000/api/health    | `{"status":"ok"}`            |
| ML Service | localhost:8000/health        | `{"status":"ok","service":"credex-ml"}` |
| Frontend   | localhost:3000               | Redirects to /login          |

## 3. Happy path
```
Supplier → create listing
Buyer    → discover → RFQ → negotiate → accept → PO created
Buyer    → record payment → run cash flow optimizer
Buyer    → apply for loan on PO
UW       → review → approve
```

## Project structure
```
credex/
├── backend/      Node + Express + TypeScript (17 models, all routes)
├── frontend/     Next.js 14 App Router (buyer + supplier + underwriter + auth)
└── ml-service/   Python FastAPI (optimizer, credit risk, credit score)
```

## Deployment (Phase 6)
- Frontend   → Vercel
- Backend    → Render or Railway
- ML Service → Render (separate service, render.yaml included)
- DB         → MongoDB Atlas
- Images     → Cloudinary
- Docs       → Backblaze B2

*Maintained by: Aniruddh Ballal — April 2026*