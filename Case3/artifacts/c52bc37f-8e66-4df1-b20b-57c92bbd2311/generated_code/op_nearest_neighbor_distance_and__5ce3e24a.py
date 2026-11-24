import os
import numpy as np
import pandas as pd
import geopandas as gpd

OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311"
TRACT_CENTROIDS_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_tract_centroids.gpkg"
HW_SITES_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_hw_sites_projected.gpkg"
OUTPUT_CSV_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_proximity_metrics.csv"

os.makedirs(os.path.dirname(OUTPUT_CSV_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -------------------------
# Load
# -------------------------
tract = gpd.read_file(TRACT_CENTROIDS_PATH)
hw = gpd.read_file(HW_SITES_PATH)

# -------------------------
# Validate required columns (per inspected schemas)
# -------------------------
required_tract_cols = {"GEOID", "geometry"}
required_hw_cols = {"SITE_NAME", "geometry"}

missing_tract = required_tract_cols - set(tract.columns)
missing_hw = required_hw_cols - set(hw.columns)

if missing_tract:
    raise KeyError(f"Missing columns in tract centroids: {sorted(missing_tract)}; available={list(tract.columns)}")
if missing_hw:
    raise KeyError(f"Missing columns in HW sites: {sorted(missing_hw)}; available={list(hw.columns)}")

# -------------------------
# Clean / validate geometry
# -------------------------
tract = tract[tract.geometry.notna()]
hw = hw[hw.geometry.notna()]

tract = tract[tract.geometry.is_valid & ~tract.geometry.is_empty].copy()
hw = hw[hw.geometry.is_valid & ~hw.geometry.is_empty].copy()

tract["GEOID"] = tract["GEOID"].astype(str).str.strip()

# -------------------------
# CRS harmonization: ensure projected CRS with meter units
# -------------------------
target_crs = tract.crs
if target_crs is None or (hasattr(target_crs, "is_geographic") and target_crs.is_geographic):
    target_crs = "EPSG:3857"  # meter-based fallback if input is geographic/undefined

tract = tract.to_crs(target_crs)
hw = hw.to_crs(target_crs)

# -------------------------
# Metrics
#   - nearest_hw_dist_m: nearest Euclidean distance from centroid to nearest HW point
#   - hw_count_5km: count of HW points within 5000 m
# -------------------------
# Nearest distance
if len(hw) == 0 or len(tract) == 0:
    out = pd.DataFrame(
        {
            "GEOID": tract["GEOID"].values if len(tract) else [],
            "nearest_hw_dist_m": np.nan,
            "hw_count_5km": 0,
        }
    )
else:
    nearest = gpd.sjoin_nearest(
        tract[["GEOID", "geometry"]],
        hw[["SITE_NAME", "geometry"]],
        how="left",
        distance_col="nearest_hw_dist_m",
    )

    dist_df = nearest[["GEOID", "nearest_hw_dist_m"]].copy()

    # Count within 5km
    tract_buf = tract[["GEOID", "geometry"]].copy()
    tract_buf["geometry"] = tract_buf.geometry.buffer(5000)

    within = gpd.sjoin(
        tract_buf,
        hw[["SITE_NAME", "geometry"]],
        how="left",
        predicate="intersects",
    )

    count_df = (
        within.groupby("GEOID", dropna=False)
        .size()
        .rename("hw_count_5km")
        .reset_index()
    )

    # If a tract had no matches in left join, size() returns 1 (the left row) with NaNs on right.
    # Correct by counting only non-null right-side matches.
    # (In geopandas sjoin, right columns appear; we have SITE_NAME from right.)
    count_df = (
        within.assign(_has_match=within["SITE_NAME"].notna().astype(int))
        .groupby("GEOID", dropna=False)["_has_match"]
        .sum()
        .rename("hw_count_5km")
        .reset_index()
    )

    out = dist_df.merge(count_df, on="GEOID", how="left")
    out["hw_count_5km"] = out["hw_count_5km"].fillna(0).astype(int)

# -------------------------
# Save
# -------------------------
out.to_csv(OUTPUT_CSV_PATH, index=False)