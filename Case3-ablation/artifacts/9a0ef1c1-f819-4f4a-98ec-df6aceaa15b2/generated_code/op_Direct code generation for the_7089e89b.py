import os
import warnings
import numpy as np
import pandas as pd
import geopandas as gpd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.preprocessing import StandardScaler

import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor
from scipy.stats import pearsonr

from libpysal.weights import Queen
from esda.moran import Moran
from esda.moran import Moran_Local

from mgwr.gwr import GWR
from mgwr.sel_bw import Sel_BW

# Pre-imported helpers in the automated research system
# record_figure, record_table, record_data_to_viz

# ----------------------------
# Paths (exactly as provided)
# ----------------------------
NC_TRACT_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_tract.gpkg"
NC_PLACES_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_PLACES.csv"
NC_HW_SITES_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_HW_sites.gpkg"
NC_ACS_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\NC_ACS_data.csv"

OUTPUT_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\Outputs\9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2\analysis_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_CSV)
os.makedirs(OUTPUT_DIR, exist_ok=True)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

fig_dir = os.path.join(OUTPUT_DIR, "figures")
os.makedirs(fig_dir, exist_ok=True)

# ----------------------------
# Utilities
# ----------------------------
def safe_to_numeric(s: pd.Series) -> pd.Series:
    """Convert to numeric robustly (handles commas, percent signs); returns float with NaN on parse fail."""
    if pd.api.types.is_numeric_dtype(s):
        return s.astype(float)
    ss = s.astype(str).str.strip()
    ss = ss.str.replace(",", "", regex=False)
    ss = ss.str.replace("%", "", regex=False)
    ss = ss.replace({"": np.nan, "None": np.nan, "nan": np.nan})
    return pd.to_numeric(ss, errors="coerce")

def ensure_crs_projected(gdf: gpd.GeoDataFrame, fallback_epsg=4326, target_epsg=3857) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=fallback_epsg, allow_override=True)
    if gdf.crs.is_geographic:
        gdf = gdf.to_crs(epsg=target_epsg)
    return gdf

def add_distance_features(tracts_gdf: gpd.GeoDataFrame, sites_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    # centroids in projected CRS
    cent = tracts_gdf.geometry.centroid
    tracts_pts = gpd.GeoDataFrame(tracts_gdf.drop(columns=["geometry"]).copy(), geometry=cent, crs=tracts_gdf.crs)

    # nearest hazardous site distance (meters) using spatial index
    # geopandas sjoin_nearest needs >=0.10; fallback to brute if unavailable
    try:
        nearest = gpd.sjoin_nearest(
            tracts_pts[["GEOID", "geometry"]],
            sites_gdf[["SITE_NAME", "geometry"]],
            how="left",
            distance_col="dist_to_hw_m"
        )
        out = tracts_gdf.merge(nearest[["GEOID", "dist_to_hw_m"]], on="GEOID", how="left")
    except Exception:
        # brute force fallback (can be slow)
        site_geom = sites_gdf.geometry.values
        dists = []
        for geom in tracts_pts.geometry.values:
            d = np.nan
            if geom is not None and len(site_geom) > 0:
                d = np.min([geom.distance(sg) for sg in site_geom])
            dists.append(d)
        out = tracts_gdf.copy()
        out["dist_to_hw_m"] = np.array(dists, dtype=float)

    out["dist_to_hw_km"] = out["dist_to_hw_m"] / 1000.0
    out["ln_dist_to_hw_km"] = np.log1p(out["dist_to_hw_km"])
    out["within_1km"] = (out["dist_to_hw_km"] <= 1.0).astype("Int64")
    out["within_3km"] = (out["dist_to_hw_km"] <= 3.0).astype("Int64")
    out["within_5km"] = (out["dist_to_hw_km"] <= 5.0).astype("Int64")
    return out

def compute_vif(X: pd.DataFrame) -> pd.DataFrame:
    X_ = X.copy()
    X_ = X_.replace([np.inf, -np.inf], np.nan).dropna(axis=0, how="any")
    if X_.shape[0] < 10 or X_.shape[1] < 2:
        return pd.DataFrame({"variable": X.columns, "VIF": np.nan})
    X_const = sm.add_constant(X_, has_constant="add")
    vifs = []
    cols = list(X_const.columns)
    for i, col in enumerate(cols):
        if col == "const":
            continue
        vifs.append((col, variance_inflation_factor(X_const.values, i)))
    return pd.DataFrame(vifs, columns=["variable", "VIF"]).sort_values("VIF", ascending=False)

def qcut_3(s: pd.Series) -> pd.Series:
    s2 = s.copy()
    # if too many ties, qcut can fail; fallback to cut on quantiles manually
    try:
        return pd.qcut(s2, 3, labels=["Low", "Mid", "High"])
    except Exception:
        qs = s2.quantile([0.333, 0.667]).values
        return pd.cut(s2, bins=[-np.inf, qs[0], qs[1], np.inf], labels=["Low", "Mid", "High"], include_lowest=True)

# ----------------------------
# Load data
# ----------------------------
tracts = gpd.read_file(NC_TRACT_PATH)
hw_sites = gpd.read_file(NC_HW_SITES_PATH)
places = pd.read_csv(NC_PLACES_PATH)
acs = pd.read_csv(NC_ACS_PATH)

# Validate geometries
tracts = tracts[tracts.geometry.notnull() & ~tracts.geometry.is_empty].copy()
tracts = tracts[tracts.geometry.is_valid].copy()

hw_sites = hw_sites[hw_sites.geometry.notnull() & ~hw_sites.geometry.is_empty].copy()
hw_sites = hw_sites[hw_sites.geometry.is_valid].copy()

# CRS alignment
tracts = ensure_crs_projected(tracts, fallback_epsg=4326, target_epsg=3857)
hw_sites = ensure_crs_projected(hw_sites, fallback_epsg=4326, target_epsg=tracts.crs.to_epsg() if tracts.crs else 3857)
if tracts.crs != hw_sites.crs:
    hw_sites = hw_sites.to_crs(tracts.crs)

# ----------------------------
# Prepare tabular data
# ----------------------------
# NC_PLACES.csv columns: GEOID, Asthma_prev, geometry (object)
# Prefer Asthma_prev as numeric; ignore its geometry field (non-spatial here)
places = places.copy()
places["GEOID"] = places["GEOID"].astype(str)
places["Asthma_prev"] = safe_to_numeric(places["Asthma_prev"])

acs = acs.copy()
acs["GEOID"] = acs["GEOID"].astype(str)

# Convert ACS ratio_* and med_income to numeric
acs_numeric_cols = [
    "ratio_white", "ratio_black", "ratio_asian", "ratio_hispanic", "ratio_other_race",
    "ratio_male", "ratio_female", "ratio_poverty", "ratio_unemployed", "ratio_uninsured",
    "med_income"
]
for c in acs_numeric_cols:
    acs[c] = safe_to_numeric(acs[c])

# ----------------------------
# Join tract geometry + asthma + ACS
# ----------------------------
tracts2 = tracts.copy()
tracts2["GEOID"] = tracts2["GEOID"].astype(str)

gdf = tracts2.merge(places[["GEOID", "Asthma_prev"]], on="GEOID", how="left")
gdf = gdf.merge(acs[["GEOID"] + acs_numeric_cols], on="GEOID", how="left")

# Add distance-to-hazardous-waste variables
gdf = add_distance_features(gdf, hw_sites)

# Final geometry validation
gdf = gdf[gdf.geometry.notnull() & ~gdf.geometry.is_empty].copy()
gdf = gdf[gdf.geometry.is_valid].copy()

# ----------------------------
# Analysis dataset + derived context variables
# ----------------------------
# Outcomes / predictors
y_col = "Asthma_prev"
base_x_cols = [
    "ln_dist_to_hw_km",
    "ratio_poverty",
    "ratio_black",
    "ratio_hispanic",
    "ratio_uninsured",
    "med_income"
]
# Ensure numeric types
gdf[y_col] = safe_to_numeric(gdf[y_col])
for c in base_x_cols:
    gdf[c] = safe_to_numeric(gdf[c])

# Interaction terms to test heterogeneity by context (global model)
gdf["int_lnDist_poverty"] = gdf["ln_dist_to_hw_km"] * gdf["ratio_poverty"]
gdf["int_lnDist_black"] = gdf["ln_dist_to_hw_km"] * gdf["ratio_black"]
gdf["int_lnDist_uninsured"] = gdf["ln_dist_to_hw_km"] * gdf["ratio_uninsured"]

x_cols_interactions = base_x_cols + ["int_lnDist_poverty", "int_lnDist_black", "int_lnDist_uninsured"]

# Clean aligned rows for regression
model_df = gdf[["GEOID", y_col] + x_cols_interactions + ["dist_to_hw_km", "within_1km", "within_3km", "within_5km"]].copy()
model_df = model_df.replace([np.inf, -np.inf], np.nan).dropna(subset=[y_col] + x_cols_interactions).copy()

# Attach back to geometry for spatial diagnostics/plots
gdf_m = gdf.merge(model_df[["GEOID"]], on="GEOID", how="inner")

# ----------------------------
# Descriptive stats + simple association
# ----------------------------
desc_rows = []
desc_rows.append(("n_tracts_total", len(gdf), np.nan, np.nan))
desc_rows.append(("n_tracts_model", len(model_df), np.nan, np.nan))
desc_rows.append(("n_hw_sites", len(hw_sites), np.nan, np.nan))

# correlation asthma vs distance
if len(model_df) >= 3:
    r, p = pearsonr(model_df[y_col].astype(float), model_df["ln_dist_to_hw_km"].astype(float))
else:
    r, p = np.nan, np.nan
desc_rows.append(("pearsonr_asthma_lnDist", r, p, np.nan))

desc_df = pd.DataFrame(desc_rows, columns=["metric", "value", "p_value", "note"])

# ----------------------------
# Global OLS regression (with interactions)
# ----------------------------
X = model_df[x_cols_interactions].astype(float)
y = model_df[y_col].astype(float)

X_const = sm.add_constant(X, has_constant="add")
ols = sm.OLS(y, X_const).fit(cov_type="HC1")  # robust SE

ols_coef = (
    pd.DataFrame({
        "variable": ols.params.index,
        "coef": ols.params.values,
        "std_err_HC1": ols.bse.values,
        "t_value": ols.tvalues.values,
        "p_value": ols.pvalues.values
    })
)
ols_coef_path = os.path.join(tables_dir, "ols_coefficients.csv")
ols_coef.to_csv(ols_coef_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=ols_coef_path,
    caption="OLS (robust SE) coefficients modeling tract asthma prevalence with hazardous-waste proximity, socioeconomic/demographic covariates, and interaction terms.",
    role="promoted",
    columns=["variable", "coef", "std_err_HC1", "t_value", "p_value"]
)

# Model fit stats table
fit_stats = pd.DataFrame([{
    "model": "OLS_HC1",
    "n": int(ols.nobs),
    "r2": float(ols.rsquared),
    "adj_r2": float(ols.rsquared_adj),
    "aic": float(ols.aic),
    "bic": float(ols.bic),
    "f_pvalue": float(ols.f_pvalue) if np.isfinite(ols.f_pvalue) else np.nan
}])
fit_stats_path = os.path.join(tables_dir, "model_fit_stats.csv")
fit_stats.to_csv(fit_stats_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=fit_stats_path,
    caption="Model fit statistics for the global OLS model (robust standard errors).",
    role="promoted",
    columns=list(fit_stats.columns)
)

# VIF diagnostics (on main effects only; interactions inflate collinearity)
vif_df = compute_vif(model_df[base_x_cols].astype(float))
vif_path = os.path.join(tables_dir, "vif_main_effects.csv")
vif_df.to_csv(vif_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=vif_path,
    caption="Variance inflation factors (VIF) for main-effect covariates used in OLS/GWR (excluding interactions).",
    role="intermediate",
    columns=["variable", "VIF"]
)

# Add OLS predictions/residuals to spatial frame
pred = ols.predict(X_const)
model_df["ols_pred"] = pred
model_df["ols_resid"] = y - pred

gdf_m2 = gdf_m.merge(model_df[["GEOID", "ols_pred", "ols_resid"]], on="GEOID", how="left")

# ----------------------------
# Spatial autocorrelation diagnostics (asthma + OLS residuals)
# ----------------------------
# Queen contiguity weights; row-standardized
w_gdf = gdf_m2[["GEOID", "geometry", y_col, "ols_resid"]].copy()
w_gdf = w_gdf.dropna(subset=[y_col, "ols_resid"]).copy()

w = Queen.from_dataframe(w_gdf, ids=w_gdf["GEOID"].tolist())
w.transform = "R"

moran_asthma = Moran(w_gdf[y_col].astype(float).values, w)
moran_resid = Moran(w_gdf["ols_resid"].astype(float).values, w)

moran_tbl = pd.DataFrame([
    {"variable": y_col, "moran_I": float(moran_asthma.I), "p_sim": float(moran_asthma.p_sim), "n": int(moran_asthma.n)},
    {"variable": "ols_resid", "moran_I": float(moran_resid.I), "p_sim": float(moran_resid.p_sim), "n": int(moran_resid.n)},
])
moran_path = os.path.join(tables_dir, "moran_global.csv")
moran_tbl.to_csv(moran_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=moran_path,
    caption="Global Moran's I for asthma prevalence and for OLS residuals (Queen contiguity, row-standardized).",
    role="promoted",
    columns=["variable", "moran_I", "p_sim", "n"]
)

# Local Moran for asthma (LISA) to show spatial patterning
try:
    lisa = Moran_Local(w_gdf[y_col].astype(float).values, w)
    w_gdf["lisa_I"] = lisa.Is
    w_gdf["lisa_p"] = lisa.p_sim
    # cluster categories (HH, LL, HL, LH) using quadrant + significance
    # quadrant: 1 HH, 2 LH, 3 LL, 4 HL (PySAL convention)
    quad = lisa.q
    sig = (w_gdf["lisa_p"] <= 0.05).values
    cluster = np.array(["Not significant"] * len(w_gdf), dtype=object)
    cluster[(quad == 1) & sig] = "High-High"
    cluster[(quad == 3) & sig] = "Low-Low"
    cluster[(quad == 2) & sig] = "Low-High"
    cluster[(quad == 4) & sig] = "High-Low"
    w_gdf["lisa_cluster"] = cluster
except Exception as e:
    warnings.warn(f"LISA computation failed: {e}")
    w_gdf["lisa_cluster"] = "Unavailable"

# ----------------------------
# GWR: spatially varying relationship (main effects only)
# ----------------------------
# Use same rows as model_df but without interactions for stability/interpretation
gdf_gwr = gdf.merge(model_df[["GEOID"]], on="GEOID", how="inner").copy()

gwr_y_col = y_col
gwr_x_cols = base_x_cols  # main effects only

# Prepare arrays (projected coords in meters)
centroids = gdf_gwr.geometry.centroid
coords = np.column_stack([centroids.x.values, centroids.y.values]).astype(float)

y_arr = gdf_gwr[[gwr_y_col]].apply(safe_to_numeric).values.astype(float)  # (n,1)
X_raw = gdf_gwr[gwr_x_cols].apply(safe_to_numeric).values.astype(float)   # (n,k)

mask = np.isfinite(np.hstack([y_arr, X_raw, coords])).all(axis=1)
gdf_gwr = gdf_gwr.loc[mask].copy()
coords = coords[mask]
y_arr = y_arr[mask]
X_raw = X_raw[mask]

if len(gdf_gwr) < 50:
    warnings.warn(f"GWR may be unreliable with n={len(gdf_gwr)} tracts after filtering.")

# Standardize for selection/fit
x_scaler, y_scaler = StandardScaler(), StandardScaler()
X_s = x_scaler.fit_transform(X_raw)
y_s = y_scaler.fit_transform(y_arr)

# Bandwidth selection (adaptive bisquare)
selector = Sel_BW(coords, y_s, X_s, fixed=False, kernel="bisquare", spherical=False)
bw = selector.search(criterion="AICc")

gwr_model = GWR(coords, y_s, X_s, bw=bw, fixed=False, kernel="bisquare", spherical=False)
gwr_res = gwr_model.fit()

# Back-transform coefficients to original units
param_names = ["Intercept"] + gwr_x_cols
params = gwr_res.params
bse = gwr_res.bse
tvals = gwr_res.tvalues
localR2 = np.asarray(gwr_res.localR2).flatten()

y_mean = float(y_scaler.mean_[0])
y_std = float(np.sqrt(y_scaler.var_[0]))
x_means = x_scaler.mean_
x_stds = np.sqrt(x_scaler.var_)

betas = np.zeros_like(params)
for j in range(1, len(param_names)):
    betas[:, j] = (y_std / x_stds[j - 1]) * params[:, j]
betas[:, 0] = y_mean + y_std * params[:, 0] - (betas[:, 1:] * x_means.reshape(1, -1)).sum(axis=1)

gdf_gwr_out = gdf_gwr.copy()
for j, name in enumerate(param_names):
    gdf_gwr_out[f"gwr_b_{name}"] = betas[:, j]
    gdf_gwr_out[f"gwr_t_{name}"] = tvals[:, j]
    gdf_gwr_out[f"gwr_se_{name}"] = bse[:, j]
gdf_gwr_out["gwr_localR2"] = localR2
gdf_gwr_out["gwr_aicc"] = float(gwr_res.aicc)
gdf_gwr_out["gwr_R2"] = float(gwr_res.R2)
gdf_gwr_out["gwr_adj_R2"] = float(gwr_res.adj_R2)
gdf_gwr_out["gwr_bw_neighbors"] = int(bw)

# ----------------------------
# Stratified summaries: effect differs by context (quantiles)
# ----------------------------
strat = gdf.merge(model_df[["GEOID"]], on="GEOID", how="inner").copy()
for c in ["ratio_poverty", "ratio_black", "med_income", "ratio_uninsured"]:
    strat[c] = safe_to_numeric(strat[c])

strat["poverty_tercile"] = qcut_3(strat["ratio_poverty"])
strat["black_tercile"] = qcut_3(strat["ratio_black"])
strat["income_tercile"] = qcut_3(strat["med_income"])

# Compare mean asthma by proximity thresholds within terciles
# Use within_3km as a primary buffer indicator
strat["Asthma_prev"] = safe_to_numeric(strat["Asthma_prev"])
strat["within_3km"] = strat["within_3km"].astype("Int64")

def group_diff(df, group_col):
    out_rows = []
    for lvl, sub in df.dropna(subset=[group_col, "within_3km", "Asthma_prev"]).groupby(group_col):
        near = sub[sub["within_3km"] == 1]["Asthma_prev"].astype(float)
        far = sub[sub["within_3km"] == 0]["Asthma_prev"].astype(float)
        out_rows.append({
            "context_var": group_col,
            "context_level": str(lvl),
            "n": int(len(sub)),
            "n_within_3km": int((sub["within_3km"] == 1).sum()),
            "mean_asthma_within_3km": float(near.mean()) if len(near) else np.nan,
            "mean_asthma_outside_3km": float(far.mean()) if len(far) else np.nan,
            "diff_within_minus_outside": float(near.mean() - far.mean()) if (len(near) and len(far)) else np.nan
        })
    return pd.DataFrame(out_rows)

strat_tbl = pd.concat([
    group_diff(strat, "poverty_tercile"),
    group_diff(strat, "black_tercile"),
    group_diff(strat, "income_tercile"),
], ignore_index=True)

strat_path = os.path.join(tables_dir, "stratified_proximity_differences.csv")
strat_tbl.to_csv(strat_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=strat_path,
    caption="Stratified mean differences in asthma prevalence (within 3 km vs outside) by terciles of poverty, Black population share, and median income.",
    role="promoted"
)

# ----------------------------
# Key quantitative results -> analysis_results.csv (required)
# ----------------------------
key_results = []

# Core OLS terms (proximity + interactions)
for v in ["ln_dist_to_hw_km", "int_lnDist_poverty", "int_lnDist_black", "int_lnDist_uninsured"]:
    if v in ols.params.index:
        key_results.append({
            "result_group": "OLS_HC1",
            "metric": "coef",
            "term": v,
            "value": float(ols.params[v]),
            "p_value": float(ols.pvalues[v])
        })

# Overall fit
key_results.append({
    "result_group": "OLS_HC1",
    "metric": "adj_r2",
    "term": "model",
    "value": float(ols.rsquared_adj),
    "p_value": np.nan
})

# Moran's I
key_results.append({
    "result_group": "SpatialAutocorrelation",
    "metric": "Moran_I",
    "term": "Asthma_prev",
    "value": float(moran_asthma.I),
    "p_value": float(moran_asthma.p_sim)
})
key_results.append({
    "result_group": "SpatialAutocorrelation",
    "metric": "Moran_I",
    "term": "OLS_residuals",
    "value": float(moran_resid.I),
    "p_value": float(moran_resid.p_sim)
})

# GWR diagnostics
key_results.append({
    "result_group": "GWR",
    "metric": "AICc",
    "term": "model",
    "value": float(gwr_res.aicc),
    "p_value": np.nan
})
key_results.append({
    "result_group": "GWR",
    "metric": "adj_R2",
    "term": "model",
    "value": float(gwr_res.adj_R2),
    "p_value": np.nan
})
key_results.append({
    "result_group": "GWR",
    "metric": "bandwidth_neighbors",
    "term": "model",
    "value": float(bw),
    "p_value": np.nan
})

# Summaries of spatially varying proximity effect (GWR coefficient distribution)
b_lnDist = gdf_gwr_out["gwr_b_ln_dist_to_hw_km"].astype(float)
key_results.extend([
    {"result_group": "GWR", "metric": "beta_lnDist_mean", "term": "ln_dist_to_hw_km", "value": float(np.nanmean(b_lnDist)), "p_value": np.nan},
    {"result_group": "GWR", "metric": "beta_lnDist_p25", "term": "ln_dist_to_hw_km", "value": float(np.nanpercentile(b_lnDist, 25)), "p_value": np.nan},
    {"result_group": "GWR", "metric": "beta_lnDist_p50", "term": "ln_dist_to_hw_km", "value": float(np.nanpercentile(b_lnDist, 50)), "p_value": np.nan},
    {"result_group": "GWR", "metric": "beta_lnDist_p75", "term": "ln_dist_to_hw_km", "value": float(np.nanpercentile(b_lnDist, 75)), "p_value": np.nan},
])

analysis_results = pd.DataFrame(key_results)
analysis_results.to_csv(OUTPUT_CSV, index=False)

# ----------------------------
# Visualization (maps + diagnostics)
# ----------------------------
# 1) Asthma prevalence choropleth
fig1_path = os.path.join(fig_dir, "map_asthma_prevalence.png")
fig, ax = plt.subplots(1, 1, figsize=(9, 8))
gdf.plot(column=y_col, ax=ax, legend=True, cmap="OrRd", missing_kwds={"color": "lightgrey", "label": "Missing"})
hw_sites.plot(ax=ax, color="black", markersize=5, alpha=0.6)
ax.set_title("Asthma prevalence by census tract with hazardous waste facility locations (NC)")
ax.axis("off")
plt.tight_layout()
plt.savefig(fig1_path, dpi=200)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=fig1_path,
    caption="Choropleth of tract-level asthma prevalence overlaid with hazardous waste facility locations across North Carolina.",
    role="final",
    objective_key="objective_1",
    step_index=1
)

# 2) Distance to hazardous waste (km)
fig2_path = os.path.join(fig_dir, "map_distance_to_hw.png")
fig, ax = plt.subplots(1, 1, figsize=(9, 8))
gdf.plot(column="dist_to_hw_km", ax=ax, legend=True, cmap="viridis", missing_kwds={"color": "lightgrey", "label": "Missing"})
hw_sites.plot(ax=ax, color="red", markersize=5, alpha=0.6)
ax.set_title("Distance from tract centroid to nearest hazardous waste facility (km)")
ax.axis("off")
plt.tight_layout()
plt.savefig(fig2_path, dpi=200)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=fig2_path,
    caption="Distance to the nearest hazardous waste facility (from tract centroids), mapped by tract across North Carolina.",
    role="promoted",
    objective_key="objective_1",
    step_index=2
)

# 3) LISA cluster map (asthma)
fig3_path = os.path.join(fig_dir, "map_lisa_asthma_clusters.png")
fig, ax = plt.subplots(1, 1, figsize=(9, 8))
cluster_order = ["High-High", "Low-Low", "High-Low", "Low-High", "Not significant", "Unavailable"]
cat = pd.Categorical(w_gdf["lisa_cluster"], categories=cluster_order, ordered=True)
w_gdf2 = w_gdf.copy()
w_gdf2["lisa_cluster"] = cat
w_gdf2.plot(column="lisa_cluster", ax=ax, legend=True, cmap="tab10", missing_kwds={"color": "lightgrey"})
ax.set_title("Local Moran (LISA) clusters for asthma prevalence (p ≤ 0.05)")
ax.axis("off")
plt.tight_layout()
plt.savefig(fig3_path, dpi=200)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=fig3_path,
    caption="Local Moran's I (LISA) cluster map identifying significant hot spots/cold spots of asthma prevalence (Queen contiguity, p ≤ 0.05).",
    role="promoted",
    objective_key="objective_1",
    step_index=3
)

# 4) GWR coefficient map for proximity (ln distance)
fig4_path = os.path.join(fig_dir, "map_gwr_beta_lnDist.png")
fig, ax = plt.subplots(1, 1, figsize=(9, 8))
gdf_gwr_out.plot(column="gwr_b_ln_dist_to_hw_km", ax=ax, legend=True, cmap="RdBu_r", missing_kwds={"color": "lightgrey", "label": "Missing"})
ax.set_title("GWR local coefficient for ln(distance to nearest hazardous waste) → asthma prevalence")
ax.axis("off")
plt.tight_layout()
plt.savefig(fig4_path, dpi=200)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=fig4_path,
    caption="Geographically weighted regression (GWR) map of the spatially varying association between hazardous-waste proximity (ln distance) and asthma prevalence.",
    role="final",
    objective_key="objective_1",
    step_index=4
)

# 5) GWR local R2 map
fig5_path = os.path.join(fig_dir, "map_gwr_localR2.png")
fig, ax = plt.subplots(1, 1, figsize=(9, 8))
gdf_gwr_out.plot(column="gwr_localR2", ax=ax, legend=True, cmap="plasma", missing_kwds={"color": "lightgrey", "label": "Missing"})
ax.set_title("GWR local R² (model explanatory power varies across space)")
ax.axis("off")
plt.tight_layout()
plt.savefig(fig5_path, dpi=200)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=fig5_path,
    caption="Local R² from the GWR model, highlighting where hazardous-waste proximity and covariates better explain asthma prevalence.",
    role="promoted",
    objective_key="objective_1",
    step_index=5
)

# 6) Scatter plot: asthma vs ln distance, colored by poverty tercile
fig6_path = os.path.join(fig_dir, "scatter_asthma_lnDist_by_poverty.png")
tmp = gdf.merge(model_df[["GEOID"]], on="GEOID", how="inner").copy()
tmp["Asthma_prev"] = safe_to_numeric(tmp["Asthma_prev"])
tmp["ln_dist_to_hw_km"] = safe_to_numeric(tmp["ln_dist_to_hw_km"])
tmp["ratio_poverty"] = safe_to_numeric(tmp["ratio_poverty"])
tmp["poverty_tercile"] = qcut_3(tmp["ratio_poverty"])
tmp = tmp.dropna(subset=["Asthma_prev", "ln_dist_to_hw_km", "poverty_tercile"]).copy()

fig, ax = plt.subplots(1, 1, figsize=(8, 6))
for lvl, sub in tmp.groupby("poverty_tercile"):
    ax.scatter(sub["ln_dist_to_hw_km"], sub["Asthma_prev"], s=8, alpha=0.4, label=str(lvl))
ax.set_xlabel("ln(1 + distance to nearest hazardous waste facility) [km]")
ax.set_ylabel("Asthma prevalence")
ax.set_title("Asthma prevalence vs hazardous-waste proximity, stratified by poverty terciles")
ax.legend(title="Poverty tercile", frameon=False)
plt.tight_layout()
plt.savefig(fig6_path, dpi=200)
plt.close()
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=fig6_path,
    caption="Scatter of tract asthma prevalence versus hazardous-waste proximity (ln distance), stratified by poverty terciles to illustrate contextual variation.",
    role="promoted",
    objective_key="objective_1",
    step_index=6
)