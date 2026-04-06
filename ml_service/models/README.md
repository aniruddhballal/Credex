# This directory holds serialised ML model files (.pkl).
# These files are NOT committed to git — they are generated locally and
# copied to the production server / Render environment.
#
# Files expected:
#   credit_risk.pkl   — XGBoost credit risk classifier
#                       Generate with: python models/train_credit_risk.py
#
# If credit_risk.pkl is missing, the service falls back to the
# deterministic heuristic scorer in routes/credit_risk.py.