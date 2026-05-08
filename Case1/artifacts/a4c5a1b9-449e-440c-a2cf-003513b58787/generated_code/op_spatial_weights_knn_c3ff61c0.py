import os
import warnings

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString
from libpysal.weights import KNN

# Pre-imported helpers (available in the environment):
# record_data_to_viz

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ca_county_knn_weights_2019.gpkg"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------------
# Load + validate input geometry
# -----------------------------
gdf = gpd.read_file(INPUT_PATH)

required_cols = ["GEOID", "geometry"]
missing = [c for c in required_cols if c not in gdf.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {list(gdf.columns)}")

gdf["GEOID"] = gdf["GEOID"].astype(str)
gdf = gdf.dropna(subset=["GEOID", "geometry"]).copy()
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

# Ensure unique IDs (KNN 'ids' must be unique)
dupes = gdf["GEOID"].duplicated()
if dupes.any():
    duped_ids = gdf.loc[dupes, "GEOID"].unique().tolist()
    raise ValueError(f"Duplicate GEOID values found; cannot key weights uniquely. Examples: {duped_ids[:10]}")

gdf = gdf.reset_index(drop=True)

# -----------------------------
# Build centroids in projected CRS
# -----------------------------
source_crs = gdf.crs
if source_crs is None:
    raise ValueError("Input GeoPackage has no CRS; cannot construct distance-based KNN weights reliably.")

# Use a metric CRS for centroid coordinates/distances
if getattr(source_crs, "is_geographic", False):
    metric_epsg = 3857
    gdf_metric = gdf.to_crs(epsg=metric_epsg)
else:
    gdf_metric = gdf.copy()

# Centroids (in metric CRS)
gdf_metric["centroid"] = gdf_metric.geometry.centroid
centroids_metric = gpd.GeoDataFrame(
    gdf_metric[["GEOID"]].copy(),
    geometry=gdf_metric["centroid"],
    crs=gdf_metric.crs,
)

# -----------------------------
# KNN weights (k=5) keyed by GEOID
# -----------------------------
k = 5
n = len(centroids_metric)
if n <= k:
    raise ValueError(f"Not enough observations to build KNN with k={k}. n={n}")

# libpysal KNN uses geometry; ids ensures weights keyed by GEOID
with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    w = KNN.from_dataframe(centroids_metric, k=k, ids=centroids_metric["GEOID"].tolist())

# Row-standardization is common, but output requested is weights construction;
# keep as binary (default) unless you explicitly need standardized weights later.
# w.transform = "r"

# -----------------------------
# Serialize weights as an edges layer (LineStrings between centroids)
# -----------------------------
# Build a centroid lookup for coordinates
centroids_xy = centroids_metric.copy()
centroids_xy["x"] = centroids_xy.geometry.x
centroids_xy["y"] = centroids_xy.geometry.y
xy_lookup = centroids_xy.set_index("GEOID")[["x", "y"]].to_dict(orient="index")

records = []
for origin_id, neigh_ids in w.neighbors.items():
    ox, oy = xy_lookup[origin_id]["x"], xy_lookup[origin_id]["y"]
    for rank, dest_id in enumerate(neigh_ids, start=1):
        dx, dy = xy_lookup[dest_id]["x"], xy_lookup[dest_id]["y"]
        geom = LineString([(ox, oy), (dx, dy)])
        # KNN is typically binary weights=1; keep explicit column
        records.append(
            {
                "origin_id": str(origin_id),
                "dest_id": str(dest_id),
                "rank": int(rank),
                "weight": 1.0,
                "geometry": geom,
            }
        )

edges = gpd.GeoDataFrame(records, geometry="geometry", crs=centroids_metric.crs)

# Also save centroids as a nodes layer (in original CRS for interpretability)
centroids_out = centroids_metric[["GEOID", "geometry"]].copy()
if centroids_out.crs != source_crs:
    centroids_out = centroids_out.to_crs(source_crs)

edges_out = edges.copy()
if edges_out.crs != source_crs:
    edges_out = edges_out.to_crs(source_crs)

# -----------------------------
# Save to GeoPackage (multiple layers)
# -----------------------------
# Overwrite if exists to ensure clean layers
if os.path.exists(OUTPUT_PATH):
    os.remove(OUTPUT_PATH)

centroids_out.to_file(OUTPUT_PATH, layer="centroids", driver="GPKG")
edges_out.to_file(OUTPUT_PATH, layer="knn_edges_k5", driver="GPKG")

# -----------------------------
# Record artifact for manuscript pipeline auto-rendering
# -----------------------------
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="K-nearest-neighbor (k=5) spatial weights for counties, represented as centroid-to-centroid edges keyed by GEOID.",
    viz_hint={"type": "geopackage_layers", "layers": ["centroids", "knn_edges_k5"]},
    role="final",
)