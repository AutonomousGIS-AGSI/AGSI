import os

import geopandas as gpd
import numpy as np
import pandas as pd  # CHANGED: required for pd.to_numeric

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_urbanrural_2019.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_urbanrural_interaction_2019.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

# --- Load ---
gdf = gpd.read_file(INPUT_PATH)

# --- Validate geometry (required) ---
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

# --- Create interaction term ---
gini_col = "B19083_001E:Gini Index"
metro_col = "Metro2013"
out_col = "gini_x_metro"

missing = [c for c in [gini_col, metro_col] if c not in gdf.columns]
if missing:
    raise KeyError(
        f"Missing required columns: {missing}. Available columns: {list(gdf.columns)}"
    )

# Coerce to numeric to avoid dtype issues; preserve NaNs
gini = pd.to_numeric(gdf[gini_col], errors="coerce")  # CHANGED: safer than astype(float)
metro = pd.to_numeric(gdf[metro_col], errors="coerce")

gdf[out_col] = gini * metro

# --- Save ---
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
gdf.to_file(OUTPUT_PATH, driver="GPKG")