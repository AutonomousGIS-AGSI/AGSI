import os
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/outputs/DataRetrieverOutput/California_Counties_Gini_2019.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/gini_2019_filtered.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# ---- Load ---------------------------------------------------------------
df = pd.read_csv(INPUT_PATH, dtype="object")

# ---- Filter year == 2019 (handle object dtype robustly) -----------------
year_str = df["year"].astype(str).str.strip()
df_2019 = df.loc[year_str.eq("2019")].copy()

# ---- Keep only required columns ----------------------------------------
keep_cols = ["state_fips", "county_fips", "B19083_001E:Gini Index"]
df_2019 = df_2019[keep_cols]

# ---- Save ---------------------------------------------------------------
os.makedirs(OUTPUT_DIR, exist_ok=True)
df_2019.to_csv(OUTPUT_PATH, index=False)