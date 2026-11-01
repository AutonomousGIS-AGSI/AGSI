import geopandas as gpd
import os

# Define paths
input_path = "/bigdata/s0/tea5209/AGM/WebUI/uploads/d1c83982-f166-4285-b529-abde596c1758/NC_tract.gpkg"
output_path = "/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/tract_centroids.gpkg"

# Load data
gdf = gpd.read_file(input_path)

# Ensure valid geometries
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty]

# Generate centroids
centroids = gdf.copy()
centroids['geometry'] = centroids.geometry.centroid

# Save output
os.makedirs(os.path.dirname(output_path), exist_ok=True)
centroids.to_file(output_path, driver='GPKG')

# Record artifact
record_data_to_viz(
    output_dir=os.path.dirname(output_path),
    file_path=output_path,
    caption="Centroids for North Carolina census tracts",
    viz_hint={"type": "scatter", "x": "centroid_x", "y": "centroid_y"},
    role='intermediate'
)