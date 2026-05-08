import os
import numpy as np
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_asthma_prox_acs.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_completecases.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# ---- Step 3: Load --------------------------------------------------------
df = pd.read_csv(INPUT_PATH, dtype={"GEOID": "string"})

required_cols = [
    "Asthma_prev",
    "nearest_hw_dist_m",
    "ratio_poverty",
    "ratio_uninsured",
    "med_income",
    "ratio_black",
    "ratio_hispanic",
]

# Coerce required fields to numeric so blanks/non-numeric become NaN
for c in required_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

# Treat common Census sentinels as missing (in case present)
df = df.replace([-666666666, -888888888, -999999999], np.nan)

# Keep complete cases for required modeling fields
df_cc = df.dropna(subset=required_cols).copy()

# ---- Save ----------------------------------------------------------------
os.makedirs(OUTPUT_DIR, exist_ok=True)
df_cc.to_csv(OUTPUT_PATH, index=False)