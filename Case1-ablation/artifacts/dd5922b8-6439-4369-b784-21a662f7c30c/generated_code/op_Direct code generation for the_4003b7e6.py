import os
import warnings

import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor
from scipy.stats import pearsonr

from libpysal.weights import Queen, KNN
from esda.moran import Moran
from spreg import OLS as SP_OLS, ML_Lag, ML_Error

# Manuscript helpers (pre-imported by the system)
# record_figure, record_table, record_data_to_viz

warnings.filterwarnings("ignore", category=UserWarning)

# -----------------------------
# Paths
# -----------------------------
COUNTIES_GPKG = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\california_counties_2019.gpkg"
URBAN_RURAL_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\California_UrbanRural_Classification_2019.csv"
GINI_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\California_Counties_Gini_2019.csv"
PM25_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\PM2.5_Annual_California_2019_1.csv"

OUTPUT_NODE_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\Outputs\dd5922b8-6439-4369-b784-21a662f7c30c\analysis_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

fig_dir = os.path.join(OUTPUT_DIR, "figures")
os.makedirs(fig_dir, exist_ok=True)

# -----------------------------
# STEP 1: Inspect inputs (MANDATORY)
# - In this automated environment, get_columns was already called externally.
# - Do not call preview/check unless needed.
# -----------------------------

# -----------------------------
# STEP 1b: Resolve issues (as code: robust joins & typing)
# -----------------------------
# Join key strategy:
# - Counties geometry: GEOID (string)
# - Gini: state_fips + county_fips -> 5-digit FIPS
# - Urban-rural: FIPSTXT (string) likely 5-digit FIPS
# - PM2.5: state_code + county_code -> 5-digit FIPS (from AQS)
#
# Dtype harmonization: cast all FIPS pieces to zero-padded strings.

def zfill_str(x, width):
    if pd.isna(x):
        return np.nan
    s = str(x).strip()
    # handle floats like "6.0"
    if s.endswith(".0"):
        s = s[:-2]
    # remove any decimals/commas
    s = "".join(ch for ch in s if ch.isdigit())
    if s == "":
        return np.nan
    return s.zfill(width)


# -----------------------------
# STEP 3: Data prep, analysis, viz
# -----------------------------

# 1) Load counties geometry
counties = gpd.read_file(COUNTIES_GPKG)

# Validate geometry
counties = counties[counties.geometry.notnull()].copy()
counties = counties[counties.geometry.is_valid & ~counties.geometry.is_empty].copy()
counties = counties.reset_index(drop=True)

# Ensure GEOID is 5-digit string
counties["GEOID"] = counties["GEOID"].astype(str).apply(lambda v: zfill_str(v, 5))

# Filter to California using STATEFP == '06' where available
counties["STATEFP"] = counties["STATEFP"].astype(str).apply(lambda v: zfill_str(v, 2))
counties_ca = counties[counties["STATEFP"] == "06"].copy().reset_index(drop=True)

if len(counties_ca) == 0:
    raise ValueError("No counties retained after filtering STATEFP == '06'. Check input county layer.")

# 2) Load Gini
gini = pd.read_csv(GINI_CSV, dtype=str)
# Build 5-digit FIPS
gini["state_fips"] = gini["state_fips"].apply(lambda v: zfill_str(v, 2))
gini["county_fips"] = gini["county_fips"].apply(lambda v: zfill_str(v, 3))
gini["fips"] = gini["state_fips"] + gini["county_fips"]

# Filter to 2019 and California
gini["year"] = gini["year"].astype(str)
gini_ca_2019 = gini[(gini["year"] == "2019") & (gini["state_fips"] == "06")].copy()

# Numeric Gini
gini_col = "B19083_001E:Gini Index"
gini_ca_2019[gini_col] = pd.to_numeric(gini_ca_2019[gini_col], errors="coerce")

# Deduplicate on fips (keep first non-null if multiple sources)
gini_ca_2019 = gini_ca_2019.sort_values(by=["fips"]).copy()
gini_ca_2019 = gini_ca_2019.drop_duplicates(subset=["fips"], keep="first").copy()

# 3) Load Urban-Rural classification
ur = pd.read_csv(URBAN_RURAL_CSV, dtype=str)
ur["FIPSTXT"] = ur["FIPSTXT"].apply(lambda v: zfill_str(v, 5))
# Filter to CA counties only by prefix '06'
ur_ca = ur[ur["FIPSTXT"].str.startswith("06", na=False)].copy()

# We'll use Metro2013 as primary urban-rural indicator; if missing, fallback to Nonmetro2013
# Create canonical 'urban_rural' label:
def make_urban_rural(row):
    metro = row.get("Metro2013", None)
    nonmetro = row.get("Nonmetro2013", None)
    metro_s = str(metro).strip() if metro is not None else ""
    nonmetro_s = str(nonmetro).strip() if nonmetro is not None else ""
    if metro_s.lower() in ["yes", "y", "1", "true", "t"]:
        return "Metro"
    if nonmetro_s.lower() in ["yes", "y", "1", "true", "t"]:
        return "Nonmetro"
    # If codes exist but not yes/no, use presence heuristic
    if metro_s != "" and metro_s.lower() not in ["nan", "none"]:
        return "Metro"
    if nonmetro_s != "" and nonmetro_s.lower() not in ["nan", "none"]:
        return "Nonmetro"
    return np.nan

ur_ca["urban_rural"] = ur_ca.apply(make_urban_rural, axis=1)

# 4) Load PM2.5 annual (AQS-style) and aggregate to county
pm = pd.read_csv(PM25_CSV, dtype=str)

pm["year"] = pm["year"].astype(str)
pm_2019 = pm[pm["year"] == "2019"].copy()

# Build 5-digit FIPS from state_code + county_code
pm_2019["state_code"] = pm_2019["state_code"].apply(lambda v: zfill_str(v, 2))
pm_2019["county_code"] = pm_2019["county_code"].apply(lambda v: zfill_str(v, 3))
pm_2019["fips"] = pm_2019["state_code"] + pm_2019["county_code"]

# Restrict to California
pm_2019_ca = pm_2019[pm_2019["state_code"] == "06"].copy()

# Numeric arithmetic_mean
pm_2019_ca["arithmetic_mean"] = pd.to_numeric(pm_2019_ca["arithmetic_mean"], errors="coerce")

# County-level PM2.5: average across monitors within county
pm25_county = (
    pm_2019_ca.dropna(subset=["fips", "arithmetic_mean"])
    .groupby("fips", as_index=False)
    .agg(
        pm25_mean=("arithmetic_mean", "mean"),
        pm25_median=("arithmetic_mean", "median"),
        pm25_n_sites=("arithmetic_mean", "size"),
    )
)

# 5) Merge all to counties GeoDataFrame
gdf = counties_ca.copy()
gdf = gdf.merge(pm25_county, how="left", left_on="GEOID", right_on="fips", validate="1:1")
gdf = gdf.drop(columns=["fips"], errors="ignore")

gdf = gdf.merge(
    gini_ca_2019[["fips", gini_col]],
    how="left",
    left_on="GEOID",
    right_on="fips",
    validate="1:1",
)
gdf = gdf.drop(columns=["fips"], errors="ignore")

gdf = gdf.merge(
    ur_ca[["FIPSTXT", "urban_rural", "RuralUrbanContinuumCode2013", "UrbanInfluenceCode2013"]],
    how="left",
    left_on="GEOID",
    right_on="FIPSTXT",
    validate="1:1",
)
gdf = gdf.drop(columns=["FIPSTXT"], errors="ignore")

# Ensure numeric types for analyses
gdf["pm25_mean"] = pd.to_numeric(gdf["pm25_mean"], errors="coerce")
gdf["pm25_median"] = pd.to_numeric(gdf["pm25_median"], errors="coerce")
gdf["pm25_n_sites"] = pd.to_numeric(gdf["pm25_n_sites"], errors="coerce")
gdf[gini_col] = pd.to_numeric(gdf[gini_col], errors="coerce")

# Derive additional inequality measures for PM2.5 exposure across counties:
# - county_zscore: standardized PM2.5 (relative inequality)
# - county_rank: percentile rank
gdf["pm25_z"] = (gdf["pm25_mean"] - gdf["pm25_mean"].mean(skipna=True)) / gdf["pm25_mean"].std(skipna=True)
gdf["pm25_pct_rank"] = gdf["pm25_mean"].rank(pct=True)

# -----------------------------
# Descriptive stats & inequality summary
# -----------------------------
def gini_coefficient(x):
    # Gini for a vector of non-negative values (here PM2.5; can handle positive)
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if x.size == 0:
        return np.nan
    # shift if negatives (not expected for PM2.5)
    minx = x.min()
    if minx < 0:
        x = x - minx
    # if all zeros:
    if np.allclose(x, 0):
        return 0.0
    x = np.sort(x)
    n = x.size
    cumx = np.cumsum(x)
    return (n + 1 - 2 * np.sum(cumx) / cumx[-1]) / n

overall_stats = {
    "n_counties_total": int(len(gdf)),
    "n_with_pm25": int(gdf["pm25_mean"].notna().sum()),
    "n_with_gini": int(gdf[gini_col].notna().sum()),
    "n_with_urban_rural": int(gdf["urban_rural"].notna().sum()),
    "pm25_mean_statewide": float(gdf["pm25_mean"].mean(skipna=True)),
    "pm25_sd_statewide": float(gdf["pm25_mean"].std(skipna=True)),
    "pm25_gini_across_counties": float(gini_coefficient(gdf["pm25_mean"].values)),
    "gini_index_mean": float(gdf[gini_col].mean(skipna=True)),
    "gini_index_sd": float(gdf[gini_col].std(skipna=True)),
}

# Grouped descriptive stats by urban-rural
grp = (
    gdf.dropna(subset=["urban_rural"])
    .groupby("urban_rural", as_index=False)
    .agg(
        n_counties=("GEOID", "size"),
        pm25_mean=("pm25_mean", "mean"),
        pm25_sd=("pm25_mean", "std"),
        pm25_gini_across_counties=("pm25_mean", lambda s: gini_coefficient(s.values)),
        gini_index_mean=(gini_col, "mean"),
        gini_index_sd=(gini_col, "std"),
    )
)

desc_table_path = os.path.join(tables_dir, "descriptive_stats_by_urban_rural.csv")
grp.to_csv(desc_table_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=desc_table_path,
    caption="Descriptive statistics of county-level PM2.5 exposure and income inequality (Gini index) by metro vs nonmetro classification (2019).",
    role="promoted",
    columns=list(grp.columns),
)

# -----------------------------
# Correlation analyses (overall and stratified)
# -----------------------------
analysis_df = gdf.dropna(subset=["pm25_mean", gini_col]).copy()
analysis_df = analysis_df.reset_index(drop=True)

def pearson_stats(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    mask = np.isfinite(x) & np.isfinite(y)
    if mask.sum() < 3:
        return {"r": np.nan, "p_value": np.nan, "n": int(mask.sum())}
    r, p = pearsonr(x[mask], y[mask])
    return {"r": float(r), "p_value": float(p), "n": int(mask.sum())}

corr_overall = pearson_stats(analysis_df[gini_col], analysis_df["pm25_mean"])

corr_by_ur = []
for ur_class, sub in gdf.groupby("urban_rural", dropna=True):
    sub2 = sub.dropna(subset=["pm25_mean", gini_col]).copy()
    st = pearson_stats(sub2[gini_col], sub2["pm25_mean"])
    corr_by_ur.append({"urban_rural": ur_class, **st})
corr_by_ur_df = pd.DataFrame(corr_by_ur)

corr_table_path = os.path.join(tables_dir, "pearson_correlation_pm25_vs_gini.csv")
pd.concat(
    [
        pd.DataFrame([{"urban_rural": "Overall", **corr_overall}]),
        corr_by_ur_df,
    ],
    ignore_index=True,
).to_csv(corr_table_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=corr_table_path,
    caption="Pearson correlation between county PM2.5 exposure and income inequality (Gini index), overall and stratified by urban–rural classification (2019).",
    role="promoted",
    columns=["urban_rural", "r", "p_value", "n"],
)

# -----------------------------
# OLS with interaction: PM2.5 ~ Gini + UrbanRural + Gini*UrbanRural
# -----------------------------
model_df = gdf.dropna(subset=["pm25_mean", gini_col, "urban_rural"]).copy().reset_index(drop=True)

# Create binary indicator for Metro (reference = Nonmetro if present)
# If only one class exists, interaction model is not possible.
classes = sorted(model_df["urban_rural"].dropna().unique().tolist())
if len(classes) < 2:
    raise ValueError(f"Urban-rural classification has <2 classes in usable data: {classes}")

# Choose 'Nonmetro' as reference if present, else first alphabetically.
ref = "Nonmetro" if "Nonmetro" in classes else classes[0]
model_df["is_metro"] = (model_df["urban_rural"] != ref).astype(int)

# Numeric casting
model_df["y_pm25"] = pd.to_numeric(model_df["pm25_mean"], errors="coerce")
model_df["x_gini"] = pd.to_numeric(model_df[gini_col], errors="coerce")
model_df["x_interaction"] = model_df["x_gini"] * model_df["is_metro"]

model_df = model_df.dropna(subset=["y_pm25", "x_gini", "is_metro", "x_interaction"]).copy().reset_index(drop=True)

y = model_df["y_pm25"].values.astype(float)
X = model_df[["x_gini", "is_metro", "x_interaction"]].values.astype(float)
X_sm = sm.add_constant(X)

ols = sm.OLS(y, X_sm).fit()

coef_df = pd.DataFrame({
    "variable": ["const", "gini", f"is_metro(1 if !={ref})", "gini_x_is_metro"],
    "beta": ols.params,
    "std_err": ols.bse,
    "t": ols.tvalues,
    "p_value": ols.pvalues,
    "ci_low": ols.conf_int()[:, 0],
    "ci_high": ols.conf_int()[:, 1],
})
ols_coef_path = os.path.join(tables_dir, "ols_coefficients_pm25_gini_urbanrural_interaction.csv")
coef_df.to_csv(ols_coef_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=ols_coef_path,
    caption="OLS regression of county PM2.5 exposure on income inequality (Gini) with an urban–rural interaction term (2019).",
    role="promoted",
    columns=list(coef_df.columns),
)

# VIF
vif_df = pd.DataFrame({
    "variable": ["x_gini", "is_metro", "x_interaction"],
    "VIF": [variance_inflation_factor(X_sm, i + 1) for i in range(3)],
})
vif_path = os.path.join(OUTPUT_DIR, "ols_vif_pm25_gini_urbanrural_interaction.csv")
vif_df.to_csv(vif_path, index=False)

# Fit stats
fit_stats = pd.DataFrame([{
    "n": int(ols.nobs),
    "k_predictors": 3,
    "R2": float(ols.rsquared),
    "adj_R2": float(ols.rsquared_adj),
    "AIC": float(ols.aic),
    "BIC": float(ols.bic),
    "RMSE": float(np.sqrt(np.mean(ols.resid ** 2))),
    "urban_rural_reference": ref,
}])
fit_stats_path = os.path.join(tables_dir, "ols_fit_stats_pm25_gini_urbanrural_interaction.csv")
fit_stats.to_csv(fit_stats_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=fit_stats_path,
    caption="OLS model fit statistics for PM2.5 ~ Gini + urban–rural + interaction (2019).",
    role="promoted",
    columns=list(fit_stats.columns),
)

# Attach residuals back to geometry for spatial diagnostics
gdf_resid = gdf.merge(
    model_df[["GEOID"]].assign(ols_resid=ols.resid, ols_fitted=ols.fittedvalues),
    on="GEOID",
    how="left",
    validate="1:1",
)

# -----------------------------
# Spatial diagnostics: Global Moran's I for PM2.5 and OLS residuals
# -----------------------------
def build_weights(clean_gdf):
    w = Queen.from_dataframe(clean_gdf)
    if w.islands:
        w = KNN.from_dataframe(clean_gdf, k=5)
    w.transform = "r"
    return w

# Moran's I for PM2.5
g_mi_pm25 = gdf.dropna(subset=["pm25_mean"]).copy().reset_index(drop=True)
w_pm25 = build_weights(g_mi_pm25)
mi_pm25 = Moran(g_mi_pm25["pm25_mean"].values.astype(float), w_pm25, permutations=999)

# Moran's I for OLS residuals
g_mi_resid = gdf_resid.dropna(subset=["ols_resid"]).copy().reset_index(drop=True)
w_resid = build_weights(g_mi_resid)
mi_resid = Moran(g_mi_resid["ols_resid"].values.astype(float), w_resid, permutations=999)

moran_df = pd.DataFrame([
    {
        "variable": "pm25_mean",
        "morans_I": float(mi_pm25.I),
        "expected_I": float(mi_pm25.EI),
        "z_sim": float(mi_pm25.z_sim),
        "p_sim": float(mi_pm25.p_sim),
        "n": int(len(g_mi_pm25)),
        "weights": "Queen (fallback KNN k=5 if islands), row-standardized",
    },
    {
        "variable": "ols_residuals",
        "morans_I": float(mi_resid.I),
        "expected_I": float(mi_resid.EI),
        "z_sim": float(mi_resid.z_sim),
        "p_sim": float(mi_resid.p_sim),
        "n": int(len(g_mi_resid)),
        "weights": "Queen (fallback KNN k=5 if islands), row-standardized",
    },
])
moran_path = os.path.join(tables_dir, "global_moransI_pm25_and_ols_residuals.csv")
moran_df.to_csv(moran_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=moran_path,
    caption="Global Moran’s I for county PM2.5 exposure and OLS residuals (2019), testing spatial clustering and residual spatial autocorrelation.",
    role="promoted",
    columns=list(moran_df.columns),
)

# -----------------------------
# Spatial regression (Lag/Error) with LM selection using spreg OLS diagnostics
# Outcome: pm25_mean; Predictors: gini, is_metro, interaction
# -----------------------------
sp_df = model_df.merge(gdf[["GEOID", "geometry"]], on="GEOID", how="left", validate="1:1")
sp_gdf = gpd.GeoDataFrame(sp_df, geometry="geometry", crs=gdf.crs)
sp_gdf = sp_gdf[sp_gdf.geometry.is_valid & ~sp_gdf.geometry.is_empty].copy().reset_index(drop=True)

# Build weights on analysis subset
w_sp = build_weights(sp_gdf)

y_sp = sp_gdf[["y_pm25"]].values.astype(float)  # (n,1)
X_sp = sp_gdf[["x_gini", "is_metro", "x_interaction"]].values.astype(float)  # no intercept

sp_ols = SP_OLS(
    y_sp, X_sp, w=w_sp, spat_diag=True, moran=True,
    name_y="pm25_mean",
    name_x=["gini", f"is_metro(1 if !={ref})", "gini_x_is_metro"]
)

lm_lag = sp_ols.lm_lag
lm_err = sp_ols.lm_error
rlm_lag = sp_ols.rlm_lag
rlm_err = sp_ols.rlm_error

def pick_model(lm_lag, lm_error, rlm_lag, rlm_error, alpha=0.05):
    lag_sig = lm_lag[1] < alpha
    err_sig = lm_error[1] < alpha
    if lag_sig and not err_sig:
        return "lag"
    if err_sig and not lag_sig:
        return "error"
    if lag_sig and err_sig:
        # choose based on smaller robust p-value
        return "lag" if rlm_lag[1] < rlm_error[1] else "error"
    return "ols"

choice = pick_model(lm_lag, lm_err, rlm_lag, rlm_err)

if choice == "lag":
    sp_model = ML_Lag(
        y_sp, X_sp, w=w_sp,
        name_y="pm25_mean",
        name_x=["gini", f"is_metro(1 if !={ref})", "gini_x_is_metro"]
    )
    spatial_param_name = "rho"
    spatial_param_value = float(sp_model.rho)
elif choice == "error":
    sp_model = ML_Error(
        y_sp, X_sp, w=w_sp,
        name_y="pm25_mean",
        name_x=["gini", f"is_metro(1 if !={ref})", "gini_x_is_metro"]
    )
    spatial_param_name = "lambda"
    spatial_param_value = float(sp_model.lam)
else:
    sp_model = sp_ols
    spatial_param_name = "n/a"
    spatial_param_value = np.nan

sp_resid = np.asarray(sp_model.u).flatten()
mi_sp_resid = Moran(sp_resid, w_sp, permutations=999)

# Save spatial regression coefficient table
# For spreg ML models: betas include constant; for SP_OLS too.
betas = np.asarray(sp_model.betas).flatten()
std_err = np.asarray(sp_model.std_err).flatten()

# z_stat: list of tuples (z, p)
if hasattr(sp_model, "z_stat"):
    z_list = sp_model.z_stat
    z_vals = np.asarray([t[0] for t in z_list], dtype=float)
    p_vals = np.asarray([t[1] for t in z_list], dtype=float)
else:
    # fallback: NaNs (should not happen here)
    z_vals = np.full_like(betas, np.nan, dtype=float)
    p_vals = np.full_like(betas, np.nan, dtype=float)

sp_coef_vars = ["CONSTANT", "gini", f"is_metro(1 if !={ref})", "gini_x_is_metro"]
sp_coef_df = pd.DataFrame({
    "model_choice": choice,
    "variable": sp_coef_vars[: len(betas)],
    "beta": betas[: len(sp_coef_vars)],
    "std_err": std_err[: len(sp_coef_vars)],
    "z": z_vals[: len(sp_coef_vars)],
    "p_value": p_vals[: len(sp_coef_vars)],
})
sp_coef_path = os.path.join(tables_dir, "spatial_regression_coefficients_pm25_gini_urbanrural_interaction.csv")
sp_coef_df.to_csv(sp_coef_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=sp_coef_path,
    caption="Spatial regression coefficients (selected by LM diagnostics) for PM2.5 ~ Gini + urban–rural + interaction (2019).",
    role="promoted",
    columns=list(sp_coef_df.columns),
)

sp_diag_df = pd.DataFrame([{
    "model_choice": choice,
    "lm_lag_stat": float(lm_lag[0]), "lm_lag_p": float(lm_lag[1]),
    "lm_error_stat": float(lm_err[0]), "lm_error_p": float(lm_err[1]),
    "robust_lm_lag_stat": float(rlm_lag[0]), "robust_lm_lag_p": float(rlm_lag[1]),
    "robust_lm_error_stat": float(rlm_err[0]), "robust_lm_error_p": float(rlm_err[1]),
    "spatial_param": spatial_param_name,
    "spatial_param_value": float(spatial_param_value) if np.isfinite(spatial_param_value) else np.nan,
    "residual_morans_I": float(mi_sp_resid.I),
    "residual_morans_p": float(mi_sp_resid.p_sim),
    "n": int(len(sp_gdf)),
}])
sp_diag_path = os.path.join(tables_dir, "spatial_regression_diagnostics_and_residual_moransI.csv")
sp_diag_df.to_csv(sp_diag_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=sp_diag_path,
    caption="LM diagnostics for choosing spatial lag vs spatial error model, plus residual Moran’s I for the selected spatial regression (2019).",
    role="promoted",
    columns=list(sp_diag_df.columns),
)

# -----------------------------
# Visualizations
# -----------------------------
# A) Choropleths: PM2.5, Gini, Urban-Rural
def choropleth(gdf_in, col, title, cmap, out_path, categorical=False):
    fig, ax = plt.subplots(1, 1, figsize=(9, 9))
    ax.set_axis_off()
    if categorical:
        gdf_in.plot(column=col, ax=ax, categorical=True, legend=True)
    else:
        gdf_in.plot(column=col, ax=ax, cmap=cmap, legend=True, missing_kwds={"color": "lightgrey", "label": "Missing"})
    ax.set_title(title, fontsize=12)
    plt.tight_layout()
    plt.savefig(out_path, dpi=220)
    plt.close(fig)

pm25_map_path = os.path.join(fig_dir, "choropleth_pm25_mean_2019.png")
choropleth(
    gdf, "pm25_mean",
    "County-level PM2.5 annual arithmetic mean (2019) — California",
    "OrRd",
    pm25_map_path,
    categorical=False,
)
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=pm25_map_path,
    caption="Choropleth of county-level annual PM2.5 mean concentrations (2019) across California counties.",
    role="final",
    objective_key="objective_1",
    step_index=1
)

gini_map_path = os.path.join(fig_dir, "choropleth_gini_index_2019.png")
choropleth(
    gdf, gini_col,
    "County-level income inequality (Gini index, 2019) — California",
    "PuBuGn",
    gini_map_path,
    categorical=False,
)
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=gini_map_path,
    caption="Choropleth of county-level income inequality (Gini index, 2019) across California counties.",
    role="final",
    objective_key="objective_1",
    step_index=2
)

ur_map_path = os.path.join(fig_dir, "choropleth_urban_rural_classification.png")
choropleth(
    gdf.dropna(subset=["urban_rural"]), "urban_rural",
    "Urban–rural classification (Metro vs Nonmetro; source: 2013 codes) — CA counties",
    None,
    ur_map_path,
    categorical=True,
)
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=ur_map_path,
    caption="County urban–rural classification (metro vs nonmetro) used for stratified analyses.",
    role="promoted",
    objective_key="objective_1",
    step_index=3
)

# B) Scatter with regression lines by class (simple OLS per class for visualization)
scatter_path = os.path.join(fig_dir, "scatter_pm25_vs_gini_by_urban_rural.png")
fig, ax = plt.subplots(1, 1, figsize=(8.5, 6.5))

plot_df = gdf.dropna(subset=["pm25_mean", gini_col, "urban_rural"]).copy()
for ur_class, sub in plot_df.groupby("urban_rural"):
    ax.scatter(sub[gini_col].values.astype(float), sub["pm25_mean"].values.astype(float), s=28, alpha=0.85, label=f"{ur_class} (n={len(sub)})")
    # line
    xs = sub[gini_col].values.astype(float)
    ys = sub["pm25_mean"].values.astype(float)
    if len(sub) >= 3 and np.isfinite(xs).all() and np.isfinite(ys).all():
        b1, b0 = np.polyfit(xs, ys, 1)  # slope, intercept
        xgrid = np.linspace(xs.min(), xs.max(), 50)
        ygrid = b1 * xgrid + b0
        ax.plot(xgrid, ygrid, linewidth=2)

ax.set_xlabel("Gini index (income inequality), 2019")
ax.set_ylabel("PM2.5 annual mean (arithmetic mean), 2019")
ax.set_title("PM2.5 exposure vs income inequality across CA counties (2019), stratified by urban–rural class")
ax.legend(frameon=True)
ax.grid(True, linestyle="--", alpha=0.35)

plt.tight_layout()
plt.savefig(scatter_path, dpi=220)
plt.close(fig)

record_figure(
    output_dir=OUTPUT_DIR,
    file_path=scatter_path,
    caption="Scatterplot of county PM2.5 exposure versus income inequality (Gini) with class-specific fitted lines for metro vs nonmetro counties (2019).",
    role="final",
    objective_key="objective_1",
    step_index=4
)

# -----------------------------
# Key quantitative results output (primary output node)
# -----------------------------
# Compile a compact results table answering:
# - overall association (correlation)
# - stratified association (correlation)
# - interaction OLS coefficient (difference in slopes)
# - spatial clustering (Moran’s I)
# - spatial model selection (LM + chosen model; residual Moran’s I)
results_rows = []

# Descriptive
for k, v in overall_stats.items():
    results_rows.append({"result_group": "descriptive", "metric": k, "value": v})

# Correlations
results_rows.append({"result_group": "correlation", "metric": "overall_pearson_r(pm25_vs_gini)", "value": corr_overall["r"]})
results_rows.append({"result_group": "correlation", "metric": "overall_pearson_p(pm25_vs_gini)", "value": corr_overall["p_value"]})
results_rows.append({"result_group": "correlation", "metric": "overall_n(pm25_vs_gini)", "value": corr_overall["n"]})
for _, r in corr_by_ur_df.iterrows():
    results_rows.append({"result_group": "correlation_by_urban_rural", "metric": f"{r['urban_rural']}_pearson_r", "value": r["r"]})
    results_rows.append({"result_group": "correlation_by_urban_rural", "metric": f"{r['urban_rural']}_pearson_p", "value": r["p_value"]})
    results_rows.append({"result_group": "correlation_by_urban_rural", "metric": f"{r['urban_rural']}_n", "value": r["n"]})

# OLS interaction key terms
# Note: variables are ordered: const, gini, is_metro, gini_x_is_metro
ols_params = ols.params
ols_pvals = ols.pvalues
results_rows += [
    {"result_group": "ols_interaction", "metric": "beta_gini", "value": float(ols_params[1])},
    {"result_group": "ols_interaction", "metric": "p_gini", "value": float(ols_pvals[1])},
    {"result_group": "ols_interaction", "metric": "beta_gini_x_is_metro", "value": float(ols_params[3])},
    {"result_group": "ols_interaction", "metric": "p_gini_x_is_metro", "value": float(ols_pvals[3])},
    {"result_group": "ols_interaction", "metric": "R2", "value": float(ols.rsquared)},
    {"result_group": "ols_interaction", "metric": "adj_R2", "value": float(ols.rsquared_adj)},
    {"result_group": "ols_interaction", "metric": "n", "value": int(ols.nobs)},
]

# Moran's I
results_rows += [
    {"result_group": "spatial_autocorrelation", "metric": "morans_I_pm25_mean", "value": float(mi_pm25.I)},
    {"result_group": "spatial_autocorrelation", "metric": "p_sim_pm25_mean", "value": float(mi_pm25.p_sim)},
    {"result_group": "spatial_autocorrelation", "metric": "morans_I_ols_residuals", "value": float(mi_resid.I)},
    {"result_group": "spatial_autocorrelation", "metric": "p_sim_ols_residuals", "value": float(mi_resid.p_sim)},
]

# Spatial regression selection/diagnostics
results_rows += [
    {"result_group": "spatial_regression", "metric": "lm_lag_p", "value": float(lm_lag[1])},
    {"result_group": "spatial_regression", "metric": "lm_error_p", "value": float(lm_err[1])},
    {"result_group": "spatial_regression", "metric": "robust_lm_lag_p", "value": float(rlm_lag[1])},
    {"result_group": "spatial_regression", "metric": "robust_lm_error_p", "value": float(rlm_err[1])},
    {"result_group": "spatial_regression", "metric": "chosen_model", "value": choice},
    {"result_group": "spatial_regression", "metric": "spatial_param_name", "value": spatial_param_name},
    {"result_group": "spatial_regression", "metric": "spatial_param_value", "value": float(spatial_param_value) if np.isfinite(spatial_param_value) else np.nan},
    {"result_group": "spatial_regression", "metric": "residual_morans_I_selected_sp_model", "value": float(mi_sp_resid.I)},
    {"result_group": "spatial_regression", "metric": "residual_morans_p_selected_sp_model", "value": float(mi_sp_resid.p_sim)},
]

results_df = pd.DataFrame(results_rows)

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
results_df.to_csv(OUTPUT_NODE_PATH, index=False)

# Also save the final merged analysis GeoDataFrame for optional downstream mapping (intermediate)
analysis_gpkg_path = os.path.join(OUTPUT_DIR, "county_analysis_merged_2019.gpkg")
gdf_out = gdf.copy()
gdf_out.to_file(analysis_gpkg_path, driver="GPKG")

# (Optional) register as data-to-viz for auto-choropleth if needed (intermediate, not required)
# record_data_to_viz(
#     output_dir=OUTPUT_DIR,
#     file_path=analysis_gpkg_path,
#     caption="Merged 2019 California county dataset with PM2.5 exposure, Gini index, and urban–rural classification.",
#     viz_hint={"type": "choropleth", "column": "pm25_mean", "cmap": "OrRd"},
#     role="intermediate",
# )