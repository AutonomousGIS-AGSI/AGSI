import os
import json
import warnings

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor

# -----------------------------
# Paths
# -----------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_features.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/vif_results.json"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311"

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------------
# Load data
# -----------------------------
df = pd.read_csv(INPUT_PATH)

predictor_cols = [
    "ln_nearest_hw_dist_m",
    "z_ratio_poverty",
    "z_ratio_uninsured",
    "z_med_income",
    "z_ratio_black",
    "z_ratio_hispanic",
]

# Validate required columns exist
missing = [c for c in predictor_cols if c not in df.columns]
if missing:
    raise KeyError(
        f"Missing required predictor columns: {missing}. "
        f"Available columns: {list(df.columns)}"
    )

# -----------------------------
# Prepare X: numeric + complete cases
# -----------------------------
X_df = df[predictor_cols].copy()
for c in predictor_cols:
    X_df[c] = pd.to_numeric(X_df[c], errors="coerce")

n_before = int(len(X_df))
X_df = X_df.dropna(axis=0, how="any").reset_index(drop=True)
n_after = int(len(X_df))
n_dropped = n_before - n_after

if n_after < 3:
    raise ValueError(
        f"Not enough complete cases after dropna for VIF. "
        f"n_before={n_before}, n_after={n_after}."
    )

# Add intercept (const) but exclude it from VIF reporting
X_const = sm.add_constant(X_df, has_constant="add")

# -----------------------------
# Compute VIF
# -----------------------------
vif_rows = []
with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # silence runtime warnings from near-singular fits
    for i, col in enumerate(X_df.columns, start=1):  # start=1 skips const at index 0
        try:
            vif_val = float(variance_inflation_factor(X_const.values, i))
        except Exception:
            vif_val = float("nan")
        vif_rows.append({"variable": col, "vif": vif_val})

vif_df = pd.DataFrame(vif_rows).sort_values("vif", ascending=False).reset_index(drop=True)

# -----------------------------
# Save promoted table (CSV) + primary JSON output
# -----------------------------
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
vif_table_path = os.path.join(tables_dir, "vif_table.csv")
vif_df.to_csv(vif_table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=vif_table_path,
    caption="Variance inflation factors (VIF) for GWR predictor variables to assess multicollinearity.",
    role="promoted",
    columns=["variable", "vif"],
)

result = {
    "predictors": predictor_cols,
    "n_rows_input": n_before,
    "n_rows_used_complete_cases": n_after,
    "n_rows_dropped_due_to_na_or_non_numeric": n_dropped,
    "vif_table": vif_df.to_dict(orient="records"),
    "notes": {
        "interpretation_rule_of_thumb": "VIF > 10 indicates problematic multicollinearity (often also flagged at > 5).",
        "computation": "VIF computed from X with an intercept; reported VIF excludes the intercept.",
    },
}

with open(OUTPUT_NODE_PATH, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2, allow_nan=True)