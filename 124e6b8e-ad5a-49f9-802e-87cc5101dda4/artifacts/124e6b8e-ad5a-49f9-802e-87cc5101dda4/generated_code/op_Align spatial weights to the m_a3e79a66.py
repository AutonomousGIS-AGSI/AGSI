import os
import pandas as pd

# -------------------- Paths --------------------
WEIGHTS_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/sc_county_queen_weights.csv"
OUTCOME_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/outcome_model_results.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/sc_county_queen_weights_aligned.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# -------------------- Load --------------------
weights = pd.read_csv(WEIGHTS_PATH, dtype={"GEOID": "string", "neighbor_GEOID": "string", "weight": "string"})
outcome = pd.read_csv(OUTCOME_PATH, dtype={"GEOID": "string"})

# -------------------- Normalize keys --------------------
# Determine a consistent GEOID width across files (county GEOID typically 5, but infer to be safe)
all_key_series = pd.concat(
    [
        weights["GEOID"].astype("string"),
        weights["neighbor_GEOID"].astype("string"),
        outcome["GEOID"].astype("string"),
    ],
    ignore_index=True,
)
# Strip whitespace first, then compute length on non-null entries
all_key_series = all_key_series.astype("string").str.strip()
key_width = int(all_key_series.dropna().str.len().max()) if all_key_series.dropna().shape[0] else 0
if key_width <= 0:
    raise ValueError("Could not infer GEOID width (all GEOIDs appear null/empty).")

weights["GEOID"] = weights["GEOID"].astype("string").str.strip().str.zfill(key_width)
weights["neighbor_GEOID"] = weights["neighbor_GEOID"].astype("string").str.strip().str.zfill(key_width)
outcome["GEOID"] = outcome["GEOID"].astype("string").str.strip().str.zfill(key_width)

# -------------------- Define residual-vector GEOID order --------------------
# Use the ordering as it appears in outcome_model_results.csv; drop nulls; keep first occurrence.
geoid_order = (
    outcome.loc[outcome["GEOID"].notna(), "GEOID"]
    .drop_duplicates(keep="first")
    .tolist()
)
geoid_set = set(geoid_order)

if len(geoid_order) == 0:
    raise ValueError("No non-null GEOIDs found in outcome_model_results.csv.")

# -------------------- Subset weights to included GEOIDs --------------------
# Keep only edges where BOTH endpoints are present in the outcome residual vector ordering.
w_sub = weights.loc[
    weights["GEOID"].isin(geoid_set) & weights["neighbor_GEOID"].isin(geoid_set)
].copy()

# Convert weight to numeric (Queen weights often 1/0); preserve NaN if conversion fails.
w_sub["weight"] = pd.to_numeric(w_sub["weight"], errors="coerce")

# -------------------- Reorder to match GEOID ordering --------------------
# Create ordered categoricals to sort rows by origin GEOID then neighbor_GEOID.
w_sub["_GEOID_ord"] = pd.Categorical(w_sub["GEOID"], categories=geoid_order, ordered=True)
w_sub["_neighbor_ord"] = pd.Categorical(w_sub["neighbor_GEOID"], categories=geoid_order, ordered=True)

w_sub = w_sub.sort_values(by=["_GEOID_ord", "_neighbor_ord"], kind="mergesort").drop(
    columns=["_GEOID_ord", "_neighbor_ord"]
)

# -------------------- Basic audits --------------------
audit_lines = []
audit_lines.append(f"[ALIGNMENT AUDIT] inferred GEOID width: {key_width}")
audit_lines.append(f"  outcome GEOIDs (unique, ordered): {len(geoid_order)}")
audit_lines.append(f"  original weights edges: {len(weights)}")
audit_lines.append(f"  aligned weights edges (both endpoints kept): {len(w_sub)}")

missing_from_weights = [g for g in geoid_order if g not in set(weights["GEOID"].dropna().unique())]
audit_lines.append(f"  outcome GEOIDs missing as origin in weights: {len(missing_from_weights)}")
if missing_from_weights:
    audit_lines.append(f"    example missing origins (up to 10): {missing_from_weights[:10]}")

# Report any outcome GEOIDs that appear as origin but have zero retained neighbors after subsetting
origin_counts = w_sub["GEOID"].value_counts()
zero_neighbor = [g for g in geoid_order if origin_counts.get(g, 0) == 0]
audit_lines.append(f"  outcome GEOIDs with zero retained neighbors: {len(zero_neighbor)}")
if zero_neighbor:
    audit_lines.append(f"    example (up to 10): {zero_neighbor[:10]}")

audit_text = "\n".join(audit_lines)
print(audit_text)
os.makedirs(OUTPUT_DIR, exist_ok=True)
with open(os.path.join(OUTPUT_DIR, "weights_alignment_audit.txt"), "w") as f:
    f.write(audit_text + "\n")

# -------------------- Save --------------------
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
w_sub.to_csv(OUTPUT_PATH, index=False)