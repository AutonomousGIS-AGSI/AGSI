import os
import numpy as np
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_completecases.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_features.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# ----------------------------
# Load
# ----------------------------
df = pd.read_csv(INPUT_PATH, dtype={"GEOID": "string"})

# Enforce expected columns (from get_columns)
required_cols = [
    "GEOID",
    "Asthma_prev",
    "nearest_hw_dist_m",
    "hw_count_5km",
    "ratio_poverty",
    "ratio_uninsured",
    "med_income",
    "ratio_black",
    "ratio_hispanic",
]
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {df.columns.tolist()}")

# Normalize GEOID
df["GEOID"] = df["GEOID"].astype("string").str.strip()

# ----------------------------
# Numeric coercion
# (get_columns shows these are object; coerce to numeric)
# ----------------------------
num_cols = [
    "Asthma_prev",
    "nearest_hw_dist_m",
    "hw_count_5km",
    "ratio_poverty",
    "ratio_uninsured",
    "med_income",
    "ratio_black",
    "ratio_hispanic",
]
for c in num_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

# Replace common Census sentinels if present
df = df.replace([-666666666, -888888888, -999999999], np.nan)

# ----------------------------
# Feature engineering
# ----------------------------
# ln_nearest_hw_dist_m = ln(nearest_hw_dist_m + 1)
# Guard against negative distances (invalid); set to NaN so log isn't defined
df.loc[df["nearest_hw_dist_m"] < 0, "nearest_hw_dist_m"] = np.nan
df["ln_nearest_hw_dist_m"] = np.log(df["nearest_hw_dist_m"] + 1.0)

# Z-scores (population std, ddof=0); if std==0 or NaN, return NaN
def zscore(s: pd.Series) -> pd.Series:
    mu = s.mean(skipna=True)
    sigma = s.std(skipna=True, ddof=0)
    if pd.isna(sigma) or sigma == 0:
        return pd.Series(np.nan, index=s.index)
    return (s - mu) / sigma

df["z_ratio_poverty"] = zscore(df["ratio_poverty"])
df["z_ratio_uninsured"] = zscore(df["ratio_uninsured"])
df["z_med_income"] = zscore(df["med_income"])
df["z_ratio_black"] = zscore(df["ratio_black"])
df["z_ratio_hispanic"] = zscore(df["ratio_hispanic"])

# Interaction terms
df["ln_nearest_hw_dist_m_x_z_ratio_poverty"] = df["ln_nearest_hw_dist_m"] * df["z_ratio_poverty"]
df["ln_nearest_hw_dist_m_x_z_ratio_black"] = df["ln_nearest_hw_dist_m"] * df["z_ratio_black"]

# ----------------------------
# Save
# ----------------------------
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
df.to_csv(OUTPUT_PATH, index=False)