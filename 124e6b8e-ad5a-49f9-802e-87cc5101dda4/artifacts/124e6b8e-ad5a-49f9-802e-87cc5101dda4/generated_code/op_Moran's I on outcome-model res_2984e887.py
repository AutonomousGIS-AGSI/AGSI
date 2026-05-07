import os
from collections import defaultdict

import numpy as np
import pandas as pd
from libpysal.weights import W
from esda.moran import Moran

# -----------------------------
# Paths
# -----------------------------
OUTCOME_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/outcome_model_results.csv"
WEIGHTS_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/sc_county_queen_weights_aligned.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/morans_i_outcome_residuals.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------------
# Load data
# -----------------------------
outcome = pd.read_csv(OUTCOME_PATH, dtype={"GEOID": "string"})
wdf = pd.read_csv(WEIGHTS_PATH, dtype={"GEOID": "string", "neighbor_GEOID": "string"})

required_outcome_cols = {"GEOID", "outcome_residual"}
missing_outcome = required_outcome_cols - set(outcome.columns)
if missing_outcome:
    raise KeyError(f"Missing columns in outcome_model_results.csv: {sorted(missing_outcome)}; "
                   f"available={list(outcome.columns)}")

required_w_cols = {"GEOID", "neighbor_GEOID", "weight"}
missing_w = required_w_cols - set(wdf.columns)
if missing_w:
    raise KeyError(f"Missing columns in sc_county_queen_weights_aligned.csv: {sorted(missing_w)}; "
                   f"available={list(wdf.columns)}")

# Ensure numeric residuals and weights
outcome["outcome_residual"] = pd.to_numeric(outcome["outcome_residual"], errors="coerce")
wdf["weight"] = pd.to_numeric(wdf["weight"], errors="coerce")

# Drop unusable rows
outcome = outcome.dropna(subset=["GEOID", "outcome_residual"]).copy()
wdf = wdf.dropna(subset=["GEOID", "neighbor_GEOID", "weight"]).copy()

if outcome.empty:
    raise ValueError("No rows available after dropping NA from ['GEOID','outcome_residual'].")

# -----------------------------
# Build aligned weights (W) from edge list
# -----------------------------
# Restrict weights to the set of GEOIDs present in residuals
geoid_set = set(outcome["GEOID"].astype("string"))
wdf = wdf[wdf["GEOID"].isin(geoid_set) & wdf["neighbor_GEOID"].isin(geoid_set)].copy()

if wdf.empty:
    raise ValueError("Weights edge list has no rows after restricting to GEOIDs in residuals.")

neighbors = defaultdict(list)
weights = defaultdict(list)

for geoid, neigh, wt in zip(wdf["GEOID"].astype("string"),
                            wdf["neighbor_GEOID"].astype("string"),
                            wdf["weight"].astype(float)):
    if geoid == neigh:
        continue
    neighbors[geoid].append(neigh)
    weights[geoid].append(float(wt))

# Ensure every residual observation is represented (islands allowed)
for geoid in outcome["GEOID"].astype("string"):
    neighbors.setdefault(geoid, [])
    weights.setdefault(geoid, [])

w = W(neighbors=neighbors, weights=weights, id_order=list(outcome["GEOID"].astype("string")))
w.transform = "r"  # row-standardize

# -----------------------------
# Global Moran's I on residuals
# -----------------------------
x = outcome.set_index("GEOID").loc[w.id_order, "outcome_residual"].to_numpy(dtype=float)

if np.isnan(x).any():
    # Should not happen due to dropna, but guard against alignment issues
    valid_mask = ~np.isnan(x)
    valid_ids = [i for i, ok in zip(w.id_order, valid_mask) if ok]
    if len(valid_ids) < 3:
        raise ValueError("Too few valid residuals after alignment to compute Moran's I.")
    # Subset weights and x to valid ids
    w = w.subset(valid_ids)
    w.transform = "r"
    x = x[valid_mask]

mi = Moran(x, w, permutations=999)

# Report: Moran’s I, expectation, variance, z-score, and permutation p-value
results = pd.DataFrame([{
    "variable": "outcome_residual",
    "morans_I": float(mi.I),
    "expected_I": float(mi.EI),
    "variance_norm": float(mi.VI_norm),   # analytical (normality) variance
    "z_norm": float(mi.z_norm),           # analytical z-score
    "p_perm": float(mi.p_sim),            # permutation p-value
    "permutations": int(mi.permutations),
    "n": int(mi.n),
    "s0": float(w.s0),
    "n_islands": int(len(w.islands) if getattr(w, "islands", None) is not None else 0),
}])

# -----------------------------
# Save primary output
# -----------------------------
results.to_csv(OUTPUT_NODE_PATH, index=False)

# Also save manuscript-ready copy as a table artifact
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "morans_i_outcome_residuals.csv")
results.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Global Moran’s I test (with permutation p-value) for spatial autocorrelation in Depression_prev outcome-model residuals using aligned Queen contiguity weights.",
    role="final",
    columns=list(results.columns),
)