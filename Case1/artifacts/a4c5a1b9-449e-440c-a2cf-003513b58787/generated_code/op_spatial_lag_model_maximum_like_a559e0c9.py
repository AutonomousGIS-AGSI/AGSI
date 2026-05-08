import os
import numpy as np
import pandas as pd
import geopandas as gpd

from libpysal.weights import Queen, KNN
from spreg import ML_Lag

# Helpers are pre-imported in the environment:
# record_table, record_figure, record_data_to_viz

COUNTIES_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019.gpkg"
WEIGHTS_GPKG_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ca_county_queen_weights_2019.gpkg"

OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/spatial_lag_pm25_on_gini_2019.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)

y_col = "pm25_mean_2019"
x_col = "B19083_001E:Gini Index"
id_col = "GEOID"

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------
# Load inputs
# ----------------------------
gdf = gpd.read_file(COUNTIES_PATH)
wgdf = gpd.read_file(WEIGHTS_GPKG_PATH)

# Validate geometry
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()
wgdf = wgdf[wgdf.geometry.is_valid & ~wgdf.geometry.is_empty].copy()

# Align CRS (if present on both)
if gdf.crs is not None and wgdf.crs is not None and gdf.crs != wgdf.crs:
    wgdf = wgdf.to_crs(gdf.crs)

# Ensure join key dtype
gdf[id_col] = gdf[id_col].astype(str)
wgdf[id_col] = wgdf[id_col].astype(str)

# Numeric coercion
gdf[y_col] = pd.to_numeric(gdf[y_col], errors="coerce")
gdf[x_col] = pd.to_numeric(gdf[x_col], errors="coerce")

# Keep model columns, drop NAs
model_df = gdf[[id_col, y_col, x_col]].dropna(subset=[y_col, x_col]).copy()

if len(model_df) == 0:
    raise ValueError(f"No rows available after dropping NA in [{y_col}, {x_col}].")

# Restrict weights geometry to modeled GEOIDs and ensure unique IDs
keep_ids = model_df[id_col].unique().tolist()
wgdf_sub = wgdf[wgdf[id_col].isin(keep_ids)].copy()
wgdf_sub = wgdf_sub.drop_duplicates(subset=[id_col]).copy()

# Enforce consistent ordering (keyed by GEOID)
model_df = model_df[model_df[id_col].isin(wgdf_sub[id_col])].copy()
model_df = model_df.sort_values(by=id_col).reset_index(drop=True)
wgdf_sub = wgdf_sub[wgdf_sub[id_col].isin(model_df[id_col])].copy()
wgdf_sub = wgdf_sub.sort_values(by=id_col).reset_index(drop=True)

if len(model_df) != len(wgdf_sub):
    raise ValueError(
        f"Row mismatch after GEOID alignment: model_df={len(model_df)}, weights_gdf={len(wgdf_sub)}"
    )
if model_df[id_col].tolist() != wgdf_sub[id_col].tolist():
    raise ValueError("GEOID ordering mismatch between regression data and weights geometry after sorting.")

# ----------------------------
# Build Queen contiguity weights (keyed by GEOID)
# ----------------------------
ids = wgdf_sub[id_col].tolist()
w = Queen.from_dataframe(wgdf_sub, ids=ids)

# Handle islands by switching to KNN (common pitfall)
if getattr(w, "islands", []):
    # Use geometry-based neighbors; KNN requires projected CRS for meaningful distances,
    # but it's used here only as a connectivity fallback for islands.
    w = KNN.from_dataframe(wgdf_sub, k=5, ids=ids)

w.transform = "r"

# ----------------------------
# Fit ML spatial lag (SAR) model
# ----------------------------
y = model_df[[y_col]].values.astype(float)  # (n, 1)
X = model_df[[x_col]].values.astype(float)  # (n, k) without intercept

sar = ML_Lag(y, X, w=w, name_y=y_col, name_x=[x_col])

# ----------------------------
# Assemble output table (parameters + fit stats)
# ----------------------------
betas = np.asarray(sar.betas).flatten().tolist()  # constant + X
rho = float(getattr(sar, "rho", np.nan))
param_names = list(getattr(sar, "name_x", ["CONSTANT", x_col])) + ["rho"]

# Standard errors / z / p: robustly extract, accounting for different spreg versions
std_err_raw = np.asarray(getattr(sar, "std_err", [])).flatten().tolist()
z_stat_raw = getattr(sar, "z_stat", [])

z_vals = []
p_vals = []
for zp in z_stat_raw:
    try:
        z_vals.append(float(zp[0]))
        p_vals.append(float(zp[1]))
    except Exception:
        z_vals.append(np.nan)
        p_vals.append(np.nan)

# Build estimates in the correct order: [betas..., rho]
estimates = betas + [rho]

# Std errors: if rho SE not explicitly present, infer from z-stat if possible
std_err = []
if len(std_err_raw) >= len(estimates):
    std_err = std_err_raw[: len(estimates)]
else:
    std_err = (std_err_raw[: len(betas)] if len(std_err_raw) >= len(betas) else [np.nan] * len(betas))
    # Infer rho SE from z (if the last z corresponds to rho)
    rho_se = np.nan
    if len(z_vals) >= len(estimates):
        z_rho = z_vals[len(estimates) - 1]
        if z_rho not in (0, np.nan) and np.isfinite(z_rho):
            rho_se = rho / z_rho
    std_err = std_err + [rho_se]

# z/p: if lengths mismatch, pad
if len(z_vals) < len(estimates):
    z_vals = z_vals + [np.nan] * (len(estimates) - len(z_vals))
if len(p_vals) < len(estimates):
    p_vals = p_vals + [np.nan] * (len(estimates) - len(p_vals))

coef_df = pd.DataFrame(
    {
        "section": "parameters",
        "variable": param_names,
        "estimate": estimates,
        "std_err": std_err,
        "z_value": z_vals[: len(estimates)],
        "p_value": p_vals[: len(estimates)],
    }
)

fit_items = {
    "n": int(getattr(sar, "n", len(model_df))),
    "k": int(getattr(sar, "k", 1)),
    "log_likelihood": float(getattr(sar, "logll", np.nan)),
    "aic": float(getattr(sar, "aic", np.nan)),
    "bic_schwarz": float(getattr(sar, "schwarz", np.nan)),
    "pseudo_r2": float(getattr(sar, "pr2", np.nan)),
    "sigma2": float(getattr(sar, "sig2", np.nan)),
}
fit_df = pd.DataFrame(
    {"section": ["fit_stats"] * len(fit_items), "variable": list(fit_items.keys()), "estimate": list(fit_items.values())}
)

out_df = pd.concat([coef_df, fit_df], ignore_index=True)

# Primary output (required node path)
out_df.to_csv(OUTPUT_NODE_PATH, index=False)

# Manuscript-ready promoted table copy
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "spatial_lag_pm25_on_gini_2019.csv")
out_df.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Maximum-likelihood spatial lag (SAR) model results for county PM2.5 (2019) regressed on Gini Index with Queen contiguity weights (GEOID-keyed).",
    role="promoted",
    columns=["section", "variable", "estimate", "std_err", "z_value", "p_value"],
)