import os
import warnings

import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor

from libpysal.weights import Queen
from esda.moran import Moran

# Pre-imported helpers (provided by the system)
# record_figure, record_table, record_data_to_viz

warnings.filterwarnings("ignore", category=UserWarning)

# ------------------------------------------------------------------------------
# Paths (EXACT)
# ------------------------------------------------------------------------------
VISITOR_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\bb8805e4-6c34-49e8-aa70-b49981b7c56e\SC_Visitor_POI.csv"
DEPR_PATH    = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\bb8805e4-6c34-49e8-aa70-b49981b7c56e\SC_PLACES_depression.csv"
COUNTY_PATH  = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\bb8805e4-6c34-49e8-aa70-b49981b7c56e\SC_counties.gpkg"
ACS_PATH     = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\bb8805e4-6c34-49e8-aa70-b49981b7c56e\SC_ACS_data.csv"

OUTPUT_NODE_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\Outputs\bb8805e4-6c34-49e8-aa70-b49981b7c56e\analysis_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

# ------------------------------------------------------------------------------
# STEP 3: Script helpers
# ------------------------------------------------------------------------------
def _to_numeric_inplace(df: pd.DataFrame, cols):
    for c in cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df

def zscore(s: pd.Series) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce")
    mu = np.nanmean(s.values)
    sd = np.nanstd(s.values, ddof=0)
    if sd == 0 or np.isnan(sd):
        return (s * 0) * np.nan
    return (s - mu) / sd

def ols_fit(df: pd.DataFrame, y_col: str, x_cols: list, robust_hc1: bool = True):
    work = df[[y_col] + x_cols].copy()
    _to_numeric_inplace(work, [y_col] + x_cols)
    work = work.dropna(subset=[y_col] + x_cols).reset_index(drop=True)

    y = work[y_col].values
    X = sm.add_constant(work[x_cols].values, has_constant="add")
    model = sm.OLS(y, X).fit()

    if robust_hc1:
        model_rob = model.get_robustcov_results(cov_type="HC1")
        return model, model_rob, work
    return model, model, work

def coef_table(model, x_cols: list):
    # model might be robustcov results; it still has params/bse/tvalues/pvalues
    ci = model.conf_int()
    return pd.DataFrame({
        "variable": ["const"] + x_cols,
        "beta": model.params,
        "std_err": model.bse,
        "t": model.tvalues,
        "p_value": model.pvalues,
        "ci_low": ci[:, 0],
        "ci_high": ci[:, 1],
    })

def fit_stats(model, k_predictors: int, label: str):
    rmse = float(np.sqrt(np.mean(model.resid ** 2)))
    return {
        "model": label,
        "n": int(model.nobs),
        "k": int(k_predictors),
        "R2": float(model.rsquared),
        "adj_R2": float(model.rsquared_adj),
        "AIC": float(model.aic),
        "BIC": float(model.bic),
        "F": float(model.fvalue) if model.fvalue is not None else np.nan,
        "F_pvalue": float(model.f_pvalue) if model.f_pvalue is not None else np.nan,
        "RMSE": rmse,
    }

def vif_table(df: pd.DataFrame, x_cols: list):
    work = df[x_cols].copy()
    _to_numeric_inplace(work, x_cols)
    work = work.dropna().reset_index(drop=True)
    X = sm.add_constant(work.values, has_constant="add")
    # exclude constant from VIF report
    return pd.DataFrame({
        "variable": x_cols,
        "VIF": [variance_inflation_factor(X, i + 1) for i in range(len(x_cols))]
    })

def mediation_sobel(a, sa, b, sb):
    # Sobel test for indirect effect a*b
    indirect = a * b
    se_ind = np.sqrt((b**2) * (sa**2) + (a**2) * (sb**2))
    z = indirect / se_ind if se_ind not in [0, np.nan] else np.nan
    # normal approx p-value (two-sided)
    from math import erf, sqrt
    if np.isnan(z):
        p = np.nan
    else:
        cdf = 0.5 * (1 + erf(abs(z) / sqrt(2)))
        p = 2 * (1 - cdf)
    return indirect, se_ind, z, p

# ------------------------------------------------------------------------------
# Load data
# ------------------------------------------------------------------------------
visitor = pd.read_csv(VISITOR_PATH, dtype={"GEOID": "string"})
depr    = pd.read_csv(DEPR_PATH, dtype={"GEOID": "string"})
acs     = pd.read_csv(ACS_PATH, dtype={"GEOID": "string"})
counties = gpd.read_file(COUNTY_PATH)

# Validate / clean geometries
counties = counties[counties.geometry.notnull()].copy()
counties = counties[counties.geometry.is_valid & ~counties.geometry.is_empty].copy()

# Ensure GEOID as string everywhere
for df in (visitor, depr, acs):
    df["GEOID"] = df["GEOID"].astype("string")
counties["GEOID"] = counties["GEOID"].astype("string")

# ------------------------------------------------------------------------------
# Harmonize / numeric casting for analysis columns
# ------------------------------------------------------------------------------
visitor_cols = [
    "Full_Service_Restaurant", "Sport_facilities", "Parks", "Fastfood_Restaurant",
    "Convenience", "Supermarket", "Warehouse", "Fruit", "TobaccoStore", "DrinkingPlaces"
]
acs_cols = [
    "percent_>=18", "percent_Married", "percent_White", "percent_Black", "percent_Asian",
    "percent_Hispanic", "percent_Other_Race", "percent_Male", "percent_Female",
    "percent_>=HighSch", "percent_Poverty", "percent_Unemployed", "percent_Uninsured",
    "Med_income"
]

_to_numeric_inplace(visitor, visitor_cols)
_to_numeric_inplace(depr, ["Depression_prev"])
_to_numeric_inplace(acs, acs_cols)

# ------------------------------------------------------------------------------
# County-level mobility summary measures
# ------------------------------------------------------------------------------
# Basic totals and composition shares (per county across POI types)
visitor["mobility_total_visits"] = visitor[visitor_cols].sum(axis=1, skipna=True)

# Avoid divide-by-zero
den = visitor["mobility_total_visits"].replace({0: np.nan})
for c in visitor_cols:
    visitor[f"share_{c}"] = visitor[c] / den

# Mobility diversity (Shannon entropy) over shares
share_cols = [f"share_{c}" for c in visitor_cols]
shares = visitor[share_cols].copy()
# Replace NaN shares (from zero total) with 0 for entropy calc; keep row-level NaN flag separately
shares_filled = shares.fillna(0.0).clip(lower=0.0)
eps = 1e-12
visitor["mobility_entropy"] = -(shares_filled * np.log(shares_filled + eps)).sum(axis=1)

# ------------------------------------------------------------------------------
# Socioeconomic status index (SES): combine income (+) and poverty/unemployment/uninsured (-) and education (+)
# Build standardized components then average
# ------------------------------------------------------------------------------
analysis = (
    counties[["GEOID", "geometry"]]
    .merge(acs, on="GEOID", how="left")
    .merge(depr, on="GEOID", how="left")
    .merge(visitor[["GEOID", "mobility_total_visits", "mobility_entropy"] + visitor_cols], on="GEOID", how="left")
)

# Numeric casting again after merges
_to_numeric_inplace(
    analysis,
    ["Depression_prev", "mobility_total_visits", "mobility_entropy"] + visitor_cols + acs_cols
)

analysis["ses_z_income"] = zscore(analysis["Med_income"])
analysis["ses_z_edu"] = zscore(analysis["percent_>=HighSch"])
analysis["ses_z_poverty"] = zscore(analysis["percent_Poverty"])
analysis["ses_z_unemp"] = zscore(analysis["percent_Unemployed"])
analysis["ses_z_uninsured"] = zscore(analysis["percent_Uninsured"])

# SES index: higher = higher SES
analysis["SES_index"] = (
    analysis["ses_z_income"]
    + analysis["ses_z_edu"]
    - analysis["ses_z_poverty"]
    - analysis["ses_z_unemp"]
    - analysis["ses_z_uninsured"]
) / 5.0

# Log-transform visits (reduce skew)
analysis["log_mobility_total_visits"] = np.log1p(analysis["mobility_total_visits"])

# Keep a modeling frame with key variables
y_col = "Depression_prev"
ses_col = "SES_index"
med_col = "log_mobility_total_visits"
med2_col = "mobility_entropy"

# Controls (demographics) to reduce confounding (kept modest for n=46)
controls = ["percent_White", "percent_Black", "percent_Hispanic", "percent_>=18", "percent_Male"]
_to_numeric_inplace(analysis, controls)

# ------------------------------------------------------------------------------
# Models for mediation:
#   Total effect:        y ~ SES + controls
#   Mediator model:      M ~ SES + controls
#   Direct + mediator:   y ~ SES + M + controls
# Repeat for M = log_total_visits and for M = entropy (two mediators separately)
# ------------------------------------------------------------------------------
model_results = []
coef_tables = []

def run_mediation(analysis_gdf: gpd.GeoDataFrame, mediator_col: str, label: str):
    # Drop NAs jointly across variables used
    needed = [y_col, ses_col, mediator_col] + controls
    dfm = analysis_gdf[["GEOID"] + needed].copy()
    _to_numeric_inplace(dfm, needed)
    dfm = dfm.dropna(subset=needed).reset_index(drop=True)

    # 1) total effect c: y ~ SES + controls
    x_total = [ses_col] + controls
    m_total, m_total_rob, _ = ols_fit(dfm, y_col, x_total, robust_hc1=True)

    # 2) a path: M ~ SES + controls
    x_a = [ses_col] + controls
    m_a, m_a_rob, _ = ols_fit(dfm, mediator_col, x_a, robust_hc1=True)

    # 3) b and c' paths: y ~ SES + M + controls
    x_b = [ses_col, mediator_col] + controls
    m_b, m_b_rob, _ = ols_fit(dfm, y_col, x_b, robust_hc1=True)

    # Extract a, b (robust)
    # param order: const, SES, mediator?, controls...
    a = float(m_a_rob.params[1])  # SES coefficient in mediator model
    sa = float(m_a_rob.bse[1])

    # mediator coefficient index in model 3 is 2 (const=0, SES=1, mediator=2)
    b = float(m_b_rob.params[2])
    sb = float(m_b_rob.bse[2])

    indirect, se_ind, z, p = mediation_sobel(a, sa, b, sb)

    c_total = float(m_total_rob.params[1])
    cp_direct = float(m_b_rob.params[1])

    prop_med = indirect / c_total if (not np.isnan(c_total) and c_total != 0) else np.nan

    # Save coefficient tables (promoted manuscript tables)
    ct_total = coef_table(m_total_rob, x_total)
    ct_total.insert(0, "model", f"{label}: total (y~SES+controls)")
    ct_a = coef_table(m_a_rob, x_a)
    ct_a.insert(0, "model", f"{label}: a-path (M~SES+controls)")
    ct_b = coef_table(m_b_rob, x_b)
    ct_b.insert(0, "model", f"{label}: b/c'-paths (y~SES+M+controls)")

    coef_tables.extend([ct_total, ct_a, ct_b])

    # Fit stats
    model_results.extend([
        fit_stats(m_total, len(x_total), f"{label}_total_nonrobust"),
        fit_stats(m_a, len(x_a), f"{label}_a_nonrobust"),
        fit_stats(m_b, len(x_b), f"{label}_b_nonrobust"),
    ])

    # VIFs (for the y~SES+M+controls model)
    vif = vif_table(dfm, x_b)
    vif_path = os.path.join(tables_dir, f"vif_{label}.csv")
    vif.to_csv(vif_path, index=False)
    record_table(
        output_dir=OUTPUT_DIR,
        file_path=vif_path,
        caption=f"Variance inflation factors (VIF) for predictors in the {label} mediation outcome model.",
        role="promoted",
        columns=["variable", "VIF"],
    )

    return {
        "mediation_label": label,
        "mediator": mediator_col,
        "n": int(m_b_rob.nobs),
        "c_total_SES_effect": c_total,
        "cp_direct_SES_effect": cp_direct,
        "a_SES_to_M": a,
        "b_M_to_y": b,
        "indirect_ab": indirect,
        "indirect_se": se_ind,
        "sobel_z": z,
        "sobel_p": p,
        "prop_mediated_ab_over_c": prop_med,
        "R2_total_model": float(m_total.rsquared),
        "R2_direct_mediator_model": float(m_b.rsquared),
    }, m_b_rob.resid, dfm["GEOID"]

mediation_rows = []

row1, resid1, geoid1 = run_mediation(analysis, med_col, label="MobilityTotalVisits_log1p")
mediation_rows.append(row1)

row2, resid2, geoid2 = run_mediation(analysis, med2_col, label="MobilityDiversity_entropy")
mediation_rows.append(row2)

# ------------------------------------------------------------------------------
# Spatial autocorrelation of residuals (Moran's I) for the "direct+mediator" models
# ------------------------------------------------------------------------------
# Use counties geometry; align residuals by GEOID
analysis_geom = analysis[["GEOID", "geometry"]].dropna(subset=["geometry"]).copy()
analysis_geom = analysis_geom[analysis_geom.geometry.is_valid & ~analysis_geom.geometry.is_empty].copy()

w = Queen.from_dataframe(analysis_geom)
w.transform = "R"

def moran_for_residuals(resid: np.ndarray, geoid_series: pd.Series, label: str):
    resid_df = pd.DataFrame({"GEOID": geoid_series.astype("string"), "resid": resid})
    g = analysis_geom.merge(resid_df, on="GEOID", how="inner").dropna(subset=["resid"]).copy()

    # Ensure weights align with g's order: rebuild weights on this subset
    w_sub = Queen.from_dataframe(g)
    w_sub.transform = "R"

    mi = Moran(g["resid"].values, w_sub, permutations=999)
    return {
        "metric": "Moran_I_residuals",
        "model": label,
        "n": int(len(g)),
        "moran_I": float(mi.I),
        "moran_p_sim": float(mi.p_sim),
        "moran_z_sim": float(mi.z_sim),
    }

moran_rows = [
    moran_for_residuals(resid1, geoid1, "MobilityTotalVisits_log1p_direct_plus_mediator"),
    moran_for_residuals(resid2, geoid2, "MobilityDiversity_entropy_direct_plus_mediator"),
]

# ------------------------------------------------------------------------------
# Save promoted regression coefficient table
# ------------------------------------------------------------------------------
coef_all = pd.concat(coef_tables, ignore_index=True)
coef_path = os.path.join(tables_dir, "mediation_ols_coefficients_robustHC1.csv")
coef_all.to_csv(coef_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_path,
    caption="OLS coefficient tables (HC1 robust standard errors) for mediation models: total effect, mediator model, and direct+mediator outcome model.",
    role="promoted",
    columns=["model", "variable", "beta", "std_err", "t", "p_value", "ci_low", "ci_high"],
)

# Save model fit stats (intermediate or promoted as a table)
fit_stats_df = pd.DataFrame(model_results)
fit_path = os.path.join(tables_dir, "model_fit_stats.csv")
fit_stats_df.to_csv(fit_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=fit_path,
    caption="Model fit statistics (non-robust OLS) for total, mediator, and direct+mediator models.",
    role="promoted",
)

# ------------------------------------------------------------------------------
# Key quantitative results to primary output: mediation + moran diagnostics
# ------------------------------------------------------------------------------
mediation_df = pd.DataFrame(mediation_rows)
moran_df = pd.DataFrame(moran_rows)

# Combine into one wide-ish results file (requested key quantitative results)
analysis_results = mediation_df.merge(
    moran_df.rename(columns={"model": "moran_model"}), how="cross"
)

# But cross-merge duplicates; instead write two blocks separated in one CSV-like table:
# We'll output a long format with a "section" column.
mediation_long = mediation_df.copy()
mediation_long.insert(0, "section", "mediation_results")

moran_long = moran_df.copy()
moran_long.insert(0, "section", "spatial_residual_diagnostics")

analysis_results_long = pd.concat([mediation_long, moran_long], ignore_index=True)
analysis_results_long.to_csv(OUTPUT_NODE_PATH, index=False)

# Also save as a promoted table for manuscript use
results_table_path = os.path.join(tables_dir, "analysis_results_key_quantitative.csv")
analysis_results_long.to_csv(results_table_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=results_table_path,
    caption="Key quantitative results: mediation estimates (a, b, c, c', indirect effect with Sobel test) and Moran's I residual autocorrelation diagnostics.",
    role="promoted",
)

# ------------------------------------------------------------------------------
# Visualizations
#   1) Choropleth: depression prevalence
#   2) Choropleth: SES index
#   3) Choropleth: mobility (log total visits)
#   4) Scatter: SES vs depression with color by mobility
# ------------------------------------------------------------------------------
viz_gdf = analysis[["GEOID", "geometry", "Depression_prev", "SES_index", "log_mobility_total_visits", "mobility_entropy"]].copy()
viz_gdf = viz_gdf.dropna(subset=["geometry"]).copy()
viz_gdf = viz_gdf[viz_gdf.geometry.is_valid & ~viz_gdf.geometry.is_empty].copy()

def save_choropleth(gdf, col, title, cmap, fname, step_index):
    fig, ax = plt.subplots(1, 1, figsize=(8, 7))
    gdf.plot(column=col, ax=ax, legend=True, cmap=cmap, missing_kwds={"color": "lightgrey", "label": "Missing"})
    ax.set_title(title)
    ax.set_axis_off()
    out = os.path.join(OUTPUT_DIR, fname)
    plt.tight_layout()
    plt.savefig(out, dpi=300)
    plt.close(fig)
    record_figure(
        output_dir=OUTPUT_DIR,
        file_path=out,
        caption=title,
        role="final" if col == "Depression_prev" else "promoted",
        objective_key="objective_1",
        step_index=step_index,
    )
    return out

save_choropleth(
    viz_gdf, "Depression_prev",
    "County-level depression prevalence (PLACES) across South Carolina",
    "Reds", "choropleth_depression_prev.png", step_index=1
)
save_choropleth(
    viz_gdf, "SES_index",
    "County-level socioeconomic status (SES) index across South Carolina (higher = higher SES)",
    "viridis", "choropleth_SES_index.png", step_index=2
)
save_choropleth(
    viz_gdf, "log_mobility_total_visits",
    "County-level mobility intensity: log(1 + total place visitation) across South Carolina",
    "Blues", "choropleth_mobility_log_total_visits.png", step_index=3
)

# Scatterplot: SES vs depression colored by mobility intensity
scatter_df = viz_gdf.dropna(subset=["SES_index", "Depression_prev", "log_mobility_total_visits"]).copy()
fig, ax = plt.subplots(1, 1, figsize=(7.5, 6))
sc = ax.scatter(
    scatter_df["SES_index"], scatter_df["Depression_prev"],
    c=scatter_df["log_mobility_total_visits"], cmap="Blues", edgecolor="k", linewidth=0.3, s=55
)
ax.set_xlabel("SES index (z-scored composite)")
ax.set_ylabel("Depression prevalence")
ax.set_title("SES vs depression by county (color = mobility intensity)")
cb = plt.colorbar(sc, ax=ax)
cb.set_label("log(1 + total visits)")
ax.grid(True, alpha=0.25)
out_scatter = os.path.join(OUTPUT_DIR, "scatter_SES_vs_depression_colored_by_mobility.png")
plt.tight_layout()
plt.savefig(out_scatter, dpi=300)
plt.close(fig)
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=out_scatter,
    caption="Scatterplot of county SES index versus depression prevalence; point color indicates mobility intensity (log total visits).",
    role="promoted",
    objective_key="objective_1",
    step_index=4,
)

# ------------------------------------------------------------------------------
# Save an analysis-ready geospatial dataset for optional deferred rendering
# ------------------------------------------------------------------------------
gpkg_path = os.path.join(OUTPUT_DIR, "county_analysis_with_SES_mobility_depression.gpkg")
viz_gdf.to_file(gpkg_path, layer="county_analysis", driver="GPKG")
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=gpkg_path,
    caption="County-level analysis layer containing depression prevalence, SES index, and mobility metrics for South Carolina.",
    viz_hint={"type": "choropleth", "column": "Depression_prev", "cmap": "Reds"},
    role="intermediate",
)