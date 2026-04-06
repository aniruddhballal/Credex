"""
POST /credit-risk

Predicts the credit risk for a loan application.
Model: XGBoost classifier (.pkl) trained in LOANlo, loaded once at startup.

If no .pkl file is found (first run / local dev), falls back to a
deterministic heuristic scorer so the rest of the system works immediately.

The Node backend calls this endpoint at loan submission time. The score is
stored on LoanApplication.creditRiskScore and shown to underwriters as a
decision aid — not the final word.

Output:
  riskScore:   0.0–1.0  (probability of default; higher = riskier)
  riskTier:    "low" | "medium" | "high" | "very_high"
  confidence:  0.0–1.0  (model confidence in the prediction)
  flags:       list of human-readable risk flags for the underwriter
"""

from __future__ import annotations

import os
import joblib
import numpy as np
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

# ---------------------------------------------------------------------------
# Model loading (called once at startup from main.py)
# ---------------------------------------------------------------------------

_model = None
_MODEL_PATH = Path(__file__).parent.parent / "models" / "credit_risk.pkl"


def load_model() -> None:
    global _model
    if _MODEL_PATH.exists():
        _model = joblib.load(_MODEL_PATH)
        print(f"✅ Loaded credit risk model from {_MODEL_PATH}")
    else:
        _model = None
        print(
            f"⚠️  No credit risk model found at {_MODEL_PATH}. "
            "Falling back to heuristic scorer. "
            "Train a model and save it to models/credit_risk.pkl to enable XGBoost."
        )


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreditRiskRequest(BaseModel):
    # Applicant / company profile
    companyAgeYears: float = Field(..., ge=0, description="Years the company has been operating")
    annualRevenuePaise: float = Field(..., ge=0, description="Annual revenue in paise")
    existingLoanCount: int = Field(0, ge=0, description="Number of active loans")
    existingLoanTotalPaise: float = Field(0.0, ge=0, description="Total outstanding loan principal in paise")

    # Credex transaction history
    totalPOsCompleted: int = Field(0, ge=0)
    onTimePaymentRate: float = Field(1.0, ge=0.0, le=1.0, description="Fraction of payments made on/before deadline")
    averageReviewScore: float = Field(3.0, ge=0.0, le=5.0)
    disputeRate: float = Field(0.0, ge=0.0, le=1.0, description="Fraction of POs that had disputes")

    # Loan request
    requestedAmountPaise: float = Field(..., ge=0, description="Loan amount requested in paise")
    loanTenureMonths: int = Field(..., ge=1, le=360)
    purposeCategory: str = Field("working_capital", description="Loan purpose: working_capital | equipment | property | other")

    # KYC / verification
    isGSTVerified: bool = False
    isPANVerified: bool = False
    isUdyamRegistered: bool = False


class CreditRiskResponse(BaseModel):
    riskScore: float        # 0.0–1.0 (probability of default)
    riskTier: str           # "low" | "medium" | "high" | "very_high"
    confidence: float       # 0.0–1.0
    flags: list[str]        # human-readable flags for the underwriter
    modelUsed: str          # "xgboost" | "heuristic"


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

PURPOSE_MAP = {"working_capital": 0, "equipment": 1, "property": 2, "other": 3}

def _extract_features(req: CreditRiskRequest) -> np.ndarray:
    """Convert request into a flat feature vector for the XGBoost model."""
    debt_to_revenue = (
        req.existingLoanTotalPaise / req.annualRevenuePaise
        if req.annualRevenuePaise > 0
        else 1.0
    )
    loan_to_revenue = (
        req.requestedAmountPaise / req.annualRevenuePaise
        if req.annualRevenuePaise > 0
        else 1.0
    )
    return np.array([[
        req.companyAgeYears,
        min(req.annualRevenuePaise / 1e7, 100),   # normalise to crores
        req.existingLoanCount,
        min(debt_to_revenue, 10),
        min(loan_to_revenue, 10),
        req.totalPOsCompleted,
        req.onTimePaymentRate,
        req.averageReviewScore,
        req.disputeRate,
        req.loanTenureMonths,
        PURPOSE_MAP.get(req.purposeCategory, 3),
        int(req.isGSTVerified),
        int(req.isPANVerified),
        int(req.isUdyamRegistered),
    ]])


# ---------------------------------------------------------------------------
# Heuristic fallback scorer
# (used when no .pkl model is available — deterministic, interpretable)
# ---------------------------------------------------------------------------

def _heuristic_score(req: CreditRiskRequest) -> tuple[float, float]:
    """
    Returns (risk_score, confidence).
    risk_score: 0.0 (no risk) → 1.0 (certain default)
    Confidence is lower for the heuristic than the trained model.
    """
    score = 0.0

    # Payment history — most important signal
    score += (1.0 - req.onTimePaymentRate) * 0.35

    # Dispute rate
    score += req.disputeRate * 0.15

    # Debt load
    if req.annualRevenuePaise > 0:
        dtr = req.existingLoanTotalPaise / req.annualRevenuePaise
        score += min(dtr / 2, 0.2)  # cap at 0.2 contribution

    # Loan-to-revenue
    if req.annualRevenuePaise > 0:
        ltr = req.requestedAmountPaise / req.annualRevenuePaise
        score += min(ltr / 3, 0.15)

    # Company maturity — young companies riskier
    if req.companyAgeYears < 1:
        score += 0.10
    elif req.companyAgeYears < 2:
        score += 0.05

    # Verification reduces risk
    if req.isGSTVerified:
        score -= 0.03
    if req.isPANVerified:
        score -= 0.02
    if req.isUdyamRegistered:
        score -= 0.02

    # Transaction volume — more history = more confidence, lower risk
    if req.totalPOsCompleted >= 10:
        score -= 0.05

    return max(0.0, min(1.0, score)), 0.65  # heuristic confidence capped at 0.65


# ---------------------------------------------------------------------------
# Flag generation
# ---------------------------------------------------------------------------

def _generate_flags(req: CreditRiskRequest, risk_score: float) -> list[str]:
    flags: list[str] = []

    if req.onTimePaymentRate < 0.7:
        flags.append(
            f"Low on-time payment rate: {req.onTimePaymentRate:.0%} "
            "(platform average is 85%+)"
        )
    if req.disputeRate > 0.1:
        flags.append(f"High dispute rate: {req.disputeRate:.0%} of orders")
    if req.existingLoanCount >= 3:
        flags.append(f"Multiple active loans: {req.existingLoanCount}")
    if req.annualRevenuePaise > 0:
        dtr = req.existingLoanTotalPaise / req.annualRevenuePaise
        if dtr > 1.0:
            flags.append(f"Debt-to-revenue ratio is high: {dtr:.1f}x")
        ltr = req.requestedAmountPaise / req.annualRevenuePaise
        if ltr > 0.5:
            flags.append(
                f"Requested loan is {ltr:.0%} of annual revenue — consider requesting fewer documents"
            )
    if req.companyAgeYears < 1:
        flags.append("Company is less than 1 year old — limited operating history")
    if not req.isGSTVerified:
        flags.append("GST not verified — recommend requesting GSTIN certificate")
    if req.totalPOsCompleted < 5:
        flags.append(
            f"Limited transaction history on Credex ({req.totalPOsCompleted} POs completed)"
        )
    if risk_score >= 0.7:
        flags.append("⚠️ High default probability — recommend requesting additional collateral")

    return flags


# ---------------------------------------------------------------------------
# Tier mapping
# ---------------------------------------------------------------------------

def _risk_tier(score: float) -> str:
    if score < 0.25:
        return "low"
    elif score < 0.50:
        return "medium"
    elif score < 0.75:
        return "high"
    else:
        return "very_high"


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("", response_model=CreditRiskResponse)
async def predict_credit_risk(req: CreditRiskRequest) -> CreditRiskResponse:
    if _model is not None:
        # XGBoost path
        features = _extract_features(req)
        prob = float(_model.predict_proba(features)[0][1])  # P(default)
        # XGBoost doesn't expose a direct confidence; use max class probability
        proba = _model.predict_proba(features)[0]
        confidence = float(max(proba))
        model_used = "xgboost"
    else:
        # Heuristic fallback
        prob, confidence = _heuristic_score(req)
        model_used = "heuristic"

    flags = _generate_flags(req, prob)
    tier = _risk_tier(prob)

    return CreditRiskResponse(
        riskScore=round(prob, 4),
        riskTier=tier,
        confidence=round(confidence, 4),
        flags=flags,
        modelUsed=model_used,
    )