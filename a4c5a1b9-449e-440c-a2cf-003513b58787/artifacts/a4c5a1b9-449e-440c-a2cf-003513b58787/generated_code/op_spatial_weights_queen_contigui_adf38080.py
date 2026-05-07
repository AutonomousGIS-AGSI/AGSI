import os

import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString
from libpysal.weights import Queen

# ---------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_2019_qc.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ca_county_queen_weights_2019.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

# ---------------------------------------------------------------------
# Load counties and validate
# ---------------------------------------------------------------------
counties = gpd.read_file(INPUT_PATH)

required_cols = ["GEOID", "geometry"]
missing = [c for c in required_cols if c not in counties.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available: {list(counties.columns)}")

# Ensure key is string, drop missing keys
counties["GEOID"] = counties["GEOID"].astype(str)
counties = counties.dropna(subset=["GEOID"]).copy()

# Validate geometry
counties = counties[counties.geometry.notna()].copy()
counties = counties[counties.geometry.is_valid & ~counties.geometry.is_empty].copy()

# Reset index to ensure alignment for weights construction
counties = counties.reset_index(drop=True)

if counties.empty:
    raise ValueError("No valid county geometries remain after validation.")

# ---------------------------------------------------------------------
# Construct Queen contiguity weights keyed by GEOID
# ---------------------------------------------------------------------
w = Queen.from_dataframe(counties, ids=counties["GEOID"].tolist())
w.transform = "r"  # row-standardize

# Attach neighbor count to polygons for easy inspection
neighbor_counts = pd.Series({k: len(v) for k, v in w.neighbors.items()}, name="queen_nbrs")
counties = counties.merge(neighbor_counts.rename("queen_nbrs"), left_on="GEOID", right_index=True, how="left")
counties["queen_nbrs"] = counties["queen_nbrs"].fillna(0).astype(int)

# ---------------------------------------------------------------------
# Create a spatial "links" layer (LineStrings between centroids)
# ---------------------------------------------------------------------
# Using centroids for visualization/QA; weights themselves are encoded by GEOID pairs.
centroids = counties.set_index("GEOID").geometry.centroid

pairs = []
for i, nbrs in w.neighbors.items():
    for j in nbrs:
        # store each undirected edge once
        if str(i) < str(j):
            pairs.append((str(i), str(j)))

links_records = []
for i, j in pairs:
    if i in centroids.index and j in centroids.index:
        geom = LineString([centroids.loc[i], centroids.loc[j]])
        links_records.append({"GEOID_i": i, "GEOID_j": j, "geometry": geom})

links_gdf = gpd.GeoDataFrame(links_records, geometry="geometry", crs=counties.crs)

# ---------------------------------------------------------------------
# Save to GeoPackage (polygons + queen links)
# ---------------------------------------------------------------------
if os.path.exists(OUTPUT_PATH):
    os.remove(OUTPUT_PATH)

counties.to_file(OUTPUT_PATH, layer="counties", driver="GPKG")
links_gdf.to_file(OUTPUT_PATH, layer="queen_links", driver="GPKG")

# ---------------------------------------------------------------------
# Record artifact for manuscript pipeline (auto-render choropleth)
# ---------------------------------------------------------------------
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="California county polygons with Queen contiguity summary (neighbor counts) and centroid-to-centroid neighbor links keyed by GEOID.",
    viz_hint={"type": "choropleth", "column": "queen_nbrs", "cmap": "viridis", "scheme": "Quantiles"},
    role="final",
)