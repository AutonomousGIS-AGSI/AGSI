import os
import warnings

import geopandas as gpd
import pandas as pd
from libpysal.weights import Queen

# Pre-imported helpers (provided by the platform)
# - record_figure
# - record_table
# - record_data_to_viz

INPUT_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_counties.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/sc_county_queen_weights.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# ---------------------------------------------------------------------
# 1) Load and validate geometry
# ---------------------------------------------------------------------
gdf = gpd.read_file(INPUT_PATH)

# Keep only confirmed columns
gdf = gdf[["GEOID", "geometry"]].copy()

# Normalize keys
gdf["GEOID"] = gdf["GEOID"].astype(str).str.strip()

# Drop rows with missing keys or missing/invalid geometry
gdf = gdf.dropna(subset=["GEOID", "geometry"])
gdf = gdf[gdf.geometry.notna()]
gdf = gdf[~gdf.geometry.is_empty]
gdf = gdf[gdf.geometry.is_valid]

# Enforce unique GEOID (required for stable weights ids)
dup_mask = gdf["GEOID"].duplicated(keep=False)
if dup_mask.any():
    dup_ids = gdf.loc[dup_mask, "GEOID"].value_counts().head(20).to_dict()
    raise ValueError(
        "GEOID must be unique to build an id-keyed weights table. "
        f"Found duplicated GEOIDs (showing up to 20): {dup_ids}"
    )

# ---------------------------------------------------------------------
# 2) Build Queen contiguity weights and row-standardize
# ---------------------------------------------------------------------
ids = gdf["GEOID"].tolist()

# Queen contiguity based on polygon boundaries (touching at edge or vertex)
w = Queen.from_dataframe(gdf, ids=ids, silence_warnings=True)

# Row-standardize: each neighbor gets weight 1/degree (sums to 1 per row if degree>0)
w.transform = "R"

# ---------------------------------------------------------------------
# 3) Export GEOID-neighbor_GEOID-weight table
# ---------------------------------------------------------------------
rows = []
for geoid in w.id_order:
    neighs = w.neighbors.get(geoid, [])
    weights = w.weights.get(geoid, [])
    for n, wt in zip(neighs, weights):
        rows.append({"GEOID": geoid, "neighbor_GEOID": n, "weight": float(wt)})

weights_df = pd.DataFrame(rows, columns=["GEOID", "neighbor_GEOID", "weight"])

# Basic QA: report islands (no neighbors)
islands = list(getattr(w, "islands", []))
if len(islands) > 0:
    warnings.warn(
        f"Queen weights contain {len(islands)} island(s) with no neighbors. "
        f"Example GEOIDs: {islands[:10]}"
    )

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
weights_df.to_csv(OUTPUT_PATH, index=False)

# Record as intermediate dataset (not a manuscript-ready table)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="Queen contiguity neighbor pairs between South Carolina counties with row-standardized weights by origin county.",
    viz_hint={"type": "table"},
    role="intermediate",
)