import os
import numpy as np
import pandas as pd

# Paths
ACS_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_ACS_data.csv"
DEP_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_PLACES_depression.csv"

OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/acs_places_validated.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Columns (confirmed via get_columns)
ACS_KEEP = [
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
DEP_KEEP = ["GEOID", "Depression_prev"]

# Load
acs = pd.read_csv(ACS_PATH, dtype="string")
dep = pd.read_csv(DEP_PATH, dtype="string")

# Retain only required columns
acs = acs.loc[:, ACS_KEEP].copy()
dep = dep.loc[:, DEP_KEEP].copy()

# Normalize GEOID as clean string (alternative strategy: pandas StringDtype end-to-end)
def normalize_geoid(s: pd.Series) -> pd.Series:
    s = s.astype("string")
    s = s.str.strip()
    s = s.replace({"": pd.NA, "nan": pd.NA, "None": pd.NA, "<NA>": pd.NA})
    return s

acs["GEOID"] = normalize_geoid(acs["GEOID"])
dep["GEOID"] = normalize_geoid(dep["GEOID"])

# Drop rows with missing GEOID (separately, then after merge)
acs_before = len(acs)
dep_before = len(dep)
acs = acs.dropna(subset=["GEOID"]).copy()
dep = dep.dropna(subset=["GEOID"]).copy()
print(f"[DROP] ACS rows dropped due to missing GEOID: {acs_before - len(acs)} (kept {len(acs)})")
print(f"[DROP] Depression rows dropped due to missing GEOID: {dep_before - len(dep)} (kept {len(dep)})")

# Convert numeric-like fields to numeric (keep NaN for missing/non-numeric)
numeric_cols = [c for c in ACS_KEEP if c != "GEOID"] + ["Depression_prev"]
for c in numeric_cols:
    if c in acs.columns:
        acs[c] = pd.to_numeric(acs[c], errors="coerce")
    if c in dep.columns:
        dep[c] = pd.to_numeric(dep[c], errors="coerce")

# Report missing counts for Depression_prev and each ACS field
missing_report = {}
for c in ["Depression_prev"]:
    missing_report[c] = int(dep[c].isna().sum())
for c in [col for col in ACS_KEEP if col != "GEOID"]:
    missing_report[c] = int(acs[c].isna().sum())

missing_df = (
    pd.DataFrame({"field": list(missing_report.keys()), "missing_n": list(missing_report.values())})
    .sort_values(["missing_n", "field"], ascending=[False, True])
)
print("\n[MISSING VALUE COUNTS] (after dropping missing GEOID)")
print(missing_df.to_string(index=False))

# Merge on GEOID (inner by default to keep only records with both)
merged = acs.merge(dep, on="GEOID", how="inner")

# Ensure final column order
final_cols = ACS_KEEP + ["Depression_prev"]
merged = merged.loc[:, final_cols].copy()

# Final check: drop any remaining missing GEOID (should be none)
final_before = len(merged)
merged = merged.dropna(subset=["GEOID"]).copy()
print(f"\n[DROP] Final merged rows dropped due to missing GEOID: {final_before - len(merged)} (kept {len(merged)})")

# Save output
merged.to_csv(OUTPUT_PATH, index=False)

# Record as intermediate dataset artifact
record_table(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="Validated ACS and PLACES depression attributes with standardized GEOID and selected covariates.",
    role="intermediate",
)