import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_diversity.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_pca.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------
# Load
# -----------------------
df = pd.read_csv(INPUT_PATH, dtype=str)

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
    raise KeyError(
        f"Missing required share_* columns: {missing}. Available columns: {list(df.columns)}"
    )

# -----------------------
# Prepare PCA inputs (numeric, impute missing)
# -----------------------
X = df[share_cols].apply(pd.to_numeric, errors="coerce")

# If an entire column is NaN, PCA is not defined
all_nan_cols = [c for c in share_cols if X[c].isna().all()]
if all_nan_cols:
    raise ValueError(f"These share_* columns are entirely missing/non-numeric: {all_nan_cols}")

# Mean-impute remaining NaNs (keeps all counties)
col_means = X.mean(axis=0, skipna=True)
X = X.fillna(col_means)

# -----------------------
# Standardize and run PCA
# -----------------------
scaler = StandardScaler(with_mean=True, with_std=True)
Xz = scaler.fit_transform(X.values)

pca = PCA(n_components=2, random_state=0)
scores = pca.fit_transform(Xz)

df["mobility_PC1"] = scores[:, 0]
df["mobility_PC2"] = scores[:, 1]

# -----------------------
# Save
# -----------------------
df.to_csv(OUTPUT_PATH, index=False)