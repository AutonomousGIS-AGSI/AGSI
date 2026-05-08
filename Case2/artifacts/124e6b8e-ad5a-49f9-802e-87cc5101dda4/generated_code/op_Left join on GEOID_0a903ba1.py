import os
import numpy as np
import pandas as pd

# Helpers are pre-imported in the environment:
# record_figure, record_table, record_data_to_viz

INPUT_ACS_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/acs_places_validated.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------
# Load (single validated input already contains required fields)
# ----------------------------
df = pd.read_csv(INPUT_ACS_PATH, dtype=str)

# ----------------------------
# Enforce required schema (ONLY columns confirmed by get_columns)
# ----------------------------
required_cols = [
    "GEOID",
    "Depression_prev",
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "percent_Black",
    "percent_Hispanic",
    "percent_>=18",
]

available = set(df.columns)
missing = [c for c in required_cols if c not in available]
if missing:
    raise KeyError(
        f"Missing required columns: {missing}. Available columns: {sorted(df.columns.tolist())}"
    )

# ----------------------------
# Clean / normalize
# ----------------------------
out = df.loc[:, required_cols].copy()

# Normalize GEOID for robust joins downstream (county GEOID often width=5)
out["GEOID"] = out["GEOID"].astype(str).str.strip()
# zfill only when GEOID is all digits; keep non-numeric as-is
is_digits = out["GEOID"].str.fullmatch(r"\d+").fillna(False)
out.loc[is_digits, "GEOID"] = out.loc[is_digits, "GEOID"].str.zfill(5)

# Convert non-key columns to numeric where possible; replace common Census sentinels
for c in required_cols:
    if c == "GEOID":
        continue
    out[c] = pd.to_numeric(out[c], errors="coerce")

out = out.replace([-666666666, -888888888, -999999999], np.nan)

# De-duplicate on GEOID to ensure a county-level keyed table
# (If duplicates exist, keep the first non-null values via groupby-first on sorted GEOID)
if out["GEOID"].duplicated().any():
    out = (
        out.sort_values("GEOID")
        .groupby("GEOID", as_index=False)
        .first()
    )

# ----------------------------
# Save primary output
# ----------------------------
out.to_csv(OUTPUT_PATH, index=False)

# Record as data-to-viz (intermediate dataset for downstream mapping/plots)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="County-level table keyed by GEOID with depression prevalence and SES/covariate fields.",
    viz_hint={"type": "table"},
    role="intermediate",
)