import os
import numpy as np
import pandas as pd

# ----------------------------
# Paths
# ----------------------------
LEFT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression_with_index.csv"
RIGHT_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_Visitor_POI.csv"

OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression_visits.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------
# Load
# ----------------------------
left = pd.read_csv(LEFT_PATH, dtype={"GEOID": "string"})
right = pd.read_csv(RIGHT_PATH, dtype={"GEOID": "string"})

# ----------------------------
# Select required columns
# ----------------------------
left_keep = [
    "GEOID",
    "Depression_prev",
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "percent_>=18",
    "percent_Black",
    "percent_Hispanic",
]
right_keep = [
    "GEOID",
    "Full_Service_Restaurant",
    "Sport_facilities",
    "Parks",
    "Fastfood_Restaurant",
    "Convenience",
    "Supermarket",
    "Warehouse",
    "Fruit",
    "TobaccoStore",
    "DrinkingPlaces",
]

missing_left = sorted(set(left_keep) - set(left.columns))
missing_right = sorted(set(right_keep) - set(right.columns))
if missing_left or missing_right:
    raise KeyError(
        "Missing required columns. "
        f"Missing in left: {missing_left} (available: {list(left.columns)}). "
        f"Missing in right: {missing_right} (available: {list(right.columns)})."
    )

left = left[left_keep].copy()
right = right[right_keep].copy()

# ----------------------------
# Normalize join key
# ----------------------------
KEY_WIDTH = 5  # county GEOID
left["GEOID"] = left["GEOID"].astype("string").str.strip().str.zfill(KEY_WIDTH)
right["GEOID"] = right["GEOID"].astype("string").str.strip().str.zfill(KEY_WIDTH)

# If right side should be unique per county, enforce uniqueness
right = right.drop_duplicates(subset=["GEOID"], keep="first").copy()

# ----------------------------
# Clean + coerce numerics (inputs appear as object)
# ----------------------------
sentinels = [-666666666, -888888888, -999999999]

for c in left.columns:
    if c != "GEOID":
        left[c] = pd.to_numeric(left[c], errors="coerce")
left = left.replace(sentinels, np.nan)

for c in right.columns:
    if c != "GEOID":
        right[c] = pd.to_numeric(right[c], errors="coerce")
right = right.replace(sentinels, np.nan)

# ----------------------------
# Left join
# ----------------------------
merged = left.merge(right, on="GEOID", how="left")

# ----------------------------
# Join audit (write to file)
# ----------------------------
audit_col = "Full_Service_Restaurant"
matched = int(merged[audit_col].notna().sum())
total = len(merged)
match_rate = matched / total if total else 0.0
unmatched_n = total - matched

audit_lines = [
    "[JOIN AUDIT] Left join county_ses_depression_with_index.csv + SC_Visitor_POI.csv on GEOID",
    f"  left rows: {total}",
    f"  matched (non-null '{audit_col}'): {matched}/{total} ({match_rate:.1%})",
    f"  unmatched (NaN in right side): {unmatched_n}",
]
if match_rate < 0.9:
    sample_unmatched = merged.loc[merged[audit_col].isna(), "GEOID"].head(10).tolist()
    audit_lines += [
        "  WARNING: match rate below 90% — inspect GEOID formatting/coverage.",
        f"  example unmatched GEOID (first 10): {sample_unmatched}",
    ]

audit_txt = "\n".join(audit_lines) + "\n"
audit_path = os.path.join(OUTPUT_DIR, "join_audit_county_ses_depression_visits.txt")
with open(audit_path, "w") as f:
    f.write(audit_txt)

# ----------------------------
# Save output
# ----------------------------
merged.to_csv(OUTPUT_PATH, index=False)