import os
import geopandas as gpd

# Paths
INPUT_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/c52bc37f-8e66-4df1-b20b-57c92bbd2311/NC_tract.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_tract_projected.gpkg"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Read
gdf = gpd.read_file(INPUT_PATH)

# Validate required columns exist (per inspection)
required_cols = ["GEOID", "STATEFP", "COUNTYFP", "TRACTCE", "geometry"]
missing = [c for c in required_cols if c not in gdf.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available: {list(gdf.columns)}")

# Ensure GEOID preserved as string
gdf["GEOID"] = gdf["GEOID"].astype(str)

# Basic geometry validity filtering (required before spatial ops)
gdf = gdf[gdf.geometry.notnull()]
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

# Choose a meter-based projected CRS suitable for North Carolina distance calculations:
# EPSG:32119 = NAD83 / North Carolina (meters)
TARGET_CRS = "EPSG:32119"

# If source CRS is missing, stop (cannot reliably reproject)
if gdf.crs is None:
    raise ValueError("Input layer has no CRS defined; cannot reproject safely.")

# Reproject
gdf_proj = gdf.to_crs(TARGET_CRS)

# Write to GeoPackage
layer_name = "nc_tract_projected"
if os.path.exists(OUTPUT_PATH):
    os.remove(OUTPUT_PATH)
gdf_proj.to_file(OUTPUT_PATH, layer=layer_name, driver="GPKG")

# Record dataset for deferred visualization (optional)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="North Carolina census tract polygons reprojected to a meter-based CRS (EPSG:32119) for distance calculations, preserving GEOID.",
    viz_hint={"type": "boundary"},
    role="intermediate",
)