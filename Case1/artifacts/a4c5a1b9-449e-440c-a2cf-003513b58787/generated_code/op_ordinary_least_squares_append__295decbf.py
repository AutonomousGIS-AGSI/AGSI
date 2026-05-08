import os
import numpy as np
import pandas as pd
import geopandas as gpd
import statsmodels.api as sm

# -------------------------------
# Paths (per instructions)
# -------------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019.gpkg"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019_olsresid.gpkg"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -------------------------------
# Load + basic geometry validation
# -------------------------------
gdf = gpd.read_file(INPUT_PATH)
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

# -------------------------------
# OLS setup
# -------------------------------
y_col = "pm25_mean_2019"
x_col = "B19083_001E:Gini Index"
key_col = "GEOID"

needed = [key_col, y_col, x_col]
missing = [c for c in needed if c not in gdf.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available: {list(gdf.columns)}")

# Ensure join key is string-like (robustness)
gdf[key_col] = gdf[key_col].astype(str)

# Coerce y/x to numeric and drop rows missing either
gdf[y_col] = pd.to_numeric(gdf[y_col], errors="coerce")
gdf[x_col] = pd.to_numeric(gdf[x_col], errors="coerce")
model_df = gdf[[key_col, y_col, x_col]].dropna(subset=[y_col, x_col]).copy()

if model_df.shape[0] < 3:
    raise ValueError(f"Not enough complete cases to fit OLS after dropping NA: n={model_df.shape[0]}")

y = model_df[y_col].to_numpy()
X = sm.add_constant(model_df[[x_col]].to_numpy())  # intercept + single predictor

# -------------------------------
# Fit OLS
# -------------------------------
ols_model = sm.OLS(y, X).fit()

# Fitted values and residuals
model_df["ols_fitted_pm25"] = ols_model.fittedvalues
model_df["ols_residual_pm25"] = ols_model.resid

# -------------------------------
# Append outputs back to full GeoDataFrame keyed by GEOID
# (rows without model data remain NaN for fitted/residual)
# -------------------------------
attach = model_df[[key_col, "ols_fitted_pm25", "ols_residual_pm25"]].copy()
gdf = gdf.merge(attach, on=key_col, how="left", validate="1:1")

# -------------------------------
# Save manuscript-ready coefficient + fit-stat tables
# -------------------------------
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

coef_df = pd.DataFrame({
    "variable": ["const", x_col],
    "coef": ols_model.params,
    "std_err": ols_model.bse,
    "t": ols_model.tvalues,
    "p_value": ols_model.pvalues,
    "ci_low": ols_model.conf_int()[:, 0],
    "ci_high": ols_model.conf_int()[:, 1],
})
coef_path = os.path.join(tables_dir, "ols_pm25_gini_coefficients.csv")
coef_df.to_csv(coef_path, index=False)

fit_stats_df = pd.DataFrame([{
    "n": int(ols_model.nobs),
    "R2": float(ols_model.rsquared),
    "adj_R2": float(ols_model.rsquared_adj),
    "AIC": float(ols_model.aic),
    "BIC": float(ols_model.bic),
    "RMSE": float(np.sqrt(np.mean(np.square(ols_model.resid)))),
}])
fit_stats_path = os.path.join(tables_dir, "ols_pm25_gini_fit_stats.csv")
fit_stats_df.to_csv(fit_stats_path, index=False)

# Record tables for manuscript
record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_path,
    caption="OLS coefficients for PM2.5 (2019) regressed on county Gini Index.",
    role="promoted",
    columns=["variable", "coef", "std_err", "p_value", "ci_low", "ci_high"],
)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=fit_stats_path,
    caption="OLS fit statistics for PM2.5 (2019) ~ Gini Index model.",
    role="promoted",
    columns=["n", "R2", "adj_R2", "AIC", "BIC", "RMSE"],
)

# -------------------------------
# Save primary output GeoPackage
# -------------------------------
gdf.to_file(OUTPUT_NODE_PATH, driver="GPKG")

# Optionally register the output dataset for downstream auto-rendering (not required)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_NODE_PATH,
    caption="County-level OLS fitted PM2.5 (2019) and residuals from regression on Gini Index.",
    viz_hint={"type": "choropleth", "column": "ols_residual_pm25", "cmap": "RdBu", "scheme": "Quantiles"},
    role="final",
)