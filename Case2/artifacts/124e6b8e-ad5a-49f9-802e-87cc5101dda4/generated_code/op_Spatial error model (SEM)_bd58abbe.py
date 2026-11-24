import os
import numpy as np
import pandas as pd

from libpysal.weights import W
from spreg import ML_Error

# Helpers are pre-imported in the execution environment:
# record_table, record_figure, record_data_to_viz

# ----------------------------
# Paths (per node definitions)
# ----------------------------
WEIGHTS_EDGES_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/sc_county_queen_weights_aligned.csv"

# "county_mobility_pca.csv" input node path was UNRESOLVED in the prompt; resolved via registry listing.
DATA_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_pca.csv"

OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/spatial_error_model_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------
# Step 3: Fit Spatial Error Model (SEM) using aligned Queen weights
# ----------------------------
y_col = "Depression_prev"
x_cols = [
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "mobility_PC1",
    "percent_>=18",
    "percent_Black",
    "percent_Hispanic",
]
id_col = "GEOID"

# Load data
df = pd.read_csv(DATA_PATH, dtype={id_col: "string"})

# Coerce required numeric columns
needed_cols = [id_col, y_col] + x_cols
missing = [c for c in needed_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns in data: {missing}. Available: {list(df.columns)}")

for c in [y_col] + x_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df[id_col] = df[id_col].astype("string")

# Drop rows with any NA in model vars
df_model = df.dropna(subset=[y_col] + x_cols + [id_col]).copy()

if len(df_model) == 0:
    raise ValueError(f"No rows remain after dropping NA in {[y_col] + x_cols + [id_col]}.")

# Load aligned Queen contiguity weights (edge list)
w_edges = pd.read_csv(WEIGHTS_EDGES_PATH, dtype={"GEOID": "string", "neighbor_GEOID": "string", "weight": "string"})

# Validate weight columns exist
w_missing = [c for c in ["GEOID", "neighbor_GEOID", "weight"] if c not in w_edges.columns]
if w_missing:
    raise KeyError(f"Missing required columns in weights: {w_missing}. Available: {list(w_edges.columns)}")

# Coerce weight to numeric
w_edges["weight"] = pd.to_numeric(w_edges["weight"], errors="coerce")

# Restrict weights to the analysis sample GEOIDs (ensures W aligns with data)
geoid_order = df_model[id_col].astype("string").tolist()
geoid_set = set(geoid_order)

w_edges = w_edges.dropna(subset=["GEOID", "neighbor_GEOID", "weight"]).copy()
w_edges["GEOID"] = w_edges["GEOID"].astype("string")
w_edges["neighbor_GEOID"] = w_edges["neighbor_GEOID"].astype("string")

w_edges_sub = w_edges[w_edges["GEOID"].isin(geoid_set) & w_edges["neighbor_GEOID"].isin(geoid_set)].copy()

# Build neighbors/weights dicts for libpysal W
neighbors = {g: [] for g in geoid_order}
weights = {g: [] for g in geoid_order}

for r in w_edges_sub.itertuples(index=False):
    i = r.GEOID
    j = r.neighbor_GEOID
    wij = float(r.weight)
    if i in neighbors:
        neighbors[i].append(j)
        weights[i].append(wij)

# Construct W with explicit id_order (aligned to df_model row order)
w = W(neighbors=neighbors, weights=weights, id_order=geoid_order)
w.transform = "r"  # row-standardize

# Prepare arrays
y = df_model[[y_col]].to_numpy(dtype=float)   # (n,1)
X = df_model[x_cols].to_numpy(dtype=float)    # (n,k), no intercept (spreg adds constant)

# Fit Spatial Error Model (ML)
sem = ML_Error(y=y, x=X, w=w, name_y=y_col, name_x=x_cols)

# Extract coefficients and inference
# For ML_Error, sem.betas typically includes: [CONSTANT] + x_cols + [lambda]
beta_vals = np.asarray(sem.betas).flatten()
se_vals = np.asarray(sem.std_err).flatten()

# z_stat is a list of (z, p) tuples in the same order as betas
z_vals = np.array([zp[0] for zp in sem.z_stat], dtype=float)
p_vals = np.array([zp[1] for zp in sem.z_stat], dtype=float)

term_names = ["CONSTANT"] + x_cols + ["lambda"]
if len(beta_vals) != len(term_names):
    # Fallback: match by length; keep what exists without guessing names beyond known terms
    # (Still enforce only known term names up to available length)
    term_names = term_names[: len(beta_vals)]

coef_df = pd.DataFrame(
    {
        "category": "coefficient",
        "term": term_names,
        "estimate": beta_vals[: len(term_names)],
        "std_err": se_vals[: len(term_names)],
        "z": z_vals[: len(term_names)],
        "p_value": p_vals[: len(term_names)],
    }
)

# Model fit statistics (best-effort attribute access; do not assume unavailable fields)
fit_stats = {
    "n": getattr(sem, "n", np.nan),
    "k": getattr(sem, "k", np.nan),
    "log_likelihood": getattr(sem, "logll", np.nan),
    "aic": getattr(sem, "aic", np.nan),
    "bic_schwarz": getattr(sem, "schwarz", np.nan),
    "pseudo_r2": getattr(sem, "pr2", np.nan),
    "sigma2": getattr(sem, "sig2", np.nan),
    "lambda": float(getattr(sem, "lam", np.nan)),
}

fit_df = pd.DataFrame(
    {
        "category": "model_fit",
        "term": list(fit_stats.keys()),
        "estimate": list(fit_stats.values()),
        "std_err": np.nan,
        "z": np.nan,
        "p_value": np.nan,
    }
)

results_df = pd.concat([coef_df, fit_df], ignore_index=True)

# Save primary output (exact output node path)
results_df.to_csv(OUTPUT_NODE_PATH, index=False)

# Save a manuscript-ready copy into tables/ and record it
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "spatial_error_model_results.csv")
results_df.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Spatial error (SEM) regression results for Depression prevalence with aligned Queen contiguity weights (coefficients, lambda, standard errors, and fit statistics).",
    role="promoted",
    columns=["category", "term", "estimate", "std_err", "z", "p_value"],
)