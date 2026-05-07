import os
import numpy as np
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_visitation_shares.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_diversity.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

df = pd.read_csv(INPUT_PATH)

share_cols = [
    "share_Full_Service_Restaurant",
    "share_Sport_facilities",
    "share_Parks",
    "share_Fastfood_Restaurant",
    "share_Convenience",
    "share_Supermarket",
    "share_Warehouse",
    "share_Fruit",
    "share_TobaccoStore",
    "share_DrinkingPlaces",
]

missing = [c for c in share_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing required share columns: {missing}. Available columns: {list(df.columns)}")

# Coerce shares to numeric; treat non-parsable / missing as 0
shares = df[share_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)

# Shannon entropy: H = - sum_i p_i * ln(p_i), with convention 0*ln(0)=0
p = shares.to_numpy(dtype=float)
plnp = np.where(p > 0, p * np.log(p), 0.0)
df["mobility_diversity"] = -plnp.sum(axis=1)

df.to_csv(OUTPUT_PATH, index=False)