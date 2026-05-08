import os
import re
import numpy as np
import pandas as pd
import geopandas as gpd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.preprocessing import StandardScaler
from mgwr.sel_bw import Sel_BW
from mgwr.gwr import GWR

# Pre-imported helpers in the environment (may be unavailable in some runtimes)
try:
    record_figure  # type: ignore[name-defined]
except NameError:
    def record_figure(*args, **kwargs):
        return None

try:
    record_table  # type: ignore[name-defined]
except NameError:
    def record_table(*args, **kwargs):
        return None

try:
    record_data_to_viz  # type: ignore[name-defined]
except NameError:
    def record_data_to_viz(*args, **kwargs):
        return None

# -----------------------
# Paths
# -----------------------
COUNTIES_PATH = "/bigdata/s0/tea5209/AGM/WebUI/uploads/124e6b8e-ad5a-49f9-802e-87cc5101dda4/SC_counties.gpkg"
MOBILITY_PCA_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_pca.csv"

# OUTPUT_DIR is pre-defined in the execution environment
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "gwr_model_results.csv")

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

# -----------------------
# Load inputs
# -----------------------
counties = gpd.read_file(COUNTIES_PATH)
mob = pd.read_csv(MOBILITY_PCA_PATH)

# -----------------------
# Validate required columns (strict)
# -----------------------
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
join_key = "GEOID"

needed_mob_cols = [join_key, y_col] + x_cols
missing = [c for c in needed_mob_cols if c not in mob.columns]
if missing:
    raise KeyError(
        f"Missing required columns in mobility PCA table: {missing}. "
        f"Available columns: {mob.columns.tolist()}"
    )

needed_county_cols = [join_key, "geometry"]
missing2 = [c for c in needed_county_cols if c not in counties.columns]
if missing2:
    raise KeyError(
        f"Missing required columns in counties layer: {missing2}. "
        f"Available columns: {counties.columns.tolist()}"
    )

# -----------------------
# Geometry validity + CRS (projected required for GWR)
# -----------------------
counties = counties[counties.geometry.notnull() & ~counties.geometry.is_empty].copy()
counties = counties[counties.geometry.is_valid].copy()

if counties.crs is None:
    counties = counties.set_crs(epsg=4326, allow_override=True)

if counties.crs.is_geographic:
    counties = counties.to_crs(epsg=32133)

# -----------------------
# Join data (GEOID)
# -----------------------
counties[join_key] = counties[join_key].astype(str)
mob[join_key] = mob[join_key].astype(str)

gdf = counties.merge(mob[needed_mob_cols], on=join_key, how="inner")

# -----------------------
# Coerce numeric predictors/response
# -----------------------
for c in [y_col] + x_cols:
    gdf[c] = pd.to_numeric(gdf[c], errors="coerce")

# Centroids + coords
cent = gdf.geometry.centroid
gdf["centroid_x"] = cent.x.astype(float)
gdf["centroid_y"] = cent.y.astype(float)

# Drop rows with NA/inf in y/X/coords
y = gdf[[y_col]].to_numpy(dtype=float)
X_raw = gdf[x_cols].to_numpy(dtype=float)
coords = np.column_stack([gdf["centroid_x"].to_numpy(), gdf["centroid_y"].to_numpy()]).astype(float)

mask = np.isfinite(np.hstack([y, X_raw, coords])).all(axis=1)
gdf_m = gdf.loc[mask].copy()
y = y[mask]
X_raw = X_raw[mask]
coords = coords[mask]

if gdf_m.shape[0] == 0:
    raise ValueError("No observations remain after dropping missing/invalid values for GWR inputs.")

# -----------------------
# Standardize y and X
# -----------------------
x_scaler = StandardScaler()
y_scaler = StandardScaler()
X_s = x_scaler.fit_transform(X_raw)
y_s = y_scaler.fit_transform(y)

# -----------------------
# Bandwidth selection
# -----------------------
kernel = "bisquare"
fixed = False
spherical = False

n_obs = int(coords.shape[0])
bw_min = 2
bw_max = max(bw_min + 1, n_obs - 1)

selector = Sel_BW(coords, y_s, X_s, fixed=fixed, kernel=kernel, spherical=spherical)

bw = None
bw_criterion = None
bw_search_error = None
for crit in ["AICc", "CV"]:
    try:
        bw = selector.search(criterion=crit, bw_min=bw_min, bw_max=bw_max)
        bw_criterion = crit
        break
    except Exception as e:
        bw_search_error = str(e)

if bw is None:
    bw = int(bw_max)
    bw_criterion = "fallback_bw_max"

# -----------------------
# Fit GWR
# -----------------------
model = GWR(coords, y_s, X_s, bw=bw, fixed=fixed, kernel=kernel, spherical=spherical)
results = model.fit()

# -----------------------
# Back-transform coefficients to original units
# -----------------------
param_names = ["Intercept"] + x_cols
params_s = np.asarray(results.params)
bse_s = np.asarray(results.bse)
tvals = np.asarray(results.tvalues)
localR2 = np.asarray(results.localR2).reshape(-1)

y_mean = float(y_scaler.mean_[0])
y_std = float(np.sqrt(y_scaler.var_[0]))
x_means = x_scaler.mean_.astype(float)
x_stds = np.sqrt(x_scaler.var_).astype(float)

betas = np.zeros_like(params_s, dtype=float)
for j in range(1, len(param_names)):
    betas[:, j] = (y_std / x_stds[j - 1]) * params_s[:, j]

betas[:, 0] = y_mean + y_std * params_s[:, 0] - (betas[:, 1:] * x_means.reshape(1, -1)).sum(axis=1)

predy_orig = (np.asarray(results.predy).reshape(-1) * y_std + y_mean)
resid_orig = (y.reshape(-1) - predy_orig)

# -----------------------
# Prepare output (primary CSV)
# -----------------------
def sanitize(name: str) -> str:
    return re.sub(r"[^0-9a-zA-Z_]+", "_", name).strip("_")

out_df = pd.DataFrame({join_key: gdf_m[join_key].astype(str).to_numpy()})
out_df["bw"] = int(bw)
out_df["bw_criterion"] = bw_criterion
out_df["kernel"] = kernel
out_df["fixed"] = fixed

out_df["centroid_x"] = gdf_m["centroid_x"].to_numpy(dtype=float)
out_df["centroid_y"] = gdf_m["centroid_y"].to_numpy(dtype=float)

for j, nm in enumerate(param_names):
    nm_s = sanitize(nm)
    out_df[f"b_{nm_s}"] = betas[:, j]
    out_df[f"se_scaled_{nm_s}"] = bse_s[:, j]
    out_df[f"t_{nm_s}"] = tvals[:, j]

out_df["gwr_localR2"] = localR2
out_df["gwr_pred"] = predy_orig
out_df["gwr_resid"] = resid_orig

out_df.to_csv(OUTPUT_PATH, index=False)

# -----------------------
# Secondary outputs
# -----------------------
diag = {
    "n": int(gdf_m.shape[0]),
    "y": y_col,
    "predictors": ", ".join(x_cols),
    "kernel": kernel,
    "fixed": bool(fixed),
    "spherical": bool(spherical),
    "bandwidth": int(bw),
    "bandwidth_criterion": bw_criterion,
    "aicc": float(getattr(results, "aicc", np.nan)),
    "aic": float(getattr(results, "aic", np.nan)),
    "bic": float(getattr(results, "bic", np.nan)),
    "R2": float(getattr(results, "R2", np.nan)),
    "adj_R2": float(getattr(results, "adj_R2", np.nan)),
    "sigma2": float(getattr(results, "sigma2", np.nan)),
    "scale": float(getattr(results, "scale", np.nan)),
}
diag_df = pd.DataFrame([diag])
diag_path = os.path.join(tables_dir, "gwr_model_diagnostics.csv")
diag_df.to_csv(diag_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=diag_path,
    caption="GWR model diagnostics and selected bandwidth for county-level Depression_prev regression.",
    role="promoted",
)

coef_cols = [c for c in out_df.columns if c.startswith("b_")]
summ_rows = []
for c in coef_cols:
    s = pd.to_numeric(out_df[c], errors="coerce")
    summ_rows.append(
        {
            "coefficient": c,
            "mean": float(s.mean()),
            "std": float(s.std(ddof=1)),
            "min": float(s.min()),
            "p25": float(s.quantile(0.25)),
            "median": float(s.median()),
            "p75": float(s.quantile(0.75)),
            "max": float(s.max()),
            "iqr": float(s.quantile(0.75) - s.quantile(0.25)),
        }
    )
coef_var_df = pd.DataFrame(summ_rows).sort_values("coefficient")
coef_var_path = os.path.join(tables_dir, "gwr_coefficient_spatial_variability_summary.csv")
coef_var_df.to_csv(coef_var_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_var_path,
    caption="Summary statistics describing spatial variability of GWR local coefficients (original units).",
    role="promoted",
)

# -----------------------
# Create choropleth maps
# -----------------------
gdf_m["GEOID"] = gdf_m["GEOID"].astype(str)
out_gdf = gdf_m.merge(out_df, on="GEOID", how="left")
map_vars = [f"b_{sanitize(v)}" for v in x_cols] + ["gwr_localR2"]

for var in map_vars:
    fig, ax = plt.subplots(1, 1, figsize=(10, 8))
    out_gdf.plot(column=var, cmap="RdBu_r", linewidth=0.8, ax=ax, edgecolor="0.8", legend=True)
    ax.set_title(f"{var} Coefficient Map")
    ax.set_axis_off()
    
    coef_map_path = os.path.join(OUTPUT_DIR, f"choropleth_{var}.png")
    plt.savefig(coef_map_path, dpi=150, bbox_inches="tight")
    plt.close()

    record_figure(
        output_dir=OUTPUT_DIR,
        file_path=coef_map_path,
        caption=f"Choropleth map of {var} coefficients across counties.",
        role="promoted",
    )