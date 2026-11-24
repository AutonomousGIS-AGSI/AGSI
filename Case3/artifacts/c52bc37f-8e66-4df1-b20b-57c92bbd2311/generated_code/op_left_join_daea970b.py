import os
import numpy as np
import pandas as pd

# Pre-imported helpers assumed available in this environment:
# record_table, record_figure, record_data_to_viz

NC_PLACES_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/c52bc37f-8e66-4df1-b20b-57c92bbd2311/NC_PLACES.csv"
TRACT_METRICS_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_proximity_metrics.csv"

OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/asthma_proximity.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------
# Load inputs
# -----------------------
places = pd.read_csv(NC_PLACES_PATH, dtype={"GEOID": "string"})
metrics = pd.read_csv(TRACT_METRICS_PATH, dtype={"GEOID": "string"})

# -----------------------
# Normalize join keys
# -----------------------
places["GEOID"] = places["GEOID"].astype("string").str.strip()
metrics["GEOID"] = metrics["GEOID"].astype("string").str.strip()

# Ensure metrics has unique GEOID to prevent row multiplication in left join
metrics = metrics.drop_duplicates(subset=["GEOID"]).copy()

# -----------------------
# Keep only needed columns
# -----------------------
places_keep = places[["GEOID", "Asthma_prev"]].copy()
metrics_keep = metrics[["GEOID", "nearest_hw_dist_m", "hw_count_5km"]].copy()

# Coerce expected numeric fields when possible (they are currently object dtype)
for col in ["Asthma_prev"]:
    places_keep[col] = pd.to_numeric(places_keep[col], errors="coerce")

for col in ["nearest_hw_dist_m", "hw_count_5km"]:
    metrics_keep[col] = pd.to_numeric(metrics_keep[col], errors="coerce")

# Replace common Census/ETL sentinel missing values if present
sentinels = [-666666666, -888888888, -999999999]
places_keep = places_keep.replace(sentinels, np.nan)
metrics_keep = metrics_keep.replace(sentinels, np.nan)

# -----------------------
# Left join on GEOID
# -----------------------
out = places_keep.merge(metrics_keep, on="GEOID", how="left")

# -----------------------
# Simple join audit (text file)
# -----------------------
audit_col = "nearest_hw_dist_m"
matched = int(out[audit_col].notna().sum())
total = len(out)
match_rate = (matched / total) if total else 0.0
unmatched = total - matched

audit_lines = [
    "[JOIN AUDIT] Left-join tract_proximity_metrics to NC_PLACES on GEOID",
    f"  output rows: {total}",
    f"  matched (non-null '{audit_col}'): {matched}/{total} ({match_rate:.1%})",
    f"  unmatched: {unmatched}",
]
audit_txt = "\n".join(audit_lines) + "\n"

audit_path = os.path.join(OUTPUT_DIR, "join_audit_asthma_proximity.txt")
with open(audit_path, "w") as f:
    f.write(audit_txt)

# -----------------------
# Save output
# -----------------------
out = out[["GEOID", "Asthma_prev", "nearest_hw_dist_m", "hw_count_5km"]].copy()
out.to_csv(OUTPUT_PATH, index=False)

# Record as data-to-viz (intermediate merged table for downstream use)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="GEOID-keyed table of asthma prevalence joined with hazardous-waste proximity metrics.",
    viz_hint={"type": "table"},
    role="intermediate",
)