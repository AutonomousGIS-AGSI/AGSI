import geopandas as gpd
import os

# Define input paths
tract_centroids_path = "/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/tract_centroids.gpkg"
hw_sites_path = "/bigdata/s0/tea5209/AGM/WebUI/uploads/d1c83982-f166-4285-b529-abde596c1758/NC_HW_sites.gpkg"

# Define output path
output_path = "/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/tract_hazard_distance.csv"

# Load spatial data
tracts = gpd.read_file(tract_centroids_path)
hw_sites = gpd.read_file(hw_sites_path)

# Validate and clean geometries
tracts = tracts[tracts.geometry.is_valid & ~tracts.geometry.is_empty]
hw_sites = hw_sites[hw_sites.geometry.is_valid & ~hw_sites.geometry.is_empty]

# Reproject to same CRS if needed
if tracts.crs != hw_sites.crs:
    hw_sites = hw_sites.to_crs(tracts.crs)

# Find nearest hazardous waste site for each tract
nearest = gpd.sjoin_nearest(
    tracts[['GEOID', 'geometry']], 
    hw_sites[['SITE_NAME', 'geometry']],
    how="left",
    distance_col="min_distance"
)

# Select output columns and save
nearest[['GEOID', 'min_distance']].rename(columns={'min_distance': 'distance_meters'}) \
    .to_csv(output_path, index=False)