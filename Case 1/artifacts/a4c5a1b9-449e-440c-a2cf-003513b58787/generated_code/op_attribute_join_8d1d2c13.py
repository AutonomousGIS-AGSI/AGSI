import os
import numpy as np
import pandas as pd
import geopandas as gpd

# Manuscript artifact helpers are pre-imported:
# record_figure, record_table, record_data_to_viz

INPUT_COUNTIES = "/bigdata/s0/tea5209/AGM/outputs/DataRetrieverOutput/california_counties_2019.gpkg"
INPUT_PM25 = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_county_2019.csv"
OUTPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_2019.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

os.makedirs(os.path.dirname(OUTPUT_GPKG), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------
# Load
# -----------------------
counties = gpd.read_file(INPUT_COUNTIES)
pm25 = pd.read_csv(INPUT_PM25)

# -----------------------
# Validate/clean geometry
# -----------------------
counties = counties[counties.geometry.notna()]
counties = counties[counties.geometry.is_valid & ~counties.geometry.is_empty].copy()

# -----------------------
# Prepare join keys
# -----------------------
JOIN_KEY = "GEOID"
KEY_WIDTH = 5  # County GEOID is state(2)+county(3)

counties[JOIN_KEY] = counties[JOIN_KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)
pm25[JOIN_KEY] = pm25[JOIN_KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)

# Keep only the required right-side columns
pm25_keep = ["GEOID", "pm25_mean_2019", "pm25_site_count_2019"]
missing_right = [c for c in pm25_keep if c not in pm25.columns]
if missing_right:
    raise KeyError(
        f"Missing required columns in pm25 CSV: {missing_right}. "
        f"Available columns: {list(pm25.columns)}"
    )
pm25 = pm25[pm25_keep].copy()

# Coerce PM2.5 fields to numeric (they arrived as object)
pm25["pm25_mean_2019"] = pd.to_numeric(pm25["pm25_mean_2019"], errors="coerce")
pm25["pm25_site_count_2019"] = pd.to_numeric(pm25["pm25_site_count_2019"], errors="coerce")

# Replace common sentinel values if present
pm25 = pm25.replace([-666666666, -888888888, -999999999], np.nan)

# Ensure right-side key uniqueness (avoid exploding row counts)
pm25 = pm25.drop_duplicates(subset=["GEOID"]).copy()

# -----------------------
# Left join
# -----------------------
out = counties.merge(pm25, on="GEOID", how="left")

# -----------------------
# Join audit
# -----------------------
total = len(out)
matched = int(out["pm25_mean_2019"].notna().sum())
match_rate = (matched / total) if total else 0.0
unmatched = total - matched

audit_lines = [
    "[JOIN AUDIT] Left join pm25_county_2019 to california_counties_2019 on GEOID",
    f"  left rows (counties): {total}",
    f"  matched (non-null pm25_mean_2019): {matched}/{total} ({match_rate:.1%})",
    f"  unmatched (null pm25_mean_2019): {unmatched}",
]
if match_rate < 0.9:
    audit_lines.append("  WARNING: match rate below 90% — inspect GEOID formatting/coverage.")
    audit_lines.append(f"    left GEOID sample: {counties['GEOID'].head(5).tolist()}")
    audit_lines.append(f"    right GEOID sample: {pm25['GEOID'].head(5).tolist()}")
    audit_lines.append(
        f"    example unmatched left GEOIDs: {out.loc[out['pm25_mean_2019'].isna(), 'GEOID'].head(10).tolist()}"
    )

audit_text = "\n".join(audit_lines)
print(audit_text)

audit_path = os.path.join(OUTPUT_DIR, "join_audit_pm25_2019_counties.txt")
with open(audit_path, "w") as f:
    f.write(audit_text + "\n")

# -----------------------
# Save output
# -----------------------
out.to_file(OUTPUT_GPKG, driver="GPKG")

# Defer rendering: allow presentation layer to auto-choropleth PM2.5
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_GPKG,
    caption="California county polygons enriched with 2019 county-level PM2.5 mean and monitoring site counts via GEOID left join.",
    viz_hint={"type": "choropleth", "column": "pm25_mean_2019"},
    role="intermediate",
)