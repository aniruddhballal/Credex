"""
ml-service/models/train_credit_risk.py

One-time training script for the XGBoost credit risk model.
Run this locally with real data from MongoDB to produce credit_risk.pkl.

Usage:
  python models/train_credit_risk.py --data path/to/training_data.csv

The CSV should have columns matching the feature vector in credit_risk.py:
  company_age_years, annual_revenue_paise, existing_loan_count,
  debt_to_revenue, loan_to_revenue, total_pos_completed,
  on_time_payment_rate, average_review_score, dispute_rate,
  loan_tenure_months, purpose_category, is_gst_verified,
  is_pan_verified, is_udyam_registered, defaulted (0/1 label)

Until real training data is available, this script generates synthetic data
for a baseline model. Replace with real data before going to production.

The heuristic fallback in credit_risk.py is active whenever credit_risk.pkl
does not exist — so the system works end-to-end before the model is trained.
"""

import argparse
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report
from xgboost import XGBClassifier

OUTPUT_PATH = Path(__file__).parent / "credit_risk.pkl"

FEATURE_COLS = [
    "company_age_years",
    "annual_revenue_crores",   # normalised from paise
    "existing_loan_count",
    "debt_to_revenue",
    "loan_to_revenue",
    "total_pos_completed",
    "on_time_payment_rate",
    "average_review_score",
    "dispute_rate",
    "loan_tenure_months",
    "purpose_category",
    "is_gst_verified",
    "is_pan_verified",
    "is_udyam_registered",
]

LABEL_COL = "defaulted"


# ---------------------------------------------------------------------------
# Synthetic data generator (for baseline / testing only)
# ---------------------------------------------------------------------------

def generate_synthetic_data(n: int = 5000, seed: int = 42) -> pd.DataFrame:
    """
    Generate a synthetic dataset that has realistic correlations:
    - Low on_time_payment_rate → higher default probability
    - High dispute_rate → higher default probability
    - Verified companies → lower default probability
    - Young companies → slightly higher default probability
    """
    rng = np.random.default_rng(seed)

    data = pd.DataFrame({
        "company_age_years": rng.exponential(scale=4, size=n).clip(0, 30),
        "annual_revenue_crores": rng.lognormal(mean=2, sigma=1.5, size=n).clip(0.1, 10000),
        "existing_loan_count": rng.integers(0, 5, size=n),
        "debt_to_revenue": rng.exponential(scale=0.3, size=n).clip(0, 5),
        "loan_to_revenue": rng.exponential(scale=0.2, size=n).clip(0, 5),
        "total_pos_completed": rng.integers(0, 200, size=n),
        "on_time_payment_rate": rng.beta(a=8, b=2, size=n),
        "average_review_score": rng.beta(a=7, b=2, size=n) * 5,
        "dispute_rate": rng.beta(a=1, b=20, size=n),
        "loan_tenure_months": rng.choice([12, 24, 36, 48, 60, 84, 120], size=n),
        "purpose_category": rng.integers(0, 4, size=n),
        "is_gst_verified": rng.integers(0, 2, size=n),
        "is_pan_verified": rng.integers(0, 2, size=n),
        "is_udyam_registered": rng.integers(0, 2, size=n),
    })

    # Generate labels with realistic correlations
    default_prob = (
        0.05
        + (1 - data["on_time_payment_rate"]) * 0.40
        + data["dispute_rate"] * 0.20
        + (data["debt_to_revenue"] / 5) * 0.15
        + (data["loan_to_revenue"] / 5) * 0.10
        + np.where(data["company_age_years"] < 1, 0.10, 0)
        - data["is_gst_verified"] * 0.03
        - data["is_pan_verified"] * 0.02
    ).clip(0, 1)

    data[LABEL_COL] = rng.binomial(1, default_prob)

    return data


# ---------------------------------------------------------------------------
# Train
# ---------------------------------------------------------------------------

def train(df: pd.DataFrame) -> None:
    X = df[FEATURE_COLS]
    y = df[LABEL_COL]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    y_pred_proba = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_pred_proba)
    print(f"\nROC-AUC on test set: {auc:.4f}")
    print(classification_report(y_test, model.predict(X_test)))

    joblib.dump(model, OUTPUT_PATH)
    print(f"\n✅ Model saved to {OUTPUT_PATH}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=str, default=None,
                        help="Path to CSV training data. Omit to use synthetic data.")
    parser.add_argument("--n-synthetic", type=int, default=5000,
                        help="Number of synthetic samples (ignored if --data is provided)")
    args = parser.parse_args()

    if args.data:
        print(f"Loading training data from {args.data}...")
        df = pd.read_csv(args.data)
        # Normalise revenue column if it's in paise
        if "annual_revenue_paise" in df.columns:
            df["annual_revenue_crores"] = df["annual_revenue_paise"] / 1e9
        print(f"Loaded {len(df)} rows, {df[LABEL_COL].mean():.1%} default rate")
    else:
        print(f"No data provided — generating {args.n_synthetic} synthetic samples...")
        df = generate_synthetic_data(n=args.n_synthetic)
        print(f"Synthetic default rate: {df[LABEL_COL].mean():.1%}")

    train(df)