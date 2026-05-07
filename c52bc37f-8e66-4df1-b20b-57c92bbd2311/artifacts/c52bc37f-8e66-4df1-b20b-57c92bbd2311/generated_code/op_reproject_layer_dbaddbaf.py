import os
import geopandas as gpd

# Paths
INPUT_HW = "/bigdata/s0/tea5209/AGM/WebUI/uploads/c52bc37f-8e66-4df1-b20b-57c92bbd2311/NC_HW_sites.gpkg"
INPUT_TRACTS_PROJ = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_tract_projected.gpkg"
OUTPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_hw_sites_projected.gpkg"
OUTPUT_DIR = os.path.dirname(OUTPUT_GPKG)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Load inputs
hw = gpd.read_file(INPUT_HW)
tracts_proj = gpd.read_file(INPUT_TRACTS_PROJ)

# Ensure required column exists
required_cols = {"SITE_NAME", "geometry"}
missing = required_cols - set(hw.columns)
if missing:
    raise KeyError(f"Missing required columns in NC_HW_sites: {sorted(missing)}. Available: {list(hw.columns)}")

# Validate geometries
hw = hw[hw.geometry.notna()]
hw = hw[hw.geometry.is_valid & ~hw.geometry.is_empty].copy()

# Target CRS from projected tracts
target_crs = tracts_proj.crs
if target_crs is None:
    raise ValueError("nc_tract_projected.gpkg has no CRS; cannot reproject NC_HW_sites to match.")

# Reproject
hw_proj = hw.to_crs(target_crs)

# Preserve SITE_NAME (and keep geometry); drop other columns to be explicit
hw_proj = hw_proj[["SITE_NAME", "geometry"]].copy()

# Save
hw_proj.to_file(OUTPUT_GPKG, driver="GPKG")

# Record as data-to-viz (defer rendering)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_GPKG,
    caption="Hazardous waste facility point locations reprojected to the same projected (meter-based) CRS as the tract layer.",
    viz_hint={"type": "point_map"},
    role="intermediate",
)