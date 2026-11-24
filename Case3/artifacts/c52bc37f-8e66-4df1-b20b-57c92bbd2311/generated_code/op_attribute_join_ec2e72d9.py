import os
import numpy as np
import pandas as pd
import geopandas as gpd

# Pre-imported helpers (available in the environment)
# record_figure, record_table, record_data_to_viz

INPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/nc_tract_projected.gpkg"
INPUT_CSV = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/asthma_proximity.csv"
OUTPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_asthma_proximity.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311"

# -------------------------
# STEP 1: INSPECT INPUTS
# (Performed via get_columns in the orchestrator before code generation)
# Confirmed columns:
#   nc_tract_projected.gpkg: GEOID, STATEFP, COUNTYFP, TRACTCE, geometry
#   asthma_proximity.csv: GEOID, Asthma_prev, nearest_hw_dist_m, hw_count_5km
# -------------------------

# -------------------------
# STEP 2: LOOKUP SKILL DOC
# (Performed via lookup_skill_doc in the orchestrator before code generation)
# Key guidance applied: cast join keys to str, strip, zfill(11), audit match rate,
# handle duplicated keys, convert numeric columns.
# -------------------------

# -------------------------
# STEP 3: GENERATE SCRIPT
# -------------------------

# Validate input existence
for p in [INPUT_GPKG, INPUT_CSV]:
    if not os.path.exists(p):
        raise FileNotFoundError(f"Missing required input: {p}")

# Load data
tracts = gpd.read_file(INPUT_GPKG)
prox = pd.read_csv(INPUT_CSV)

# Validate / clean geometry before any spatial operations (even though we do attribute join)
tracts = tracts[tracts.geometry.notna()]
tracts = tracts[tracts.geometry.is_valid & ~tracts.geometry.is_empty].copy()

# Normalize join keys (tract GEOID width = 11)
KEY = "GEOID"
KEY_WIDTH = 11

tracts[KEY] = tracts[KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)
prox[KEY] = prox[KEY].astype(str).str.strip().str.zfill(KEY_WIDTH)

# Keep only needed columns from CSV (avoid accidental column collisions)
needed_cols = [KEY, "Asthma_prev", "nearest_hw_dist_m", "hw_count_5km"]
missing = [c for c in needed_cols if c not in prox.columns]
if missing:
    raise KeyError(f"Missing required columns in asthma_proximity.csv: {missing}. Available: {list(prox.columns)}")
prox = prox[needed_cols].copy()

# Coerce numeric fields (CSV columns came in as object)
for c in ["Asthma_prev", "nearest_hw_dist_m", "hw_count_5km"]:
    prox[c] = pd.to_numeric(prox[c], errors="coerce")

# Replace common sentinel missing codes (defensive)
prox = prox.replace([-666666666, -888888888, -999999999], np.nan)

# Ensure right-side GEOID is unique (avoid exploding row counts)
dup_mask = prox[KEY].duplicated(keep=False)
if dup_mask.any():
    # Keep the first occurrence; could also aggregate, but operation requests a direct join.
    prox = prox.drop_duplicates(subset=[KEY], keep="first").copy()

# Left join: keep all tract polygons
merged = tracts.merge(prox, on=KEY, how="left")

# Join audit
audit_col = "Asthma_prev"
matched = int(merged[audit_col].notna().sum())
total = len(merged)
match_rate = matched / total if total else 0.0
unmatched = total - matched

audit_lines = [
    "[JOIN AUDIT] Tract polygons enriched with asthma/proximity attributes",
    f"  left rows (tracts): {total}",
    f"  matched rows (non-null {audit_col}): {matched}/{total} ({match_rate:.1%})",
    f"  unmatched rows: {unmatched}",
]
if total and match_rate < 0.9:
    audit_lines.append("  WARNING: match rate below 90% — inspect GEOID formatting/coverage.")
    audit_lines.append(f"    left GEOID sample: {tracts[KEY].head(5).tolist()}")
    audit_lines.append(f"    right GEOID sample: {prox[KEY].head(5).tolist()}")
    audit_lines.append(
        f"    example unmatched left GEOIDs: {merged.loc[merged[audit_col].isna(), KEY].head(10).tolist()}"
    )

audit_text = "\n".join(audit_lines)
print(audit_text)
os.makedirs(OUTPUT_DIR, exist_ok=True)
with open(os.path.join(OUTPUT_DIR, "join_audit_tract_asthma_proximity.txt"), "w") as f:
    f.write(audit_text + "\n")

# Save output GeoPackage
os.makedirs(os.path.dirname(OUTPUT_GPKG), exist_ok=True)
merged.to_file(OUTPUT_GPKG, driver="GPKG")

# Record as data-to-viz artifact for downstream map rendering (choropleth-ready)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_GPKG,
    caption="North Carolina tract polygons joined with asthma prevalence and highway proximity attributes.",
    viz_hint={"type": "choropleth", "column": "Asthma_prev"},
    role="intermediate",
)