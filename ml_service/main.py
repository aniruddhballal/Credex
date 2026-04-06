"""
Credex ML Service — FastAPI entry point
Endpoints:
  GET  /health
  POST /optimize        Cash flow optimizer (PuLP LP solver)
  POST /credit-risk     Credit risk prediction (XGBoost)
  POST /credit-score    Credit score computation (300–900 scale)
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from routes.optimizer import router as optimizer_router
from routes.credit_risk import router as credit_risk_router
from routes.credit_score import router as credit_score_router

load_dotenv()

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models once at startup — not on every request."""
    from routes.credit_risk import load_model as load_credit_risk_model
    load_credit_risk_model()
    print("✅ Credit risk model loaded")
    yield
    print("ML service shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Credex ML Service",
    version="1.0.0",
    description="Cash flow optimizer, credit risk scoring, and credit score engine for Credex.",
    lifespan=lifespan,
)

# CORS — only allow requests from the Node backend
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(optimizer_router, prefix="/optimize", tags=["optimizer"])
app.include_router(credit_risk_router, prefix="/credit-risk", tags=["credit-risk"])
app.include_router(credit_score_router, prefix="/credit-score", tags=["credit-score"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "service": "credex-ml"}