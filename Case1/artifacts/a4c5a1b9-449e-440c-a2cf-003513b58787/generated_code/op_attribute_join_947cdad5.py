import os

import geopandas as gpd
import pandas as pd

# ---------------------------
# Paths (fixed by workflow)
# ---------------------------
COUNTIES_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019.gpkg"
URBAN_RURAL_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/urban_rural_with_geoid.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_urbanrural_2019.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

# ---------------------------
# Load inputs
# ---------------------------
counties_gdf = gpd.read_file(COUNTIES_PATH)
urban_df = pd.read_csv(URBAN_RURAL_PATH, dtype={"GEOID": "string"})

# ---------------------------
# Basic geometry validity cleanup (no spatial ops, but keep pipeline robust)
# ---------------------------
if "geometry" in counties_gdf.columns:
    counties_gdf = counties_gdf[counties_gdf.geometry.notnull()]
    counties_gdf = counties_gdf[counties_gdf.geometry.is_valid & ~counties_gdf.geometry.is_empty].copy()

# ---------------------------
# Prepare join keys + right-side columns
# ---------------------------
# Ensure join keys are comparable (string, stripped)
counties_gdf["GEOID"] = counties_gdf["GEOID"].astype("string").str.strip()
urban_df["GEOID"] = urban_df["GEOID"].astype("string").str.strip()

# Only keep required attribute from right table for this operation
urban_keep = urban_df[["GEOID", "Metro2013"]].copy()

# Avoid row explosions if right side has unexpected duplicates
urban_keep = urban_keep.drop_duplicates(subset=["GEOID"])

# ---------------------------
# Left join: attach Metro2013 to counties
# ---------------------------
out_gdf = counties_gdf.merge(urban_keep, on="GEOID", how="left", validate="1:1")

# ---------------------------
# Save output
# ---------------------------
# Keep same CRS; GeoPackage driver preserves geometry + attributes
out_gdf.to_file(OUTPUT_PATH, driver="GPKG")

# ---------------------------
# Record as data-to-viz (optional auto-render)
# ---------------------------
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="California county polygons with PM2.5 mean (2019), Gini Index, and Metro2013 classification attached via GEOID.",
    viz_hint={"type": "choropleth", "column": "Metro2013"},
    role="intermediate",
)