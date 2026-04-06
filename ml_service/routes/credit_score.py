"""
POST /credit-score

Computes a 300–900 credit score for a Company based on their Credex activity.
Called by the Node backend's daily cron job for every active company.

Score formula (from skills-instructions.md):
  base = 300
  paymentComponent    = onTimePaymentRate × 250          (max 250 pts)
  volumeComponent     = min(totalPOsCompleted / 100, 1) × 100  (max 100 pts)
  reviewComponent     = (averageReviewScore / 5) × 100   (max 100 pts)
  disputePenalty      = disputeRate × -150               (up to -150 pts)
  loanComponent       = loanRepaymentRate × 100          (max 100 pts)
  verificationBonus   = 50 if isVerified else 0
  tenureBonus         = min(daysSinceFirstTransaction / 365, 1) × 50 (max 50 pts)

  total = base + sum(components), clamped to [300, 900]

Tier mapping:
  300–499  → bronze
  500–649  → silver
  650–799  → gold
  800–900  → platinum
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreditScoreRequest(BaseModel):
    companyId: str

    # Payment behaviour
    totalPOsCompleted: int = Field(0, ge=0)
    onTimePaymentRate: float = Field(1.0, ge=0.0, le=1.0,
        description="Payments made on or before deadline / total payments")

    # Review signals
    averageReviewScore: float = Field(0.0, ge=0.0, le=5.0,
        description="Average of all reviews received by this company")

    # Dispute signals
    disputeRate: float = Field(0.0, ge=0.0, le=1.0,
        description="POs with disputes / total POs")

    # Loan repayment (1.0 if company has no loans — doesn't penalise new companies)
    loanRepaymentRate: float = Field(1.0, ge=0.0, le=1.0,
        description="EMIs paid on time / total EMIs due. Pass 1.0 if no loan history.")

    # Verification
    isVerified: bool = False

    # Tenure
    daysSinceFirstTransaction: int = Field(0, ge=0,
        description="Days since the company's first completed PO on Credex")


class ScoreBreakdown(BaseModel):
    base: float
    paymentComponent: float
    volumeComponent: float
    reviewComponent: float
    disputePenalty: float
    loanComponent: float
    verificationBonus: float
    tenureBonus: float
    total: float


class CreditScoreResponse(BaseModel):
    companyId: str
    score: int               # 300–900
    tier: str                # "bronze" | "silver" | "gold" | "platinum"
    breakdown: ScoreBreakdown
    improvementTips: list[str]


# ---------------------------------------------------------------------------
# Tier helper
# ---------------------------------------------------------------------------

def _tier(score: int) -> str:
    if score < 500:
        return "bronze"
    elif score < 650:
        return "silver"
    elif score < 800:
        return "gold"
    else:
        return "platinum"


# ---------------------------------------------------------------------------
# Improvement tips
# ---------------------------------------------------------------------------

def _improvement_tips(req: CreditScoreRequest, score: int) -> list[str]:
    tips: list[str] = []

    if req.onTimePaymentRate < 0.95:
        missed_pct = (1 - req.onTimePaymentRate) * 100
        potential = (0.95 - req.onTimePaymentRate) * 250
        tips.append(
            f"Pay on time — you're missing {missed_pct:.0f}% of deadlines. "
            f"Getting to 95% on-time rate could add ~{potential:.0f} points."
        )

    if req.totalPOsCompleted < 100:
        remaining = 100 - req.totalPOsCompleted
        tips.append(
            f"Complete more orders — {remaining} more completed POs needed to max the volume score."
        )

    if req.averageReviewScore < 4.0:
        tips.append(
            f"Improve your review score — currently {req.averageReviewScore:.1f}/5.0. "
            "Respond quickly to RFQs and deliver on time to earn better reviews."
        )

    if req.disputeRate > 0.05:
        tips.append(
            f"Reduce disputes — your current rate is {req.disputeRate:.0%}. "
            "Use Credex chat to resolve issues before they escalate."
        )

    if not req.isVerified:
        tips.append(
            "Get verified — complete company verification to unlock +50 points and the verified badge."
        )

    if req.daysSinceFirstTransaction < 365:
        days_remaining = 365 - req.daysSinceFirstTransaction
        tips.append(
            f"Build tenure — {days_remaining} more days of activity needed to max the tenure bonus."
        )

    if req.loanRepaymentRate < 1.0 and req.loanRepaymentRate > 0:
        tips.append(
            f"Repay loans on schedule — current EMI on-time rate is {req.loanRepaymentRate:.0%}. "
            "This could add up to 100 points."
        )

    return tips[:4]  # surface the top 4 most actionable tips


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("", response_model=CreditScoreResponse)
async def compute_credit_score(req: CreditScoreRequest) -> CreditScoreResponse:
    base = 300.0

    payment_component = req.onTimePaymentRate * 250
    volume_component = min(req.totalPOsCompleted / 100, 1.0) * 100
    review_component = (req.averageReviewScore / 5.0) * 100
    dispute_penalty = req.disputeRate * -150
    loan_component = req.loanRepaymentRate * 100
    verification_bonus = 50.0 if req.isVerified else 0.0
    tenure_bonus = min(req.daysSinceFirstTransaction / 365, 1.0) * 50

    raw_score = (
        base
        + payment_component
        + volume_component
        + review_component
        + dispute_penalty
        + loan_component
        + verification_bonus
        + tenure_bonus
    )

    # Clamp to [300, 900]
    final_score = int(max(300, min(900, round(raw_score))))

    breakdown = ScoreBreakdown(
        base=base,
        paymentComponent=round(payment_component, 2),
        volumeComponent=round(volume_component, 2),
        reviewComponent=round(review_component, 2),
        disputePenalty=round(dispute_penalty, 2),
        loanComponent=round(loan_component, 2),
        verificationBonus=verification_bonus,
        tenureBonus=round(tenure_bonus, 2),
        total=round(raw_score, 2),
    )

    tips = _improvement_tips(req, final_score)

    return CreditScoreResponse(
        companyId=req.companyId,
        score=final_score,
        tier=_tier(final_score),
        breakdown=breakdown,
        improvementTips=tips,
    )