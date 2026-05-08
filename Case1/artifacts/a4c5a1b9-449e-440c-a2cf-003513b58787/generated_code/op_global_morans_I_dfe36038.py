import os
import numpy as np
import pandas as pd
import geopandas as gpd
from libpysal.weights import Queen, KNN
from esda.moran import Moran

# ----------------------------
# Paths (given)
# ----------------------------
COUNTIES_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_2019_qc.gpkg"
WEIGHTS_REF_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ca_county_queen_weights_2019.gpkg"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_global_moransI_2019.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------
# Load inputs
# ----------------------------
gdf = gpd.read_file(COUNTIES_PATH)
_ = gpd.read_file(WEIGHTS_REF_PATH)  # reference input (not required to compute Queen weights)

target_col = "pm25_mean_2019"

# ----------------------------
# Validate / clean geometry & target values
# ----------------------------
gdf = gdf[gdf.geometry.notna()]
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

gdf = gdf.dropna(subset=[target_col]).reset_index(drop=True)

if len(gdf) == 0:
    raise ValueError(f"No rows available after dropping NA in '{target_col}' and invalid/empty geometries.")
if len(gdf) < 3:
    raise ValueError(f"Need at least 3 observations for Moran's I; got n={len(gdf)}.")

# ----------------------------
# Build Queen contiguity weights (row-standardized), handle islands
# ----------------------------
w = Queen.from_dataframe(gdf, use_index=False)

# If islands exist, fall back to KNN to ensure all observations have neighbors
used_weights = "queen"
if getattr(w, "islands", None):
    if len(w.islands) > 0:
        w = KNN.from_dataframe(gdf, k=5)
        used_weights = "knn_k5_fallback_from_queen_islands"

w.transform = "r"

# ----------------------------
# Global Moran's I (permutation inference)
# ----------------------------
permutations = 999
y = gdf[target_col].to_numpy(dtype=float)

mi = Moran(y, w, permutations=permutations)

results = pd.DataFrame(
    [
        {
            "variable": target_col,
            "weights": used_weights,
            "n": int(len(gdf)),
            "permutations": int(permutations),
            "morans_I": float(mi.I),
            "expected_I": float(mi.EI),
            "variance": float(mi.VI_sim),
            "z_score": float(mi.z_sim),
            "p_value": float(mi.p_sim),
        }
    ]
)

# ----------------------------
# Save primary output
# ----------------------------
results.to_csv(OUTPUT_NODE_PATH, index=False)

# Also save a manuscript-table copy and register it
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "pm25_global_moransI_2019.csv")
results.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Global Moran’s I (Queen contiguity; row-standardized) for county-level PM2.5 mean in 2019, reporting permutation-based variance, z-score, and p-value.",
    role="final",
    columns=["variable", "weights", "n", "permutations", "morans_I", "expected_I", "variance", "z_score", "p_value"],
)