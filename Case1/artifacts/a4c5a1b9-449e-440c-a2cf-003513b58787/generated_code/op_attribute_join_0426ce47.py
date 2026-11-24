import os
import numpy as np
import pandas as pd
import geopandas as gpd

OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

INPUT_COUNTIES_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_2019_qc.gpkg"
INPUT_GINI_CSV = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/gini_2019_with_geoid.csv"

OUTPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019.gpkg"

# ---- Load inputs ----
counties = gpd.read_file(INPUT_COUNTIES_GPKG)
gini = pd.read_csv(INPUT_GINI_CSV)

# ---- Validate required columns (from Step 1 inspection) ----
LEFT_KEY = "GEOID"
RIGHT_KEY = "GEOID"
GINI_COL = "B19083_001E:Gini Index"

missing_left = [c for c in [LEFT_KEY, "geometry"] if c not in counties.columns]
missing_right = [c for c in [RIGHT_KEY, GINI_COL] if c not in gini.columns]
if missing_left:
    raise KeyError(f"Missing columns in counties layer: {missing_left}. Available: {list(counties.columns)}")
if missing_right:
    raise KeyError(f"Missing columns in gini CSV: {missing_right}. Available: {list(gini.columns)}")

# ---- Geometry QC (required) ----
counties = counties[counties.geometry.notna()]
counties = counties[~counties.geometry.is_empty]
counties = counties[counties.geometry.is_valid].copy()

# ---- Normalize join keys ----
# County GEOID is 5 chars (state+county FIPS)
KEY_WIDTH = 5
counties[LEFT_KEY] = counties[LEFT_KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)
gini[RIGHT_KEY] = gini[RIGHT_KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)

# ---- Clean/convert Gini column to numeric ----
gini[GINI_COL] = pd.to_numeric(gini[GINI_COL], errors="coerce")
gini = gini.replace([-666666666, -888888888, -999999999], np.nan)

# ---- Deduplicate right side on join key (defensive) ----
gini = gini.drop_duplicates(subset=[RIGHT_KEY]).copy()

# ---- Left join ----
merged = counties.merge(gini[[RIGHT_KEY, GINI_COL]], left_on=LEFT_KEY, right_on=RIGHT_KEY, how="left")

# ---- Join audit ----
matched = int(merged[GINI_COL].notna().sum())
total = int(len(merged))
match_rate = matched / total if total else 0.0
unmatched = total - matched

audit_lines = [
    "[JOIN AUDIT] counties_pm25_2019_qc.gpkg (left) + gini_2019_with_geoid.csv (right)",
    f"  left rows: {total}",
    f"  matched '{GINI_COL}': {matched}/{total} ({match_rate:.1%})",
    f"  unmatched (NaN in right): {unmatched}",
]
if match_rate < 0.9:
    audit_lines.append("  WARNING: match rate below 90% — inspect GEOID formatting/coverage.")
    audit_lines.append(f"    left GEOID sample: {counties[LEFT_KEY].head(5).tolist()}")
    audit_lines.append(f"    right GEOID sample: {gini[RIGHT_KEY].head(5).tolist()}")
    audit_lines.append(
        f"    example unmatched left GEOIDs: {merged.loc[merged[GINI_COL].isna(), LEFT_KEY].head(10).tolist()}"
    )

audit_text = "\n".join(audit_lines)
print(audit_text)
os.makedirs(OUTPUT_DIR, exist_ok=True)
audit_path = os.path.join(OUTPUT_DIR, "join_audit_gini_2019_counties.txt")
with open(audit_path, "w") as f:
    f.write(audit_text + "\n")

# ---- Save output ----
os.makedirs(os.path.dirname(OUTPUT_GPKG), exist_ok=True)
merged.to_file(OUTPUT_GPKG, driver="GPKG")

# ---- Record artifact for deferred visualization ----
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_GPKG,
    caption="California counties with 2019 PM2.5 mean and 2019 ACS Gini Index joined by GEOID.",
    viz_hint={"type": "choropleth", "column": GINI_COL},
    role="intermediate",
)