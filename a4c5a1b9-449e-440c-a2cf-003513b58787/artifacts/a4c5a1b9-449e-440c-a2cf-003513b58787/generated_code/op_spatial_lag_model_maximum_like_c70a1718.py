import os
import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

from libpysal.weights import Queen
from spreg import ML_Lag

# -----------------------------
# Paths (as provided)
# -----------------------------
COUNTIES_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_urbanrural_interaction_2019.gpkg"
WEIGHTS_GPKG_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ca_county_queen_weights_2019.gpkg"

OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/spatial_lag_pm25_gini_metro_interaction_2019.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------------
# Load data
# -----------------------------
counties = gpd.read_file(COUNTIES_PATH)
w_gdf = gpd.read_file(WEIGHTS_GPKG_PATH)

# -----------------------------
# Validate / standardize geometry
# -----------------------------
counties = counties[counties.geometry.is_valid & ~counties.geometry.is_empty].copy()
w_gdf = w_gdf[w_gdf.geometry.is_valid & ~w_gdf.geometry.is_empty].copy()

# Align CRS to weights layer CRS (primary for contiguity)
if counties.crs != w_gdf.crs:
    counties = counties.to_crs(w_gdf.crs)

# -----------------------------
# Required columns (confirmed by inspection)
# -----------------------------
y_col = "pm25_mean_2019"
x_cols = ["B19083_001E:Gini Index", "Metro2013", "gini_x_metro"]
key_col = "GEOID"

# Ensure join key dtype consistency
counties[key_col] = counties[key_col].astype(str)
w_gdf[key_col] = w_gdf[key_col].astype(str)

# Join predictors onto the weights geometry frame to ensure weights keyed by GEOID
keep_cols = [key_col, y_col] + x_cols
counties_sub = counties[keep_cols].copy()
gdf = w_gdf[[key_col, "geometry"]].merge(counties_sub, on=key_col, how="inner")

# Coerce numeric fields (Metro2013 is int64 but keep robust coercion)
for c in [y_col] + x_cols:
    gdf[c] = pd.to_numeric(gdf[c], errors="coerce")

# Drop rows with missing model inputs
gdf = gdf.dropna(subset=[y_col] + x_cols).reset_index(drop=True)

if len(gdf) == 0:
    raise ValueError(f"No rows available after dropping NA in {[y_col] + x_cols}.")
if len(gdf) < 10:
    print(f"[WARN] Only {len(gdf)} observations after cleaning; ML SAR estimates may be unstable.")

# -----------------------------
# Build Queen contiguity weights keyed by GEOID
# -----------------------------
ids = gdf[key_col].tolist()
w = Queen.from_dataframe(gdf, ids=ids)

if getattr(w, "islands", None):
    if len(w.islands) > 0:
        raise ValueError(
            f"Queen weights contain islands (no neighbors) for GEOID(s): {w.islands}. "
            "Spatial lag (ML_Lag) may be invalid/unstable with islands; revise geography/weights."
        )

w.transform = "r"  # row-standardize

# -----------------------------
# Fit maximum-likelihood SAR (spatial lag) model
# -----------------------------
y = gdf[[y_col]].to_numpy(dtype=float)        # (n, 1)
X = gdf[x_cols].to_numpy(dtype=float)         # (n, k) -- no intercept; spreg adds constant

model = ML_Lag(
    y=y,
    x=X,
    w=w,
    name_y=y_col,
    name_x=x_cols,
    name_w="Queen(GEOID)"
)

# -----------------------------
# Build coefficient table
# -----------------------------
# betas includes: [CONSTANT, x1, x2, x3, rho]
betas = np.asarray(model.betas).flatten()
std_err = np.asarray(model.std_err).flatten()

# z_stat entries correspond to betas (including rho)
z_vals = np.array([zp[0] for zp in model.z_stat], dtype=float)
p_vals = np.array([zp[1] for zp in model.z_stat], dtype=float)

var_names = ["CONSTANT"] + x_cols + ["rho"]
coef_df = pd.DataFrame(
    {
        "variable": var_names,
        "coef": betas[: len(var_names)],
        "std_err": std_err[: len(var_names)],
        "z": z_vals[: len(var_names)],
        "p_value": p_vals[: len(var_names)],
    }
)

# Add model fit stats as repeated columns for easy manuscript use
fit_stats = {
    "n": int(model.n),
    "k": int(model.k),
    "aic": float(getattr(model, "aic", np.nan)),
    "bic": float(getattr(model, "schwarz", np.nan)),
    "pseudo_r2": float(getattr(model, "pr2", np.nan)),
}
for k, v in fit_stats.items():
    coef_df[k] = v

# -----------------------------
# Save primary output
# -----------------------------
coef_df.to_csv(OUTPUT_NODE_PATH, index=False)

# Also save a manuscript-ready copy into tables/ and record it
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "spatial_lag_pm25_gini_metro_interaction_2019.csv")
coef_df.to_csv(table_path, index=False)

# Create a map showing the coefficients of estimation
gdf['coefficients'] = np.dot(X, betas[1:len(var_names) - 1]) + betas[0]

fig, ax = plt.subplots(1, 1, figsize=(10, 8))
gdf.plot(column='coefficients', cmap='coolwarm', linewidth=0.8, ax=ax, edgecolor='0.8', legend=True)
ax.set_title('Coefficients of Estimation', fontsize=15)
ax.legend(title='Coefficient Value')  # Add legend title for better readability
ax.set_axis_off()

coeff_map_output_path = os.path.join(OUTPUT_DIR, "spatial_lag_coefficients_map_2019.png")
plt.savefig(coeff_map_output_path, dpi=300)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Maximum-likelihood spatial lag (SAR) model coefficients for county PM2.5 (2019) with Gini, Metro2013, and their interaction using Queen contiguity weights keyed by GEOID.",
    role="final",
    columns=list(coef_df.columns),
)

# -----------------------------
# Create map showing residuals
# -----------------------------
# Calculate residuals
predictions = model.predy
residuals = y.flatten() - predictions.flatten()

# Add residuals to the GeoDataFrame
gdf['residuals'] = residuals

# Plot residuals
fig, ax = plt.subplots(1, 1, figsize=(10, 8))
gdf.plot(column='residuals', cmap='coolwarm', linewidth=0.8, ax=ax, edgecolor='0.8', legend=True)
ax.set_title('Residuals of Spatial Lag Model', fontsize=15)
ax.legend(title='Residual Value')  # Add legend title for better readability
ax.set_axis_off()

# Save the map
map_output_path = os.path.join(OUTPUT_DIR, "spatial_lag_residuals_map_2019.png")
plt.savefig(map_output_path, dpi=300)