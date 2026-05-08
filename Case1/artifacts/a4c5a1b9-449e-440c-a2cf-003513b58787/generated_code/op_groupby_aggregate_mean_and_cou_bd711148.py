import os
import numpy as np
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_2019_with_geoid.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_county_2019.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

# ---- Load ----------------------------------------------------------------
df = pd.read_csv(INPUT_PATH, dtype=str)

# ---- Clean/normalize needed fields ---------------------------------------
# GEOID: strip; zfill to modal width to preserve leading zeros (county GEOID usually width=5)
df["GEOID"] = df["GEOID"].astype(str).str.strip()
geoid_len = df["GEOID"].dropna().str.len()
if not geoid_len.empty:
    key_width = int(geoid_len.mode().iloc[0])
    df["GEOID"] = df["GEOID"].str.zfill(key_width)

# arithmetic_mean: numeric for mean aggregation
df["arithmetic_mean"] = pd.to_numeric(df["arithmetic_mean"], errors="coerce")

# site_number: keep as string; count non-null per GEOID
df["site_number"] = df["site_number"].astype(str).replace({"nan": np.nan}).str.strip()

# Drop rows without GEOID (cannot aggregate)
df = df.dropna(subset=["GEOID"])

# ---- Aggregate ------------------------------------------------------------
out = (
    df.groupby("GEOID", as_index=False)
    .agg(
        pm25_mean_2019=("arithmetic_mean", "mean"),
        pm25_site_count_2019=("site_number", "count"),
    )
)

# ---- Save ----------------------------------------------------------------
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
out.to_csv(OUTPUT_PATH, index=False)