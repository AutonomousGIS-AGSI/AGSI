import os
import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

import matplotlib
matplotlib.use("Agg")
from mgwr.gwr import GWR
from mgwr.sel_bw import Sel_BW
from sklearn.preprocessing import StandardScaler

# ---- Paths -----------------------------------------------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_with_xy.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/gwr_local_coefficients.gpkg"
OUTPUT_MAP_PATH_TEMPLATE = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/gwr_thematic_map_{}.png"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---- Load ------------------------------------------------------------------
df = pd.read_csv(INPUT_PATH, dtype={"GEOID": "string"})

y_col = "Asthma_prev"
x_cols = [
    "ln_nearest_hw_dist_m",
    "z_ratio_poverty",
    "z_ratio_uninsured",
    "z_med_income",
    "z_ratio_black",
    "z_ratio_hispanic",
]
coord_cols = ["x", "y"]

needed = ["GEOID", y_col] + x_cols + coord_cols
missing = [c for c in needed if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {list(df.columns)}")

# Coerce numeric columns (they are object-typed in input)
for c in [y_col] + x_cols + coord_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

# ---- Build aligned arrays & drop bad rows ----------------------------------
Y = df[[y_col]].to_numpy(dtype=float)           # (n, 1)
X_raw = df[x_cols].to_numpy(dtype=float)        # (n, k)
coords = df[coord_cols].to_numpy(dtype=float)   # (n, 2)

mask = np.isfinite(np.hstack([Y, X_raw, coords])).all(axis=1)
df_m = df.loc[mask].copy()
Y = Y[mask]
X_raw = X_raw[mask]
coords = coords[mask]

if df_m.shape[0] == 0:
    raise ValueError("No rows remain after dropping NA/inf in y, X, and coords.")
if df_m.shape[0] <= (len(x_cols) + 2):
    raise ValueError(
        f"Too few observations for GWR (n={df_m.shape[0]}) relative to predictors (k={len(x_cols)})."
    )

# ---- Create geometry (point features from x/y) ------------------------------
xv = coords[:, 0]
yv = coords[:, 1]
looks_lonlat = (np.nanmax(np.abs(xv)) <= 180.0) and (np.nanmax(np.abs(yv)) <= 90.0)
crs = "EPSG:4326" if looks_lonlat else "EPSG:3857"

gdf = gpd.GeoDataFrame(
    df_m,
    geometry=gpd.points_from_xy(df_m["x"], df_m["y"]),
    crs=crs,
).copy()
gdf = gdf[gdf.geometry.notnull() & ~gdf.geometry.is_empty & gdf.geometry.is_valid].copy()

if gdf.shape[0] != df_m.shape[0]:
    keep_idx = gdf.index.to_numpy()
    df_m2 = df_m.loc[keep_idx].copy()
    Y = df_m2[[y_col]].to_numpy(dtype=float)
    X_raw = df_m2[x_cols].to_numpy(dtype=float)
    coords = df_m2[coord_cols].to_numpy(dtype=float)
    df_m = df_m2

# ---- Standardize for stable bandwidth search/fit ----------------------------
x_scaler = StandardScaler()
y_scaler = StandardScaler()
X_s = x_scaler.fit_transform(X_raw)
Y_s = y_scaler.fit_transform(Y)

# ---- Bandwidth selection: adaptive, minimize AICc, bisquare kernel ----------
selector = Sel_BW(coords, Y_s, X_s, fixed=False, kernel="bisquare", spherical=False)
bw = selector.search(criterion="AICc")

# ---- Fit GWR ---------------------------------------------------------------
model = GWR(coords, Y_s, X_s, bw=bw, fixed=False, kernel="bisquare", spherical=False)
results = model.fit()

# ---- Back-transform coefficients to original units --------------------------
param_names = ["Intercept"] + x_cols
a = np.asarray(results.params)  # (n, k+1)

y_mean = float(y_scaler.mean_[0])
y_std = float(np.sqrt(y_scaler.var_[0]))
x_means = x_scaler.mean_
x_stds = np.sqrt(x_scaler.var_)

betas = np.zeros_like(a, dtype=float)
for j in range(1, len(param_names)):
    betas[:, j] = (y_std / x_stds[j - 1]) * a[:, j]
betas[:, 0] = y_mean + y_std * a[:, 0] - (betas[:, 1:] * x_means.reshape(1, -1)).sum(axis=1)

# ---- Assemble output GeoDataFrame ------------------------------------------
out = gdf.copy()
for j, name in enumerate(param_names):
    out[f"b_{name}"] = betas[:, j]

out["gwr_localR2"] = np.asarray(results.localR2).reshape(-1)
out["gwr_bw"] = int(bw)

keep_cols = ["GEOID"] + [f"b_{n}" for n in param_names] + ["gwr_localR2", "gwr_bw", "geometry"]
out = out[keep_cols].copy()

# ---- Save GPKG ------------------------------------------------------------
os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
if os.path.exists(OUTPUT_NODE_PATH):
    os.remove(OUTPUT_NODE_PATH)
out.to_file(OUTPUT_NODE_PATH, driver="GPKG")

# ---- Create thematic maps for each coefficient ----------------------------
for j, name in enumerate(param_names):
    fig, ax = plt.subplots(1, 1, figsize=(10, 8))
    out.plot(
        column=f"b_{name}",
        cmap="viridis",
        scheme="Quantiles",
        legend=True,
        ax=ax
    )
    ax.set_title(f"GWR Local Coefficient for {name}")
    plt.savefig(OUTPUT_MAP_PATH_TEMPLATE.format(name), dpi=300)