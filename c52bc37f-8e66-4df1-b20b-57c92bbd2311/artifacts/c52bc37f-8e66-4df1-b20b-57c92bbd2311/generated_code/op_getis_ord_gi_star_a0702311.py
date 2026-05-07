import os
import numpy as np
import geopandas as gpd

from libpysal.weights import Queen
from esda.getisord import G_Local

# ---------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_asthma_proximity.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/asthma_hotspots.gpkg"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------
# Load + validate
# ---------------------------------------------------------------------
gdf = gpd.read_file(INPUT_PATH)

required_cols = ["GEOID", "Asthma_prev", "geometry"]
missing = [c for c in required_cols if c not in gdf.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {list(gdf.columns)}")

# Keep valid geometries only
gdf = gdf[gdf.geometry.notnull()]
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

# Drop null analysis values
gdf = gdf.dropna(subset=["Asthma_prev"]).copy()

# Reset index so weights align 0..n-1
gdf = gdf.reset_index(drop=True)

# Ensure GEOID is string
gdf["GEOID"] = gdf["GEOID"].astype(str)

# ---------------------------------------------------------------------
# Queen contiguity weights (with island handling)
# ---------------------------------------------------------------------
w = Queen.from_dataframe(gdf)

# Handle islands while preserving Queen as the base scheme:
# give each island a self-neighbor so Gi* is defined.
if getattr(w, "islands", None):
    for i in w.islands:
        w.neighbors[i] = [i]
        w.weights[i] = [1.0]

# Row-standardize
w.transform = "r"

# ---------------------------------------------------------------------
# Getis-Ord Gi* (local G*): z-scores + permutation p-values
# ---------------------------------------------------------------------
y = gdf["Asthma_prev"].to_numpy(dtype=float)
gi = G_Local(y, w, star=True, permutations=999)

# Attach results
gdf["GiZ"] = np.asarray(gi.Zs, dtype=float)
gdf["GiP"] = np.asarray(gi.p_sim, dtype=float)

# ---------------------------------------------------------------------
# Significance classification (hotspot/coldspot) based on p-value + sign(z)
# ---------------------------------------------------------------------
def classify_gistar(z, p):
    if not np.isfinite(z) or not np.isfinite(p):
        return "NoData"
    # Hotspots (positive z)
    if z > 0:
        if p <= 0.01:
            return "Hotspot_99"
        if p <= 0.05:
            return "Hotspot_95"
        if p <= 0.10:
            return "Hotspot_90"
        return "NotSig"
    # Coldspots (negative z)
    if z < 0:
        if p <= 0.01:
            return "Coldspot_99"
        if p <= 0.05:
            return "Coldspot_95"
        if p <= 0.10:
            return "Coldspot_90"
        return "NotSig"
    return "NotSig"

gdf["GiClass"] = [classify_gistar(z, p) for z, p in zip(gdf["GiZ"], gdf["GiP"])]

# ---------------------------------------------------------------------
# Save output
# ---------------------------------------------------------------------
# Keep all original attributes + Gi* outputs; ensure a stable schema
out_gdf = gdf.copy()

# GeoPackage write
out_gdf.to_file(OUTPUT_PATH, driver="GPKG")

# Manuscript artifact (auto-render choropleth later)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="Census tract Getis-Ord Gi* hotspot/coldspot classification for asthma prevalence (Queen contiguity).",
    viz_hint={"type": "choropleth", "column": "GiZ", "cmap": "RdBu_r"},
    role="final",
)