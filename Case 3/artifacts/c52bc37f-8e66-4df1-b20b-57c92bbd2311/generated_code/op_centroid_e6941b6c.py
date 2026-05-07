import os
import geopandas as gpd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_tract_projected.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_tract_centroids.gpkg"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Read projected tract polygons
tracts = gpd.read_file(INPUT_PATH)

# Validate geometry before spatial operations
tracts = tracts[tracts.geometry.is_valid & ~tracts.geometry.is_empty].copy()

# Ensure GEOID is present and non-null
tracts = tracts.dropna(subset=["GEOID"]).copy()
tracts["GEOID"] = tracts["GEOID"].astype(str)

# Compute centroids (input is projected, so planar centroids are appropriate)
centroids = tracts[["GEOID", "geometry"]].copy()
centroids["geometry"] = centroids.geometry.centroid
centroids = gpd.GeoDataFrame(centroids, geometry="geometry", crs=tracts.crs)

# Save centroid points to GeoPackage
centroids.to_file(OUTPUT_PATH, driver="GPKG", layer="nc_tract_centroids")

# Optional: register as data-to-viz for downstream auto-rendering
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="Centroid point locations for North Carolina Census tracts keyed by GEOID.",
    viz_hint={"type": "point"},
    role="intermediate",
)