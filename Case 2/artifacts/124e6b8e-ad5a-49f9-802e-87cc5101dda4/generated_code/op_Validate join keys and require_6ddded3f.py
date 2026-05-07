import os
import numpy as np
import pandas as pd

# Pre-imported helpers (do not remove): record_figure, record_table, record_data_to_viz

INPUT_ACS = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_ACS_data.csv"
INPUT_DEP = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_PLACES_depression.csv"

OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/acs_places_validated.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------
# Load
# ----------------------------
acs = pd.read_csv(INPUT_ACS)
dep = pd.read_csv(INPUT_DEP)

# ----------------------------
# Validate required columns exist (must match get_columns)
# ----------------------------
acs_required = [
    "GEOID",
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "percent_Black",
    "percent_Hispanic",
    "percent_>=18",
]
dep_required = ["GEOID", "Depression_prev"]

missing_acs = [c for c in acs_required if c not in acs.columns]
missing_dep = [c for c in dep_required if c not in dep.columns]
if missing_acs or missing_dep:
    raise KeyError(
        "Missing required columns.\n"
        f"  Missing in SC_ACS_data: {missing_acs}\n"
        f"  Available in SC_ACS_data: {acs.columns.tolist()}\n"
        f"  Missing in SC_PLACES_depression: {missing_dep}\n"
        f"  Available in SC_PLACES_depression: {dep.columns.tolist()}\n"
    )

# ----------------------------
# Coerce GEOID to string (preserve NA) + keep only required columns
# ----------------------------
acs = acs[acs_required].copy()
dep = dep[dep_required].copy()

acs["GEOID"] = acs["GEOID"].astype("string").str.strip()
dep["GEOID"] = dep["GEOID"].astype("string").str.strip()

# Drop rows with missing GEOID (and empty-string GEOID)
acs_before = len(acs)
dep_before = len(dep)

acs = acs.dropna(subset=["GEOID"])
dep = dep.dropna(subset=["GEOID"])

acs = acs.loc[acs["GEOID"].ne("")]
dep = dep.loc[dep["GEOID"].ne("")]

// Cast to plain python string dtype after NA-handling
acs["GEOID"] = acs["GEOID"].astype(str)
dep["GEOID"] = dep["GEOID"].astype(str)

acs_dropped_geoid = acs_before - len(acs)
dep_dropped_geoid = dep_before - len(dep)

# ----------------------------
# Convert numeric fields from object to numeric; treat Census sentinels as NA
# ----------------------------
sentinels = [-666666666, -888888888, -999999999]

acs_numeric_cols = [c for c in acs_required if c != "GEOID"]
for c in acs_numeric_cols:
    acs[c] = pd.to_numeric(acs[c], errors="coerce")
acs = acs.replace(sentinels, np.nan)

dep["Depression_prev"] = pd.to_numeric(dep["Depression_prev"], errors="coerce")
dep = dep.replace(sentinels, np.nan)

# ----------------------------
# Merge (ACS + Depression) on GEOID
# ----------------------------
merged = acs.merge(dep, on="GEOID", how="left")

# Ensure output column order exactly as requested
final_cols = [
    "GEOID",
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "percent_Black",
    "percent_Hispanic",
    "percent_>=18",
    "Depression_prev",
]
merged = merged[final_cols].copy()

# ----------------------------
# Missingness report (Depression_prev + each ACS field)
# ----------------------------
missing_counts = merged[final_cols].isna().sum().rename("missing_n").to_frame()
missing_counts["missing_pct"] = (missing_counts["missing_n"] / len(merged) * 100.0) if len(merged) else 0.0
missing_counts = missing_counts.reset_index().rename(columns={"index": "field"})

report_lines = [
    "[GEOID DROP SUMMARY]",
    f"  ACS: dropped {acs_dropped_geoid} rows with missing/blank GEOID (from {acs_before} to {len(acs)})",
    f"  Depression: dropped {dep_dropped_geoid} rows with missing/blank GEOID (from {dep_before} to {len(dep)})",
    "",
    "[MISSING VALUE COUNTS IN MERGED OUTPUT]",
]
for _, row in missing_counts.iterrows():
    report_lines.append(f"  {row['field']}: {int(row['missing_n'])} missing ({row['missing_pct']:.2f}%)")
report_text = "\n".join(report_lines)

print(report_text)

report_txt_path = os.path.join(OUTPUT_DIR, "missingness_report.txt")
with open(report_txt_path, "w") as f:
    f.write(report_text + "\n")

report_csv_path = os.path.join(OUTPUT_DIR, "missingness_report.csv")
missing_counts.to_csv(report_csv_path, index=False)

# ----------------------------
# Save primary output
# ----------------------------
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
merged.to_csv(OUTPUT_PATH, index=False)