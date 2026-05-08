import os
import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

from libpysal.weights import KNN
from esda.moran import Moran
from spreg import ML_Error

# Pre-imported helpers assumed available in this environment:
# record_table, record_figure, record_data_to_viz

INPUT_COUNTIES_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019.gpkg"
INPUT_WEIGHTS_GEOM_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ca_county_knn_weights_2019.gpkg"

OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/spatial_error_pm25_on_gini_2019.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------------
# Load inputs
# -----------------------------
counties = gpd.read_file(INPUT_COUNTIES_PATH)
wgeom = gpd.read_file(INPUT_WEIGHTS_GEOM_PATH)

# Validate geometry before spatial operations
counties = counties[counties.geometry.is_valid & ~counties.geometry.is_empty].copy()
wgeom = wgeom[wgeom.geometry.is_valid & ~wgeom.geometry.is_empty].copy()

# Ensure join key dtype consistency
counties["GEOID"] = counties["GEOID"].astype(str)
wgeom["GEOID"] = wgeom["GEOID"].astype(str)

# Reproject to common CRS (use counties as primary)
if counties.crs is not None and wgeom.crs is not None and counties.crs != wgeom.crs:
    wgeom = wgeom.to_crs(counties.crs)

y_col = "pm25_mean_2019"
x_col = "B19083_001E:Gini Index"

# Coerce to numeric and drop missing
for c in [y_col, x_col]:
    counties[c] = pd.to_numeric(counties[c], errors="coerce")

# Align to weights geometry by GEOID (keyed by GEOID)
# Keep only counties present in the weights geometry layer, and order exactly like wgeom
wgeom_keyed = wgeom[["GEOID", "geometry"]].drop_duplicates(subset=["GEOID"]).copy()

data = counties[["GEOID", y_col, x_col]].copy()
data = data.dropna(subset=[y_col, x_col]).copy()

aligned = wgeom_keyed.merge(data, on="GEOID", how="inner")
aligned = aligned.reset_index(drop=True)

if len(aligned) == 0:
    raise ValueError(
        "No rows available after aligning on GEOID and dropping NA for required variables."
    )
if len(aligned) <= 5:
    raise ValueError(
        f"Need more than k=5 observations to build KNN weights; got n={len(aligned)}."
    )

# -----------------------------
# Build KNN weights (k=5), keyed by GEOID
# -----------------------------
# Use ids to ensure the weights object is keyed by GEOID and matches the aligned order
ids = aligned["GEOID"].tolist()
w = KNN.from_dataframe(aligned, k=5, ids=ids)
w.transform = "r"

# -----------------------------
# Fit maximum-likelihood Spatial Error Model (SEM)
# -----------------------------
y = aligned[[y_col]].values.astype(float)          # (n, 1)
X = aligned[[x_col]].values.astype(float)          # (n, 1) no intercept; spreg adds it

model = ML_Error(
    y=y,
    x=X,
    w=w,
    name_y=y_col,
    name_x=[x_col],
)

# -----------------------------
# Extract results into a manuscript-ready table
# -----------------------------
# Coefficients: betas includes [CONSTANT, x...]
betas = np.asarray(model.betas).flatten()
std_err = np.asarray(model.std_err).flatten()

# z_stat is list of tuples (z, p) for coefficients only (incl constant)
z_list = np.asarray([t[0] for t in model.z_stat], dtype=float)
p_list = np.asarray([t[1] for t in model.z_stat], dtype=float)

coef_vars = ["CONSTANT", x_col]
coef_df = pd.DataFrame(
    {
        "variable": coef_vars,
        "coef": betas[: len(coef_vars)],
        "std_err": std_err[: len(coef_vars)],
        "z_value": z_list[: len(coef_vars)],
        "p_value": p_list[: len(coef_vars)],
    }
)

# Model-level diagnostics / fit stats
n = int(model.n)
k = int(model.k)  # includes constant
diag = {
    "n": n,
    "k": k,
    "lambda": float(model.lam),
    "log_likelihood": float(model.logll),
    "aic": float(model.aic),
    "bic": float(model.schwarz),
    "pseudo_r2": float(model.pr2) if getattr(model, "pr2", None) is not None else np.nan,
}

diag_df = pd.DataFrame([diag])

# Optional: residual Moran's I diagnostic (saved as intermediate)
resid = np.asarray(model.u).flatten()
mi = Moran(resid, w, permutations=999)
resid_diag_df = pd.DataFrame(
    [{
        "residual_morans_I": float(mi.I),
        "residual_morans_p_sim": float(mi.p_sim),
        "residual_morans_z_sim": float(mi.z_sim),
        "permutations": int(mi.permutations),
    }]
)

# Combine into one output table (requested output node)
# Repeat model-level stats on each coefficient row for a single flat table.
out_df = coef_df.copy()
for key, val in diag.items():
    out_df[key] = val

# Save primary output
os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
out_df.to_csv(OUTPUT_NODE_PATH, index=False)

# Save promoted manuscript table copy
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "spatial_error_pm25_on_gini_2019.csv")
out_df.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Spatial error (SEM) maximum-likelihood estimates for PM2.5 (2019) regressed on county Gini Index (KNN k=5 weights, keyed by GEOID).",
    role="final",
    columns=["variable", "coef", "std_err", "z_value", "p_value", "lambda", "aic", "bic", "log_likelihood", "pseudo_r2", "n", "k"],
)

# Save intermediate residual spatial autocorrelation diagnostic
resid_diag_path = os.path.join(OUTPUT_DIR, "sem_residual_moransI_diagnostic.csv")
resid_diag_df.to_csv(resid_diag_path, index=False)

# -----------------------------
# Create a choropleth map showing the coefficient estimation
# -----------------------------
# Adding coefficient to aligned data for mapping
aligned['coef'] = betas[1]

# Create a GeoDataFrame for mapping
gdf = gpd.GeoDataFrame(aligned, geometry='geometry')

# Plotting
fig, ax = plt.subplots(1, 1, figsize=(10, 8))
gdf.plot(column='coef', cmap='viridis', linewidth=0.8, ax=ax, edgecolor='0.8', legend=True)
ax.set_title("Coefficient of Gini Index Estimation Across Counties")
ax.set_axis_off()

# Save the figure
map_path = os.path.join(OUTPUT_DIR, "coef_map_pm25_on_gini_2019.png")
plt.savefig(map_path, dpi=300, bbox_inches='tight')

record_figure(
    output_dir=OUTPUT_DIR,
    file_path=map_path,
    caption="Map showing the coefficient of estimation for Gini Index regressed on PM2.5 across counties.",
)