import os

import geopandas as gpd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_2019.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_2019_qc.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

# ---- Load ----
gdf = gpd.read_file(INPUT_PATH)

# ---- Validate geometry (required workflow rule) ----
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

# ---- Create missingness indicator ----
gdf["pm25_missing_2019"] = gdf["pm25_mean_2019"].isna()

# ---- Optional quick QA log (secondary output) ----
missing_n = int(gdf["pm25_missing_2019"].sum())
total_n = int(len(gdf))
qa_text = (
    "[QC] pm25_missing_2019 created as (pm25_mean_2019 is null)\n"
    f"  counties total: {total_n}\n"
    f"  missing pm25_mean_2019: {missing_n} ({(missing_n/total_n if total_n else 0):.1%})\n"
)
print(qa_text)

qa_path = os.path.join(OUTPUT_DIR, "pm25_missing_2019_qc.txt")
with open(qa_path, "w") as f:
    f.write(qa_text)

# ---- Save ----
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
gdf.to_file(OUTPUT_PATH, driver="GPKG")