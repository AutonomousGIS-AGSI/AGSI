import os
import warnings
import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor
from scipy.stats import pearsonr, spearmanr

from libpysal.weights import Queen
from esda.moran import Moran

# Pre-imported by framework (do not re-import): record_figure, record_table, record_data_to_viz

# -----------------------------
# Paths
# -----------------------------
COUNTIES_GPKG = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\california_counties_2019.gpkg"
URBANRURAL_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\California_UrbanRural_Classification_2019.csv"
GINI_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\California_Counties_Gini_2019.csv"
PM25_CSV = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\WebUI\uploads\dd5922b8-6439-4369-b784-21a662f7c30c\PM2.5_Annual_California_2019_1.csv"

OUTPUT_NODE_PATH = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\PhD Work\RESEARCH PROJECTS\GIS-co-scientist\Outputs\dd5922b8-6439-4369-b784-21a662f7c30c\analysis_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# -----------------------------
# Helpers
# -----------------------------
def to_numeric(series):
    return pd.to_numeric(series, errors="coerce")

def safe_str(series):
    return series.astype(str).str.strip()

def standardize(series):
    s = series.astype(float)
    return (s - s.mean()) / (s.std(ddof=0) if s.std(ddof=0) != 0 else 1.0)

def sem_ols(y, X, add_const=True):
    if add_const:
        X = sm.add_constant(X, has_constant="add")
    model = sm.OLS(y, X).fit()
    return model

def model_summary_row(model, model_name, group_label, nobs):
    rmse = float(np.sqrt(np.mean(model.resid ** 2)))
    return {
        "analysis": "ols_model_fit",
        "model": model_name,
        "group": group_label,
        "n": int(nobs),
        "R2": float(model.rsquared),
        "adj_R2": float(model.rsquared_adj),
        "AIC": float(model.aic),
        "BIC": float(model.bic),
        "F": float(model.fvalue) if model.fvalue is not None else np.nan,
        "F_pvalue": float(model.f_pvalue) if model.f_pvalue is not None else np.nan,
        "RMSE": rmse,
    }

# -----------------------------
# STEP 1: INSPECT ALL INPUT DATA (get_columns already executed by framework in prior step)
#         Here we proceed using ONLY confirmed columns:
#           - counties gpkg: STATEFP, COUNTYFP, COUNTYNS, AFFGEOID, GEOID, NAME, LSAD, ALAND, AWATER, geometry
#           - urban/rural csv: OBJECTID, FIPSTXT, FIPSNUM, State, County, RuralUrbanContinuumCode2013, UrbanInfluenceCode2013,
#                             Metro2013, Nonmetro2013, Micropolitan2013, Type_2015_Update, Type_2015_*,
#                             Low_Education_2015_update, Low_Employment_2015_update, Population_loss_2015_update,
#                             Retirement_Destination_2015_Update, HiAmenity, HiCreativeClass2000, Shape_Length, Shape_Area
#           - gini csv: B19083_001E:Gini Index, state_fips, county_fips, year, source
#           - pm25 csv: state_code, county_code, year, arithmetic_mean, plus many others incl county/state strings
# -----------------------------

# -----------------------------
# STEP 2: SKILL REFERENCE
# Loaded: OLS Regression (statsmodels). We'll use it + spatial residual Moran's I diagnostics.
# -----------------------------

# -----------------------------
# STEP 3: DATA PREP + ANALYSIS + VISUALIZATION
# -----------------------------

# 3a) Load geometry FIRST and keep it as a GeoDataFrame throughout (avoid "Unknown column geometry" merge issues)
counties_gdf = gpd.read_file(COUNTIES_GPKG)

# Validate geometry
counties_gdf = counties_gdf[counties_gdf.geometry.notnull()]
counties_gdf = counties_gdf[counties_gdf.geometry.is_valid & ~counties_gdf.geometry.is_empty].copy()

# Ensure join keys
counties_gdf["STATEFP"] = safe_str(counties_gdf["STATEFP"])
counties_gdf["COUNTYFP"] = safe_str(counties_gdf["COUNTYFP"])
counties_gdf["GEOID"] = safe_str(counties_gdf["GEOID"])

# 3b) Load attribute tables
urban_df = pd.read_csv(URBANRURAL_CSV, dtype=str)
gini_df = pd.read_csv(GINI_CSV, dtype=str)
pm_df = pd.read_csv(PM25_CSV, dtype=str)

# 3c) Prepare Gini
gini_df["state_fips"] = safe_str(gini_df["state_fips"])
gini_df["county_fips"] = safe_str(gini_df["county_fips"]).str.zfill(3)
gini_df["year"] = safe_str(gini_df["year"])
gini_df["gini"] = to_numeric(gini_df["B19083_001E:Gini Index"])
gini2019 = gini_df[gini_df["year"] == "2019"].copy()
gini2019["GEOID"] = gini2019["state_fips"].str.zfill(2) + gini2019["county_fips"].str.zfill(3)
gini2019 = gini2019[["GEOID", "gini"]].drop_duplicates()

# 3d) Prepare urban-rural classification
# Use FIPSTXT as county FIPS (string). Create 5-digit GEOID.
urban_df["FIPSTXT"] = safe_str(urban_df["FIPSTXT"]).str.zfill(5)
urban2019 = urban_df.copy()
urban2019["GEOID"] = urban2019["FIPSTXT"]
urban2019["rucc_2013"] = to_numeric(urban2019["RuralUrbanContinuumCode2013"])
urban2019["metro2013"] = safe_str(urban2019["Metro2013"])
urban2019["nonmetro2013"] = safe_str(urban2019["Nonmetro2013"])

# Define a simple, robust urban-rural class:
# If Metro2013 indicates metro -> "Metro"; else if Nonmetro2013 indicates nonmetro -> "Nonmetro"; else fallback based on RUCC
def classify_urban_rural(row):
    m = str(row.get("metro2013", "")).strip().lower()
    n = str(row.get("nonmetro2013", "")).strip().lower()
    rucc = row.get("rucc_2013", np.nan)
    if m in ["1", "true", "yes", "metro"]:
        return "Metro"
    if n in ["1", "true", "yes", "nonmetro"]:
        return "Nonmetro"
    if pd.notnull(rucc):
        # RUCC 1-3 metro; 4-9 nonmetro
        return "Metro" if rucc <= 3 else "Nonmetro"
    return "Unknown"

urban2019["urban_rural"] = urban2019.apply(classify_urban_rural, axis=1)
urban2019 = urban2019[["GEOID", "urban_rural", "rucc_2013"]].drop_duplicates()

# 3e) Prepare PM2.5 annual county-level exposure from monitor/site rows
pm_df["year"] = safe_str(pm_df["year"])
pm2019 = pm_df[pm_df["year"] == "2019"].copy()

pm2019["state_code"] = safe_str(pm2019["state_code"]).str.zfill(2)
pm2019["county_code"] = safe_str(pm2019["county_code"]).str.zfill(3)
pm2019["GEOID"] = pm2019["state_code"] + pm2019["county_code"]
pm2019["pm25"] = to_numeric(pm2019["arithmetic_mean"])

# Aggregate: mean across sites within county; also track count
pm_agg = (
    pm2019.dropna(subset=["GEOID", "pm25"])
    .groupby("GEOID", as_index=False)
    .agg(pm25_mean=("pm25", "mean"), pm25_n_sites=("pm25", "size"))
)

# 3f) Merge attributes into counties GeoDataFrame without recreating geometry column
# Merge order: counties -> pm -> gini -> urbanrural
analysis_gdf = counties_gdf.merge(pm_agg, on="GEOID", how="left", validate="1:1")
analysis_gdf = analysis_gdf.merge(gini2019, on="GEOID", how="left", validate="1:1")
analysis_gdf = analysis_gdf.merge(urban2019, on="GEOID", how="left", validate="1:1")

# Ensure geo is still active and named properly
analysis_gdf = gpd.GeoDataFrame(analysis_gdf, geometry=counties_gdf.geometry.name, crs=counties_gdf.crs)

# Basic cleaning
analysis_gdf["pm25_mean"] = to_numeric(analysis_gdf["pm25_mean"])
analysis_gdf["pm25_n_sites"] = to_numeric(analysis_gdf["pm25_n_sites"])
analysis_gdf["gini"] = to_numeric(analysis_gdf["gini"])
analysis_gdf["rucc_2013"] = to_numeric(analysis_gdf["rucc_2013"])

# Keep California only by STATEFP == '06' if present (should be all)
analysis_gdf = analysis_gdf[analysis_gdf["STATEFP"] == "06"].copy()

# Drop rows missing key variables
analysis_gdf_valid = analysis_gdf.dropna(subset=["pm25_mean", "gini"]).copy()

# 3g) Quantify "spatial inequalities in PM2.5 exposure across counties"
# Use county-level inequality metrics: Gini of county means, CV, Theil (T) for pm25_mean across counties,
# computed overall and by urban_rural group.
def gini_coefficient(x):
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    if len(x) == 0:
        return np.nan
    if np.all(x == 0):
        return 0.0
    x_sorted = np.sort(x)
    n = len(x_sorted)
    cumx = np.cumsum(x_sorted)
    g = (n + 1 - 2 * np.sum(cumx) / cumx[-1]) / n
    return float(g)

def theil_t(x):
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    if len(x) == 0:
        return np.nan
    mu = x.mean()
    if mu == 0:
        return np.nan
    ratio = x / mu
    ratio = ratio[ratio > 0]
    return float(np.mean(ratio * np.log(ratio)))

def inequality_metrics(df, label):
    x = df["pm25_mean"].to_numpy(dtype=float)
    return [
        {"analysis": "pm25_inequality", "metric": "gini_pm25_across_counties", "group": label, "value": gini_coefficient(x), "n": int(np.sum(~np.isnan(x)))},
        {"analysis": "pm25_inequality", "metric": "cv_pm25_across_counties", "group": label, "value": float(np.nanstd(x, ddof=0) / np.nanmean(x)) if np.nanmean(x) not in [0, np.nan] else np.nan, "n": int(np.sum(~np.isnan(x)))},
        {"analysis": "pm25_inequality", "metric": "theilT_pm25_across_counties", "group": label, "value": theil_t(x), "n": int(np.sum(~np.isnan(x)))},
        {"analysis": "pm25_inequality", "metric": "mean_pm25", "group": label, "value": float(np.nanmean(x)), "n": int(np.sum(~np.isnan(x)))},
    ]

results_rows = []
results_rows.extend(inequality_metrics(analysis_gdf_valid, "All"))

for grp, sub in analysis_gdf_valid.groupby("urban_rural", dropna=False):
    grp_label = str(grp) if pd.notnull(grp) else "NA"
    results_rows.extend(inequality_metrics(sub, grp_label))

# 3h) Association between PM2.5 and income inequality (Gini) across counties
x = analysis_gdf_valid["gini"].astype(float).to_numpy()
y = analysis_gdf_valid["pm25_mean"].astype(float).to_numpy()

pear_r, pear_p = pearsonr(x, y)
spear_r, spear_p = spearmanr(x, y)

results_rows.append({"analysis": "association", "metric": "pearson_r_pm25_vs_gini", "group": "All", "value": float(pear_r), "n": int(len(x))})
results_rows.append({"analysis": "association", "metric": "pearson_p_pm25_vs_gini", "group": "All", "value": float(pear_p), "n": int(len(x))})
results_rows.append({"analysis": "association", "metric": "spearman_r_pm25_vs_gini", "group": "All", "value": float(spear_r), "n": int(len(x))})
results_rows.append({"analysis": "association", "metric": "spearman_p_pm25_vs_gini", "group": "All", "value": float(spear_p), "n": int(len(x))})

for grp, sub in analysis_gdf_valid.groupby("urban_rural", dropna=False):
    sub = sub.dropna(subset=["gini", "pm25_mean"]).copy()
    if len(sub) >= 3:
        xr = sub["gini"].astype(float).to_numpy()
        yr = sub["pm25_mean"].astype(float).to_numpy()
        pr, pp = pearsonr(xr, yr)
        sr, sp = spearmanr(xr, yr)
        grp_label = str(grp) if pd.notnull(grp) else "NA"
        results_rows.append({"analysis": "association", "metric": "pearson_r_pm25_vs_gini", "group": grp_label, "value": float(pr), "n": int(len(sub))})
        results_rows.append({"analysis": "association", "metric": "pearson_p_pm25_vs_gini", "group": grp_label, "value": float(pp), "n": int(len(sub))})
        results_rows.append({"analysis": "association", "metric": "spearman_r_pm25_vs_gini", "group": grp_label, "value": float(sr), "n": int(len(sub))})
        results_rows.append({"analysis": "association", "metric": "spearman_p_pm25_vs_gini", "group": grp_label, "value": float(sp), "n": int(len(sub))})

# 3i) OLS models: does relationship vary by urban–rural?
# Model 1: pm25 ~ gini
# Model 2: pm25 ~ gini + urban_rural(Nonmetro vs Metro) + gini*Nonmetro
model_df = analysis_gdf_valid.dropna(subset=["pm25_mean", "gini", "urban_rural"]).copy()

# Encode Nonmetro indicator (baseline Metro)
model_df["is_nonmetro"] = (model_df["urban_rural"].astype(str).str.lower() == "nonmetro").astype(int)

# Numeric arrays
y_ols = model_df["pm25_mean"].astype(float).to_numpy()
gini_num = model_df["gini"].astype(float).to_numpy()
nonmetro = model_df["is_nonmetro"].astype(int).to_numpy()
interaction = gini_num * nonmetro

X1 = pd.DataFrame({"gini": gini_num})
m1 = sem_ols(y_ols, X1, add_const=True)

X2 = pd.DataFrame({"gini": gini_num, "is_nonmetro": nonmetro, "gini_x_nonmetro": interaction})
m2 = sem_ols(y_ols, X2, add_const=True)

# Save coefficients table (promoted)
def coef_table(model, model_name, x_cols):
    ci = model.conf_int()
    df = pd.DataFrame({
        "model": model_name,
        "variable": ["const"] + x_cols,
        "beta": model.params,
        "std_err": model.bse,
        "t": model.tvalues,
        "p": model.pvalues,
        "ci_low": ci[:, 0],
        "ci_high": ci[:, 1],
    })
    return df

coef_df = pd.concat(
    [
        coef_table(m1, "Model1_pm25~gini", ["gini"]),
        coef_table(m2, "Model2_pm25~gini+UR+interaction", ["gini", "is_nonmetro", "gini_x_nonmetro"]),
    ],
    ignore_index=True,
)

coef_path = os.path.join(tables_dir, "ols_coefficients_pm25_gini_urbanrural_2019.csv")
coef_df.to_csv(coef_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_path,
    caption="OLS coefficients for county PM2.5 (2019) regressed on Gini and urban–rural classification with interaction.",
    role="promoted",
    columns=["model", "variable", "beta", "std_err", "t", "p", "ci_low", "ci_high"],
)

# Save model fit stats (promoted)
fit_df = pd.DataFrame([
    model_summary_row(m1, "Model1_pm25~gini", "All (with urban_rural)", m1.nobs),
    model_summary_row(m2, "Model2_pm25~gini+UR+interaction", "All (with urban_rural)", m2.nobs),
])
fit_path = os.path.join(tables_dir, "ols_fit_stats_pm25_gini_urbanrural_2019.csv")
fit_df.to_csv(fit_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=fit_path,
    caption="OLS model fit statistics comparing baseline and interaction models for PM2.5 vs Gini (2019).",
    role="promoted",
    columns=list(fit_df.columns),
)

# VIF for Model 2 predictors (promoted)
X2_const = sm.add_constant(X2, has_constant="add").to_numpy()
vif_vals = []
# skip constant at column 0
for i, var in enumerate(["gini", "is_nonmetro", "gini_x_nonmetro"], start=1):
    vif_vals.append(variance_inflation_factor(X2_const, i))
vif_df = pd.DataFrame({"variable": ["gini", "is_nonmetro", "gini_x_nonmetro"], "VIF": vif_vals})

vif_path = os.path.join(tables_dir, "ols_vif_model2_pm25_gini_urbanrural_2019.csv")
vif_df.to_csv(vif_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=vif_path,
    caption="Variance inflation factors (VIF) for predictors in the PM2.5~Gini urban–rural interaction model (2019).",
    role="promoted",
    columns=["variable", "VIF"],
)

# Add residuals for spatial diagnostics
model_df["ols1_resid"] = m1.resid
model_df["ols2_resid"] = m2.resid

# 3j) Spatial autocorrelation (Moran's I) of PM2.5 and residuals
# Build weights from the GeoDataFrame (aligned indices)
diag_gdf = analysis_gdf_valid[analysis_gdf_valid["GEOID"].isin(model_df["GEOID"])].copy()
diag_gdf = diag_gdf.set_index("GEOID")
model_df_idx = model_df.set_index("GEOID")
diag_gdf["pm25_mean"] = model_df_idx["pm25_mean"].astype(float)
diag_gdf["ols1_resid"] = model_df_idx["ols1_resid"].astype(float)
diag_gdf["ols2_resid"] = model_df_idx["ols2_resid"].astype(float)

# Project to a planar CRS for contiguity operations (if needed)
# Use EPSG:3310 (CA Albers) for stable topology
try:
    diag_gdf_proj = diag_gdf.to_crs(epsg=3310)
except Exception:
    diag_gdf_proj = diag_gdf.copy()

diag_gdf_proj = diag_gdf_proj[diag_gdf_proj.geometry.is_valid & ~diag_gdf_proj.geometry.is_empty].copy()

w = Queen.from_dataframe(diag_gdf_proj, use_index=True)
w.transform = "R"

def moran_row(varname, values, group_label):
    mi = Moran(values, w, permutations=999)
    return {
        "analysis": "spatial_autocorrelation",
        "metric": f"moran_I_{varname}",
        "group": group_label,
        "value": float(mi.I),
        "n": int(len(values)),
        "p_sim": float(mi.p_sim),
        "z_sim": float(mi.z_sim),
    }

results_rows.append(moran_row("pm25", diag_gdf_proj["pm25_mean"].to_numpy(), "All (model sample)"))
results_rows.append(moran_row("ols1_resid", diag_gdf_proj["ols1_resid"].to_numpy(), "All (model sample)"))
results_rows.append(moran_row("ols2_resid", diag_gdf_proj["ols2_resid"].to_numpy(), "All (model sample)"))

# 3k) Visualizations
# (1) Choropleths: PM2.5 and Gini
def choropleth(gdf, column, title, out_path):
    fig, ax = plt.subplots(1, 1, figsize=(9, 9))
    gdf.plot(column=column, ax=ax, legend=True, cmap="viridis", linewidth=0.2, edgecolor="white", missing_kwds={"color": "lightgrey"})
    ax.set_axis_off()
    ax.set_title(title)
    plt.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)

pm_map_path = os.path.join(OUTPUT_DIR, "fig_pm25_choropleth_2019.png")
choropleth(analysis_gdf, "pm25_mean", "California counties: PM2.5 annual mean (2019) from site averages", pm_map_path)
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=pm_map_path,
    caption="County choropleth of PM2.5 annual mean concentration (2019) aggregated from monitoring sites.",
    role="final",
    objective_key="objective_1",
    step_index=1,
)

gini_map_path = os.path.join(OUTPUT_DIR, "fig_gini_choropleth_2019.png")
choropleth(analysis_gdf, "gini", "California counties: Income inequality (Gini index, 2019)", gini_map_path)
record_figure(
    output_dir=OUTPUT_DIR,
    file_path=gini_map_path,
    caption="County choropleth of income inequality (Gini index) in 2019.",
    role="final",
    objective_key="objective_1",
    step_index=2,
)

# (2) Scatter: PM2.5 vs Gini, colored by urban_rural, with separate OLS lines by group
scatter_df = analysis_gdf_valid.dropna(subset=["pm25_mean", "gini"]).copy()
scatter_df["urban_rural"] = scatter_df["urban_rural"].fillna("Unknown").astype(str)

fig, ax = plt.subplots(1, 1, figsize=(8, 6))
colors = {"Metro": "#1f77b4", "Nonmetro": "#ff7f0e", "Unknown": "#7f7f7f"}
for grp, sub in scatter_df.groupby("urban_rural"):
    ax.scatter(sub["gini"], sub["pm25_mean"], s=30, alpha=0.85, label=f"{grp} (n={len(sub)})", c=colors.get(grp, "#2ca02c"))

    # Fit groupwise line if enough points
    if len(sub) >= 3:
        xs = sub["gini"].astype(float).to_numpy()
        ys = sub["pm25_mean"].astype(float).to_numpy()
        Xg = sm.add_constant(xs)
        mg = sm.OLS(ys, Xg).fit()
        xline = np.linspace(xs.min(), xs.max(), 50)
        yline = mg.predict(sm.add_constant(xline))
        ax.plot(xline, yline, linewidth=2, color=colors.get(grp, "#2ca02c"))

ax.set_xlabel("Gini index (2019)")
ax.set_ylabel("PM2.5 annual mean (2019)")
ax.set_title("County PM2.5 vs income inequality (Gini), stratified by urban–rural class")
ax.legend(frameon=True, fontsize=9)
ax.grid(True, linestyle="--", alpha=0.3)
plt.tight_layout()

scatter_path = os.path.join(OUTPUT_DIR, "fig_scatter_pm25_vs_gini_by_urbanrural_2019.png")
fig.savefig(scatter_path, dpi=200)
plt.close(fig)

record_figure(
    output_dir=OUTPUT_DIR,
    file_path=scatter_path,
    caption="Scatterplot of county PM2.5 (2019) versus Gini (2019), colored by urban–rural class with groupwise OLS trend lines.",
    role="final",
    objective_key="objective_1",
    step_index=3,
)

# (3) Urban-rural PM2.5 distribution
fig, ax = plt.subplots(1, 1, figsize=(7, 5))
order = ["Metro", "Nonmetro", "Unknown"]
box_data = []
labels = []
for grp in order:
    vals = scatter_df.loc[scatter_df["urban_rural"] == grp, "pm25_mean"].astype(float).to_numpy()
    if len(vals) > 0:
        box_data.append(vals)
        labels.append(f"{grp}\n(n={len(vals)})")
if len(box_data) > 0:
    ax.boxplot(box_data, labels=labels, showfliers=True)
ax.set_ylabel("PM2.5 annual mean (2019)")
ax.set_title("PM2.5 distribution by urban–rural classification")
ax.grid(True, axis="y", linestyle="--", alpha=0.3)
plt.tight_layout()

box_path = os.path.join(OUTPUT_DIR, "fig_box_pm25_by_urbanrural_2019.png")
fig.savefig(box_path, dpi=200)
plt.close(fig)

record_figure(
    output_dir=OUTPUT_DIR,
    file_path=box_path,
    caption="Boxplots of county PM2.5 annual mean (2019) by urban–rural classification.",
    role="promoted",
    objective_key="objective_1",
    step_index=4,
)

# 3l) Descriptive table (promoted): county-level merged attributes (light)
desc_cols = ["GEOID", "NAME", "pm25_mean", "pm25_n_sites", "gini", "urban_rural", "rucc_2013"]
desc_df = analysis_gdf[desc_cols].copy()
desc_path = os.path.join(tables_dir, "table_county_pm25_gini_urbanrural_2019.csv")
desc_df.to_csv(desc_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=desc_path,
    caption="County-level dataset (2019) merging PM2.5 annual mean, Gini index, and urban–rural classification.",
    role="intermediate",
    columns=desc_cols,
)

# 3m) Compile key quantitative results into the required primary output (analysis_results.csv)
results_df = pd.DataFrame(results_rows)

# Add key OLS interaction inference into results_df as rows for easier downstream usage
# Extract p-value for interaction term from m2
coef_map = dict(zip(["const", "gini", "is_nonmetro", "gini_x_nonmetro"], m2.params))
p_map = dict(zip(["const", "gini", "is_nonmetro", "gini_x_nonmetro"], m2.pvalues))
results_df = pd.concat(
    [
        results_df,
        pd.DataFrame(
            [
                {"analysis": "interaction_test", "metric": "beta_gini_x_nonmetro", "group": "All", "value": float(coef_map.get("gini_x_nonmetro", np.nan)), "n": int(m2.nobs)},
                {"analysis": "interaction_test", "metric": "p_gini_x_nonmetro", "group": "All", "value": float(p_map.get("gini_x_nonmetro", np.nan)), "n": int(m2.nobs)},
            ]
        ),
    ],
    ignore_index=True,
)

# Save primary output
os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
results_df.to_csv(OUTPUT_NODE_PATH, index=False)

# Also save merged GeoPackage for potential downstream viz (intermediate)
merged_gpkg_path = os.path.join(OUTPUT_DIR, "merged_county_pm25_gini_urbanrural_2019.gpkg")
try:
    analysis_gdf.to_file(merged_gpkg_path, driver="GPKG")
    record_data_to_viz(
        output_dir=OUTPUT_DIR,
        file_path=merged_gpkg_path,
        caption="California counties with merged 2019 PM2.5, Gini, and urban–rural attributes for mapping.",
        viz_hint={"type": "choropleth", "column": "pm25_mean", "cmap": "viridis"},
        role="intermediate",
    )
except Exception:
    pass