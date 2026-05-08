import os
import numpy as np
import pandas as pd

# Paths
AS_PROX_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/asthma_proximity.csv"
ACS_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/c52bc37f-8e66-4df1-b20b-57c92bbd2311/NC_ACS_data.csv"

OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_asthma_prox_acs.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------
# Load
# ----------------------------
asthma_prox = pd.read_csv(AS_PROX_PATH, dtype={"GEOID": "string"})
acs = pd.read_csv(ACS_PATH, dtype={"GEOID": "string"})

# ----------------------------
# Normalize join keys
# ----------------------------
KEY_WIDTH = 11  # tract GEOID width
asthma_prox["GEOID"] = asthma_prox["GEOID"].astype("string").str.strip().str.zfill(KEY_WIDTH)
acs["GEOID"] = acs["GEOID"].astype("string").str.strip().str.zfill(KEY_WIDTH)

# ----------------------------
# Clean numeric columns (objects -> numeric where applicable)
# ----------------------------
num_cols_asthma = ["Asthma_prev", "nearest_hw_dist_m", "hw_count_5km"]
num_cols_acs = [
    "ratio_poverty",
    "ratio_uninsured",
    "med_income",
    "ratio_black",
    "ratio_hispanic",
]

for c in num_cols_asthma:
    asthma_prox[c] = pd.to_numeric(asthma_prox[c], errors="coerce")

for c in num_cols_acs:
    acs[c] = pd.to_numeric(acs[c], errors="coerce")

# Replace common Census sentinels with NaN (if present after numeric coercion)
acs = acs.replace([-666666666, -888888888, -999999999], np.nan)

# Ensure right-side key uniqueness to avoid row explosion
acs = acs.drop_duplicates(subset=["GEOID"]).copy()

# ----------------------------
# Left join (asthma_proximity left, ACS right)
# ----------------------------
merged = asthma_prox.merge(acs, on="GEOID", how="left", validate="m:1")

# ----------------------------
# Retain requested columns only
# ----------------------------
keep_cols = [
    "GEOID",
    "Asthma_prev",
    "nearest_hw_dist_m",
    "hw_count_5km",
    "ratio_poverty",
    "ratio_uninsured",
    "med_income",
    "ratio_black",
    "ratio_hispanic",
]
merged = merged.loc[:, keep_cols].copy()

# ----------------------------
# Join audit
# ----------------------------
audit_col = "ratio_poverty"
matched = int(merged[audit_col].notna().sum())
total = int(len(merged))
match_rate = matched / total if total else 0.0
unmatched_n = total - matched

audit_lines = [
    "[JOIN AUDIT] asthma_proximity (left) + NC_ACS_data (right) on GEOID",
    f"  left rows: {total}",
    f"  matched rows (non-null '{audit_col}' after join): {matched}/{total} ({match_rate:.1%})",
    f"  unmatched left rows (null '{audit_col}'): {unmatched_n}",
]

if match_rate < 0.9:
    audit_lines.append("  WARNING: match rate below 90% — inspect GEOID formatting/coverage.")
    audit_lines.append(f"    left GEOID sample: {asthma_prox['GEOID'].head(5).tolist()}")
    audit_lines.append(f"    right GEOID sample: {acs['GEOID'].head(5).tolist()}")
    audit_lines.append(
        f"    example unmatched left GEOIDs: {merged.loc[merged[audit_col].isna(), 'GEOID'].head(10).tolist()}"
    )

audit_text = "\n".join(audit_lines)
with open(os.path.join(OUTPUT_DIR, "join_audit_asthma_proximity_acs.txt"), "w") as f:
    f.write(audit_text + "\n")

# ----------------------------
# Save output
# ----------------------------
merged.to_csv(OUTPUT_PATH, index=False)