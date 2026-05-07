import os
import json
import numpy as np
import geopandas as gpd
from libpysal.weights import Queen
from esda.moran import Moran

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_asthma_proximity.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/global_moransI_asthma.json"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# ----------------------------
# Load + basic validation
# ----------------------------
gdf = gpd.read_file(INPUT_PATH)

# Validate geometry before spatial operations
gdf = gdf[gdf.geometry.notna()]
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

target_col = "Asthma_prev"
gdf = gdf.dropna(subset=[target_col]).reset_index(drop=True)

if len(gdf) == 0:
    raise ValueError(f"No rows available after dropping NA in '{target_col}' and invalid/empty geometries.")
if len(gdf) < 3:
    raise ValueError(f"Need at least 3 polygons to compute Moran's I; got n={len(gdf)}.")

# ----------------------------
# Queen contiguity weights
# ----------------------------
w = Queen.from_dataframe(gdf, use_index=False)
w.transform = "r"  # row-standardize

# ----------------------------
# Global Moran's I (permutation inference)
# ----------------------------
permutations = 999
y = gdf[target_col].to_numpy(dtype=float)

mi = Moran(y, w, permutations=permutations)

# Prepare results
results = {
    "variable": target_col,
    "n": int(len(gdf)),
    "weights": {
        "type": "queen_contiguity",
        "transform": "row_standardized",
        "n_islands": int(len(w.islands)) if hasattr(w, "islands") and w.islands is not None else 0,
        "islands": list(map(int, w.islands)) if hasattr(w, "islands") and w.islands else [],
        "permutations": int(permutations),
    },
    "global_morans_I": {
        "I": float(mi.I),
        "expected_I": float(mi.EI),
        "z_score_permutation": float(mi.z_sim),
        "p_value_permutation": float(mi.p_sim),
        "z_score_normal": float(mi.z_norm),
        "p_value_normal": float(mi.p_norm),
        "variance_sim": float(mi.VI_sim),
        "variance_norm": float(mi.VI_norm),
    },
}

# ----------------------------
# Save output JSON
# ----------------------------
os.makedirs(OUTPUT_DIR, exist_ok=True)
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)