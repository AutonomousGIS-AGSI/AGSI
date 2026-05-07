import os
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_2019_annual_records.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_2019_with_geoid.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# ---- Load ----------------------------------------------------------------
df = pd.read_csv(INPUT_PATH)

# ---- Create county GEOID (state_code zfill(2) + county_code zfill(3)) ----
required_cols = ["state_code", "county_code"]
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {df.columns.tolist()}")

state = df["state_code"].astype(str).str.strip()
county = df["county_code"].astype(str).str.strip()

# Treat common "missing" string tokens as NA after string conversion
na_tokens = {"", "nan", "none", "null", "<na>"}
state_is_na = state.str.lower().isin(na_tokens)
county_is_na = county.str.lower().isin(na_tokens)

df["GEOID"] = pd.NA
mask = (~state_is_na) & (~county_is_na)
df.loc[mask, "GEOID"] = state.loc[mask].str.zfill(2) + county.loc[mask].str.zfill(3)

# ---- Save ----------------------------------------------------------------
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
df.to_csv(OUTPUT_PATH, index=False)