import os
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/gini_2019_filtered.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/gini_2019_with_geoid.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# Helpers are pre-imported in the environment:
# record_figure, record_table, record_data_to_viz

# ----------------------------
# Load
# ----------------------------
df = pd.read_csv(INPUT_PATH)

# ----------------------------
# Create GEOID (county) = state_fips (2) + county_fips (3)
# ----------------------------
df["state_fips"] = df["state_fips"].astype(str).str.strip().str.zfill(2)
df["county_fips"] = df["county_fips"].astype(str).str.strip().str.zfill(3)
df["GEOID"] = df["state_fips"] + df["county_fips"]

# ----------------------------
# Retain only requested columns
# ----------------------------
out = df[["GEOID", "B19083_001E:Gini Index"]].copy()
out["GEOID"] = out["GEOID"].astype(str).str.strip().str.zfill(5)

# Drop rows where GEOID is missing/invalid after formatting
out = out.dropna(subset=["GEOID"])
out = out.loc[out["GEOID"].str.len() == 5].reset_index(drop=True)

# ----------------------------
# Save
# ----------------------------
os.makedirs(OUTPUT_DIR, exist_ok=True)
out.to_csv(OUTPUT_PATH, index=False)