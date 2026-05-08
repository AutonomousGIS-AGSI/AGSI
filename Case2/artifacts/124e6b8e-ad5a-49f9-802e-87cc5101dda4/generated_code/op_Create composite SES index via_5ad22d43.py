import os
import numpy as np
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression_with_index.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4"

# ---- Load -----------------------------------------------------------------
df = pd.read_csv(INPUT_PATH, dtype={"GEOID": "string"})

# ---- Validate required columns --------------------------------------------
required_cols = [
    "Med_income",
    "percent_>=HighSch",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
]
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise KeyError(
        f"Missing required columns for SES_index: {missing}. "
        f"Available columns: {list(df.columns)}"
    )

# ---- Clean/convert to numeric ---------------------------------------------
sentinels = [-666666666, -888888888, -999999999]
for c in required_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")
df = df.replace(sentinels, np.nan)

# ---- Compute z-scores ------------------------------------------------------
def zscore(series: pd.Series) -> pd.Series:
    s = series.astype(float)
    mu = s.mean(skipna=True)
    sigma = s.std(skipna=True, ddof=0)
    if pd.isna(sigma) or sigma == 0:
        return pd.Series(np.nan, index=s.index, dtype="float64")
    return (s - mu) / sigma

z_med_income = zscore(df["Med_income"])
z_highsch = zscore(df["percent_>=HighSch"])

z_poverty = zscore(df["percent_Poverty"])
z_unemployed = zscore(df["percent_Unemployed"])
z_uninsured = zscore(df["percent_Uninsured"])

# SES: positive for income/education; negative for poverty/unemployment/uninsured
ses_components = pd.DataFrame(
    {
        "z_Med_income": z_med_income,
        "z_percent_>=HighSch": z_highsch,
        "neg_z_percent_Poverty": -z_poverty,
        "neg_z_percent_Unemployed": -z_unemployed,
        "neg_z_percent_Uninsured": -z_uninsured,
    },
    index=df.index,
)

# Mean of components; require all five present for a non-null SES_index
df["SES_index"] = ses_components.mean(axis=1, skipna=False)

# ---- Save -----------------------------------------------------------------
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
df.to_csv(OUTPUT_PATH, index=False)