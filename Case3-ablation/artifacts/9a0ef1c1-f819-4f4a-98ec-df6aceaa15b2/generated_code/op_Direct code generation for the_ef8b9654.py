import os
import warnings

import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

from shapely.geometry import Point
from sklearn.preprocessing import StandardScaler
import statsmodels.api as sm

from libpysal.weights import KNN
from esda.moran import Moran

# ----------------------------
# Paths
# ----------------------------
TRACT_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_tract.gpkg"
PLACES_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_PLACES.csv"
HW_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_HW_sites.gpkg"
ACS_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_ACS_data.csv"

OUTPUT_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\Outputs\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\analysis_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_CSV)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# manuscript artifacts helpers are pre-imported in the system:
# record_figure, record_table, record_data_to_viz

warnings.filterwarnings("ignore", category=UserWarning)

# ----------------------------
# Utility
# ----------------------------
def to_float(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")

def safe_log1p(x: pd.Series) -> pd.Series:
    x = pd.to_numeric(x, errors="coerce")
    x = x.clip(lower=0)
    return np.log1p(x)

def ensure_unique_geoid(df: pd.DataFrame, geoid_col: str) -> pd.DataFrame:
    """
    Enforce one row per GEOID to prevent downstream duplicate-id errors.
    If duplicates exist, keep the first non-null-heavy row by sorting on
    non-null count (descending).
    """
    if geoid_col not in df.columns:
        raise KeyError(f"Missing key column '{geoid_col}'. Available: {list(df.columns)}")

    df = df.copy()
    df[geoid_col] = df[geoid_col].astype(str)

    dup_mask = df.duplicated(subset=[geoid_col], keep=False)
    if dup_mask.any():
        tmp = df.copy()
        # rank rows within each GEOID by non-null count (descending), keep best
        tmp["_nn"] = tmp.notna().sum(axis=1)
        tmp = tmp.sort_values([geoid_col, "_nn"], ascending=[True, False])
        tmp = tmp.drop_duplicates(subset=[geoid_col], keep="first").drop(columns=["_nn"])
        return tmp.reset_index(drop=True)

    return df.reset_index(drop=True)

def fit_ols(y: pd.Series, X: pd.DataFrame):
    Xc = sm.add_constant(X, has_constant="add")
    model = sm.OLS(y.values, Xc.values, missing="drop")
    res = model.fit(cov_type="HC1")
    return res, Xc.columns.tolist()

def partial_r2(full_res, reduced_res):
    # 1 - SSE_full/SSE_reduced
    sse_full = np.sum(full_res.resid ** 2)
    sse_reduced = np.sum(reduced_res.resid ** 2)
    if sse_reduced <= 0:
        return np.nan
    return 1.0 - (sse_full / sse_reduced)

# ----------------------------
# STEP 3: Script
# ----------------------------

# ---- Load spatial data ----
tract_gdf = gpd.read_file(TRACT_PATH)
hw_gdf = gpd.read_file(HW_PATH)

# Basic geometry validation
tract_gdf = tract_gdf[tract_gdf.geometry.notna()]
tract_gdf = tract_gdf[tract_gdf.geometry.is_valid & ~tract_gdf.geometry.is_empty].copy()
hw_gdf = hw_gdf[hw_gdf.geometry.notna()]
hw_gdf = hw_gdf[hw_gdf.geometry.is_valid & ~hw_gdf.geometry.is_empty].copy()

# Ensure unique tract GEOID before any join/analysis (prevents duplicate-id failures)
tract_gdf["GEOID"] = tract_gdf["GEOID"].astype(str)
tract_gdf = tract_gdf.drop_duplicates(subset=["GEOID"], keep="first").reset_index(drop=True)

# Load tabular data
places_df = pd.read_csv(PLACES_PATH, dtype={"GEOID": "string"})
acs_df = pd.read_csv(ACS_PATH, dtype={"GEOID": "string"})

# Enforce unique GEOID in tables too (prevents 1-to-many merge duplication)
places_df = ensure_unique_geoid(places_df, "GEOID")
acs_df = ensure_unique_geoid(acs_df, "GEOID")

# Cast and clean analysis fields
places_df["Asthma_prev"] = to_float(places_df["Asthma_prev"])

ratio_cols = [
    "ratio_white", "ratio_black", "ratio_asian", "ratio_hispanic", "ratio_other_race",
    "ratio_male", "ratio_female", "ratio_poverty", "ratio_unemployed", "ratio_uninsured"
]
for c in ratio_cols:
    acs_df[c] = to_float(acs_df[c])
acs_df["med_income"] = to_float(acs_df["med_income"])

# If NC_PLACES has a geometry column as WKT/strings, we don't rely on it for spatial ops.
# We'll join by GEOID to the tract geometry.

# ---- Merge tract + asthma + ACS ----
df = tract_gdf[["GEOID", "geometry"]].merge(
    places_df[["GEOID", "Asthma_prev"]],
    on="GEOID",
    how="left",
    validate="one_to_one",
)

df = df.merge(
    acs_df[["GEOID"] + ratio_cols + ["med_income"]],
    on="GEOID",
    how="left",
    validate="one_to_one",
)

gdf = gpd.GeoDataFrame(df, geometry="geometry", crs=tract_gdf.crs)

# Guard: ensure uniqueness (again) after merges
gdf = gdf.drop_duplicates(subset=["GEOID"], keep="first").reset_index(drop=True)

# ---- Reproject for distance calculations ----
# Use EPSG:3857 for metric distances (meters) as a robust default
gdf_m = gdf.to_crs(epsg=3857)
hw_m = hw_gdf.to_crs(epsg=3857)

# Use centroids (distance from tract centroid to nearest hazardous site)
gdf_m["centroid"] = gdf_m.geometry.centroid

# Compute nearest facility distance (meters) using unary_union for speed
hw_union = hw_m.geometry.unary_union
gdf_m["dist_to_hw_m"] = gdf_m["centroid"].apply(lambda p: p.distance(hw_union) if p is not None else np.nan)

# Derive proximity indicators
gdf_m["dist_to_hw_km"] = gdf_m["dist_to_hw_m"] / 1000.0
gdf_m["ln_dist_km_plus1"] = safe_log1p(gdf_m["dist_to_hw_km"])

# Example threshold: within 5 km
gdf_m["within_5km_hw"] = (gdf_m["dist_to_hw_km"] <= 5.0).astype(int)

# Prepare final analysis frame (drop rows missing outcome or key predictors)
analysis_cols = ["GEOID", "Asthma_prev", "dist_to_hw_km", "ln_dist_km_plus1", "within_5km_hw"] + ratio_cols + ["med_income"]
agdf = gdf_m[analysis_cols + ["geometry"]].copy()

# Clean impossible ratios (keep [0,1] if they are proportions; otherwise leave as-is but still numeric)
# We won't clamp, only set clearly impossible negatives to NA.
for c in ratio_cols:
    agdf.loc[agdf[c] < 0, c] = np.nan

# Drop NA for core model
agdf_model = agdf.dropna(subset=["Asthma_prev", "ln_dist_km_plus1", "ratio_poverty", "ratio_black", "ratio_hispanic", "ratio_uninsured", "med_income"]).copy()
agdf_model = agdf_model.reset_index(drop=True)

if len(agdf_model) < 50:
    raise ValueError(f"Too few tracts after cleaning for modeling: n={len(agdf_model)}. Check missingness in Asthma_prev/ACS variables.")

# ----------------------------
# Modeling: OLS + interactions (context heterogeneity)
# We model higher asthma with "closer to HW": use negative distance relationship.
# Using ln(distance+1): smaller distance => smaller ln-dist; expected negative coef if closer increases asthma.
# ----------------------------
y = agdf_model["Asthma_prev"]

base_X = agdf_model[[
    "ln_dist_km_plus1",
    "ratio_poverty",
    "ratio_black",
    "ratio_hispanic",
    "ratio_uninsured",
    "med_income",
]].copy()

# Standardize predictors for comparability (including ln_dist)
scaler = StandardScaler()
X_scaled = pd.DataFrame(
    scaler.fit_transform(base_X.values),
    columns=base_X.columns,
    index=base_X.index
)

# Add interaction terms between proximity and context
X_scaled["ln_dist_x_poverty"] = X_scaled["ln_dist_km_plus1"] * X_scaled["ratio_poverty"]
X_scaled["ln_dist_x_black"] = X_scaled["ln_dist_km_plus1"] * X_scaled["ratio_black"]
X_scaled["ln_dist_x_hispanic"] = X_scaled["ln_dist_km_plus1"] * X_scaled["ratio_hispanic"]
X_scaled["ln_dist_x_uninsured"] = X_scaled["ln_dist_km_plus1"] * X_scaled["ratio_uninsured"]
X_scaled["ln_dist_x_income"] = X_scaled["ln_dist_km_plus1"] * X_scaled["med_income"]

# Fit reduced and full models
reduced_res, reduced_cols = fit_ols(y, X_scaled[["ln_dist_km_plus1", "ratio_poverty", "ratio_black", "ratio_hispanic", "ratio_uninsured", "med_income"]])
full_res, full_cols = fit_ols(y, X_scaled)

# Partial R2 of adding interaction block
partial_r2_interactions = partial_r2(full_res, reduced_res)

# Build coefficient tables
def coef_table(res, colnames, model_name):
    out = pd.DataFrame({
        "model": model_name,
        "variable": colnames,
        "coef": res.params,
        "std_err": res.bse,
        "t": res.tvalues,
        "p_value": res.pvalues
    })
    return out

reduced_tbl = coef_table(reduced_res, reduced_cols, "OLS_reduced")
full_tbl = coef_table(full_res, full_cols, "OLS_full")

coef_tbl = pd.concat([reduced_tbl, full_tbl], ignore_index=True)

# Save coefficient table for manuscript
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
coef_path = os.path.join(tables_dir, "ols_coefficients.csv")
coef_tbl.to_csv(coef_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_path,
    caption="Table 1. OLS regression coefficients predicting tract-level asthma prevalence from proximity to hazardous waste facilities and socioeconomic/demographic context (standardized predictors; HC1 robust SEs).",
    role="promoted",
    columns=["model", "variable", "coef", "std_err", "t", "p_value"],
)

# ----------------------------
# Spatial autocorrelation diagnostic on outcome + residuals
# IMPORTANT: Avoid duplicate-id error by using KNN weights with unique integer ids (index),
# and by ensuring one row per GEOID already.
# ----------------------------
# Weights on the same cleaned gdf used for residuals
w_gdf = agdf_model[["GEOID", "geometry"]].copy()
w_gdf = gpd.GeoDataFrame(w_gdf, geometry="geometry", crs=gdf_m.crs).reset_index(drop=True)
w_gdf = w_gdf[w_gdf.geometry.is_valid & ~w_gdf.geometry.is_empty].copy().reset_index(drop=True)

# Ensure the model design aligns with weight gdf row order
# (agdf_model is already reset_index; we assume same order)
if len(w_gdf) != len(agdf_model):
    raise ValueError("Weights GeoDataFrame and model dataframe differ in length after cleaning; cannot compute Moran's I reliably.")

# KNN weights uses index as ids, avoiding GEOID duplicates entirely
w = KNN.from_dataframe(w_gdf, k=8)
w.transform = "r"

# Residuals for diagnostics
agdf_model["ols_full_resid"] = full_res.resid

mi_y = Moran(agdf_model["Asthma_prev"].values, w, permutations=999)
mi_resid = Moran(agdf_model["ols_full_resid"].values, w, permutations=999)

# ----------------------------
# Context-stratified associations (variation by context)
# Compare proximity effect (simple adjusted model) across low/high poverty and low/high %Black
# ----------------------------
def stratified_effect(df_in, strat_col, label):
    d = df_in.dropna(subset=[strat_col, "Asthma_prev", "ln_dist_km_plus1", "ratio_uninsured", "med_income"]).copy()
    if len(d) < 100:
        return []

    med = d[strat_col].median()
    out_rows = []
    for grp_name, grp in [("low", d[d[strat_col] <= med]), ("high", d[d[strat_col] > med])]:
        if len(grp) < 50:
            continue
        X = grp[["ln_dist_km_plus1", "ratio_uninsured", "med_income"]].copy()
        Xs = pd.DataFrame(StandardScaler().fit_transform(X.values), columns=X.columns, index=X.index)
        res, cols = fit_ols(grp["Asthma_prev"], Xs)
        # variable name after add_constant
        vname = "ln_dist_km_plus1"
        # Map to param index (since we passed numpy array)
        idx = cols.index(vname)
        out_rows.append({
            "analysis": "stratified_ols",
            "stratification": label,
            "group": grp_name,
            "n": int(len(grp)),
            "coef_ln_dist": float(res.params[idx]),
            "se_ln_dist": float(res.bse[idx]),
            "p_ln_dist": float(res.pvalues[idx]),
            "r2": float(res.rsquared),
        })
    return out_rows

strat_rows = []
strat_rows += stratified_effect(agdf_model, "ratio_poverty", "poverty_median_split")
strat_rows += stratified_effect(agdf_model, "ratio_black", "black_share_median_split")
strat_df = pd.DataFrame(strat_rows)

# Save stratified table
strat_path = os.path.join(tables_dir, "stratified_effects.csv")
strat_df.to_csv(strat_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=strat_path,
    caption="Table 2. Stratified OLS estimates of the proximity (ln distance) association with asthma prevalence across socioeconomic/demographic context (median splits; standardized predictors; HC1 robust SEs).",
    role="promoted",
    columns=["stratification", "group", "n", "coef_ln_dist", "se_ln_dist", "p_ln_dist", "r2"],
)

# ----------------------------
# Visualization
# ----------------------------
# Prepare mapping GeoDataFrame (back to geographic for plotting if needed; keep web mercator too)
plot_gdf = agdf.copy()
plot_gdf = plot_gdf.dropna(subset=["Asthma_prev", "dist_to_hw_km"]).copy()

# 1) Choropleth: asthma prevalence
fig, ax = plt.subplots(1, 1, figsize=(10, 10))
plot_gdf.plot(column="Asthma_prev", cmap="Reds", linewidth=0.0, ax=ax, legend=True)
ax.set_title("North Carolina census tracts: Asthma prevalence")
ax.set_axis_off()
asthma_map_path = os.path.join(OUTPUT_DIR, "fig_asthma_choropleth.png")
plt.tight_layout()
plt.savefig(asthma_map_path, dpi=300)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=asthma_map_path,
    caption="Choropleth map of asthma prevalence across North Carolina census tracts.",
    role="final",
    objective_key="objective_1",
    step_index=1,
)

# 2) Choropleth: distance to nearest hazardous waste site (km)
fig, ax = plt.subplots(1, 1, figsize=(10, 10))
plot_gdf.plot(column="dist_to_hw_km", cmap="Blues", linewidth=0.0, ax=ax, legend=True)
ax.set_title("North Carolina census tracts: Distance to nearest hazardous waste facility (km)")
ax.set_axis_off()
dist_map_path = os.path.join(OUTPUT_DIR, "fig_distance_to_hw_choropleth.png")
plt.tight_layout()
plt.savefig(dist_map_path, dpi=300)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=dist_map_path,
    caption="Choropleth map of tract centroid distance to the nearest hazardous waste facility (km).",
    role="promoted",
    objective_key="objective_1",
    step_index=2,
)

# 3) Scatter with binned trend: asthma vs distance
tmp = plot_gdf[["Asthma_prev", "dist_to_hw_km"]].dropna().copy()
tmp = tmp[tmp["dist_to_hw_km"].between(0, tmp["dist_to_hw_km"].quantile(0.99))]  # trim extreme 1%
tmp["dist_bin"] = pd.qcut(tmp["dist_to_hw_km"], q=20, duplicates="drop")
binned = tmp.groupby("dist_bin", observed=True).agg(
    dist_km_mean=("dist_to_hw_km", "mean"),
    asthma_mean=("Asthma_prev", "mean"),
    n=("Asthma_prev", "size"),
).reset_index(drop=True)

fig, ax = plt.subplots(1, 1, figsize=(8, 5))
ax.scatter(tmp["dist_to_hw_km"], tmp["Asthma_prev"], s=5, alpha=0.15, color="gray", label="Tracts")
ax.plot(binned["dist_km_mean"], binned["asthma_mean"], color="black", linewidth=2, label="Binned mean (20 quantiles)")
ax.set_xlabel("Distance to nearest hazardous waste facility (km)")
ax.set_ylabel("Asthma prevalence")
ax.set_title("Asthma prevalence vs proximity to hazardous waste facilities")
ax.legend(frameon=False)
scatter_path = os.path.join(OUTPUT_DIR, "fig_asthma_vs_distance.png")
plt.tight_layout()
plt.savefig(scatter_path, dpi=300)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=scatter_path,
    caption="Scatterplot of tract-level asthma prevalence versus distance to nearest hazardous waste facility, with binned mean trend.",
    role="final",
    objective_key="objective_1",
    step_index=3,
)

# ----------------------------
# Key quantitative results to analysis_results.csv (primary output)
# ----------------------------
# Summaries: model fit + key proximity coefficients + Moran diagnostics + interaction block value
def pick_coef(res_tbl, model, var):
    s = res_tbl[(res_tbl["model"] == model) & (res_tbl["variable"] == var)]
    if len(s) != 1:
        return (np.nan, np.nan, np.nan)
    return (float(s["coef"].iloc[0]), float(s["std_err"].iloc[0]), float(s["p_value"].iloc[0]))

# For reduced and full models, coefficients are standardized.
# Interpret sign: negative coef on ln_dist => closer (smaller distance) associated with higher asthma.
coef_red, se_red, p_red = pick_coef(coef_tbl, "OLS_reduced", "ln_dist_km_plus1")
coef_full, se_full, p_full = pick_coef(coef_tbl, "OLS_full", "ln_dist_km_plus1")

results_rows = [
    {
        "metric": "n_tracts_model",
        "value": int(len(agdf_model)),
        "notes": "Number of census tracts with complete data for full model."
    },
    {
        "metric": "ols_reduced_r2",
        "value": float(reduced_res.rsquared),
        "notes": "R-squared for reduced OLS (no interactions), HC1 robust SEs."
    },
    {
        "metric": "ols_full_r2",
        "value": float(full_res.rsquared),
        "notes": "R-squared for full OLS (with interactions), HC1 robust SEs."
    },
    {
        "metric": "partial_r2_interactions",
        "value": float(partial_r2_interactions),
        "notes": "Partial R2 improvement when adding proximity×context interactions (full vs reduced)."
    },
    {
        "metric": "ols_reduced_coef_ln_dist",
        "value": coef_red,
        "notes": "Standardized coefficient for ln(distance_km+1). Negative implies higher asthma closer to sites."
    },
    {
        "metric": "ols_reduced_p_ln_dist",
        "value": p_red,
        "notes": "P-value for standardized ln(distance_km+1) coefficient in reduced model."
    },
    {
        "metric": "ols_full_coef_ln_dist",
        "value": coef_full,
        "notes": "Standardized coefficient for ln(distance_km+1) in full interaction model."
    },
    {
        "metric": "ols_full_p_ln_dist",
        "value": p_full,
        "notes": "P-value for standardized ln(distance_km+1) coefficient in full interaction model."
    },
    {
        "metric": "morans_I_asthma",
        "value": float(mi_y.I),
        "notes": f"Global Moran's I for asthma prevalence (KNN k=8), permutations=999; p_sim={mi_y.p_sim:.6g}."
    },
    {
        "metric": "morans_p_asthma",
        "value": float(mi_y.p_sim),
        "notes": "Permutation p-value for Global Moran's I (asthma)."
    },
    {
        "metric": "morans_I_ols_full_residuals",
        "value": float(mi_resid.I),
        "notes": f"Global Moran's I for full-model residuals (KNN k=8), permutations=999; p_sim={mi_resid.p_sim:.6g}."
    },
    {
        "metric": "morans_p_ols_full_residuals",
        "value": float(mi_resid.p_sim),
        "notes": "Permutation p-value for Global Moran's I (full-model residuals)."
    },
]

# Add key interaction terms from full model
for v in ["ln_dist_x_poverty", "ln_dist_x_black", "ln_dist_x_hispanic", "ln_dist_x_uninsured", "ln_dist_x_income"]:
    c, s, p = pick_coef(coef_tbl, "OLS_full", v)
    results_rows.append({
        "metric": f"ols_full_coef_{v}",
        "value": c,
        "notes": f"Standardized interaction coefficient for {v} (proximity×context)."
    })
    results_rows.append({
        "metric": f"ols_full_p_{v}",
        "value": p,
        "notes": f"P-value for interaction term {v} in full model."
    })

# Include stratified summary compactly (if present)
if len(strat_df) > 0:
    for _, r in strat_df.iterrows():
        results_rows.append({
            "metric": f"strat_{r['stratification']}_{r['group']}_coef_ln_dist",
            "value": float(r["coef_ln_dist"]),
            "notes": f"Stratified (median split) standardized ln(distance) coefficient; n={int(r['n'])}; p={float(r['p_ln_dist']):.6g}."
        })

results_df = pd.DataFrame(results_rows)
os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
results_df.to_csv(OUTPUT_CSV, index=False)

# Also record the primary results CSV as a promoted table for manuscript traceability
primary_table_path = os.path.join(tables_dir, "analysis_results_key_metrics.csv")
results_df.to_csv(primary_table_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=primary_table_path,
    caption="Table 3. Key quantitative results: proximity effect estimates, interaction significance, and spatial autocorrelation diagnostics.",
    role="promoted",
    columns=["metric", "value", "notes"],
)