import os
import pandas as pd
import geopandas as gpd

# Paths
INPUT_CSV = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_features.csv"
INPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_tract_centroids.gpkg"
OUTPUT_CSV = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_with_xy.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311"

JOIN_KEY = "GEOID"
TRACT_GEOID_WIDTH = 11  # Census tract GEOID width

# ---- Load inputs ----
df = pd.read_csv(INPUT_CSV, dtype={JOIN_KEY: "string"})
centroids = gpd.read_file(INPUT_GPKG)

# ---- Validate / clean geometry ----
centroids = centroids[centroids.geometry.is_valid & ~centroids.geometry.is_empty].copy()

# ---- Normalize join keys (cast to str, strip, zfill) ----
df[JOIN_KEY] = df[JOIN_KEY].astype("string").str.strip().str.zfill(TRACT_GEOID_WIDTH)

centroids[JOIN_KEY] = (
    centroids[JOIN_KEY].astype("string").str.strip().str.zfill(TRACT_GEOID_WIDTH)
)

# ---- Extract coordinates ----
centroids["x"] = pd.to_numeric(centroids.geometry.x, errors="coerce")
centroids["y"] = pd.to_numeric(centroids.geometry.y, errors="coerce")

# Keep only required join fields and deduplicate right side
centroids_xy = centroids[[JOIN_KEY, "x", "y"]].drop_duplicates(subset=[JOIN_KEY]).copy()

# ---- Join (left join: keep all modeling rows) ----
out = df.merge(centroids_xy, on=JOIN_KEY, how="left")

# Ensure numeric output columns
out["x"] = pd.to_numeric(out["x"], errors="coerce")
out["y"] = pd.to_numeric(out["y"], errors="coerce")

# ---- Save ----
os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
out.to_csv(OUTPUT_CSV, index=False)