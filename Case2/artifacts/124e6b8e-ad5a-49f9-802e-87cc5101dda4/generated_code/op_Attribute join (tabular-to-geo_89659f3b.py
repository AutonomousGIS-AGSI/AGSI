import os
import numpy as np
import pandas as pd
import geopandas as gpd

# Helpers assumed pre-imported in the environment:
# record_figure, record_table, record_data_to_viz

SC_COUNTIES_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_counties.gpkg"
CSV_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression_with_index.csv"
OUTPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/counties_ses_depression.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4"

os.makedirs(os.path.dirname(OUTPUT_GPKG), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------
# Load inputs
# ---------------------------
counties = gpd.read_file(SC_COUNTIES_PATH)
attrs = pd.read_csv(CSV_PATH)

# ---------------------------
# Validate / clean geometry
# ---------------------------
counties = counties[counties.geometry.notna()]
counties = counties[counties.geometry.is_valid & ~counties.geometry.is_empty].copy()

# ---------------------------
# Normalize join keys
# ---------------------------
KEY = "GEOID"
KEY_WIDTH = 5  # county GEOID (state+county)

counties[KEY] = counties[KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)
attrs[KEY] = attrs[KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)

# ---------------------------
# Keep only required columns from CSV and coerce to numeric where appropriate
# (All are 'object' per inspection; convert non-key columns to numeric)
# ---------------------------
required_attr_cols = [
    "GEOID",
    "Depression_prev",
    "SES_index",
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "percent_Black",
    "percent_Hispanic",
    "percent_>=18",
]
attrs = attrs[required_attr_cols].copy()

for c in required_attr_cols:
    if c != "GEOID":
        attrs[c] = pd.to_numeric(attrs[c], errors="coerce")

# Replace common Census sentinel values with NaN (safe even if none present)
attrs = attrs.replace([-666666666, -888888888, -999999999], np.nan)

# De-duplicate right side key to avoid row explosion
attrs = attrs.drop_duplicates(subset=["GEOID"], keep="first")

# ---------------------------
# Join (left join keeps all counties)
# ---------------------------
merged = counties.merge(attrs, on="GEOID", how="left")

# ---------------------------
# Join audit
# ---------------------------
audit_col = "Depression_prev"
matched = int(merged[audit_col].notna().sum())
total = int(len(merged))
match_rate = (matched / total) if total else 0.0
unmatched_n = total - matched

audit_lines = [
    "[JOIN AUDIT] County polygons joined with SES/Depression CSV",
    f"  left rows (counties): {total}",
    f"  matched (non-null '{audit_col}'): {matched}/{total} ({match_rate:.1%})",
    f"  unmatched (null '{audit_col}'): {unmatched_n}",
]
if match_rate < 0.9 and total:
    sample_left = merged.loc[merged[audit_col].isna(), "GEOID"].head(10).tolist()
    audit_lines.append("  WARNING: match rate below 90%; example unmatched GEOIDs:")
    audit_lines.append(f"    {sample_left}")

audit_text = "\n".join(audit_lines)
print(audit_text)
with open(os.path.join(OUTPUT_DIR, "join_audit_counties_ses_depression.txt"), "w") as f:
    f.write(audit_text + "\n")

# ---------------------------
# Final field selection (ensure polygon layer has requested fields)
# ---------------------------
final_cols = [
    "GEOID",
    "Depression_prev",
    "SES_index",
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "percent_Black",
    "percent_Hispanic",
    "percent_>=18",
    "geometry",
]
merged = merged[final_cols].copy()

# ---------------------------
# Save output
# ---------------------------
merged.to_file(OUTPUT_GPKG, driver="GPKG")

record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_GPKG,
    caption="South Carolina county polygons enriched with depression prevalence and SES/demographic indicators for choropleth mapping.",
    viz_hint={"type": "choropleth", "column": "Depression_prev"},
    role="promoted",
)