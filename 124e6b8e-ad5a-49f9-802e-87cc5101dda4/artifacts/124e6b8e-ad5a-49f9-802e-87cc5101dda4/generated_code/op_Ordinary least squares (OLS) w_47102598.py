import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

import statsmodels.api as sm
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import jarque_bera, omni_normtest, durbin_watson
from statsmodels.graphics.gofplots import qqplot

# ----------------------------
# Paths
# ----------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression_with_index.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/ols_ses_to_depression_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)
os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

# ----------------------------
# Load + clean
# ----------------------------
df = pd.read_csv(INPUT_PATH)

y_col = "Depression_prev"
x_cols = ["SES_index", "percent_>=18", "percent_Black", "percent_Hispanic"]

needed = [y_col] + x_cols
missing = [c for c in needed if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {list(df.columns)}")

# Cast to numeric (all are object dtype per inspection)
for c in needed:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df_model = df.dropna(subset=needed).copy()
if df_model.shape[0] < (len(x_cols) + 2):
    raise ValueError(
        f"Not enough complete cases to fit OLS after dropna: n={df_model.shape[0]}, "
        f"predictors={len(x_cols)}"
    )

y = df_model[y_col].astype(float).values
X = df_model[x_cols].astype(float)
X = sm.add_constant(X, has_constant="add")

# ----------------------------
# Fit OLS + HC1 robust SE
# ----------------------------
ols = sm.OLS(y, X).fit()
rob = ols.get_robustcov_results(cov_type="HC1")

term_names = ["const"] + x_cols
coef_df = pd.DataFrame(
    {
        "type": "coefficient",
        "term": term_names,
        "estimate": rob.params,
        "std_error_HC1": rob.bse,
        "t_stat_HC1": rob.tvalues,
        "p_value_HC1": rob.pvalues,
        "ci95_low_HC1": rob.conf_int()[:, 0],
        "ci95_high_HC1": rob.conf_int()[:, 1],
        "diagnostic_value": np.nan,
    }
)

# ----------------------------
# Residual diagnostics
# ----------------------------
resid = ols.resid
fitted = ols.fittedvalues

rmse = float(np.sqrt(np.mean(resid**2)))
mae = float(np.mean(np.abs(resid)))

jb_stat, jb_p, skew, kurt = jarque_bera(resid)
omni_stat, omni_p = omni_normtest(resid)
dw = float(durbin_watson(resid))

# Breusch-Pagan for heteroskedasticity (use original design matrix with constant)
bp_lm, bp_lm_p, bp_f, bp_f_p = het_breuschpagan(resid, X)

diag_items = [
    ("n_obs", float(ols.nobs)),
    ("r_squared", float(ols.rsquared)),
    ("adj_r_squared", float(ols.rsquared_adj)),
    ("aic", float(ols.aic)),
    ("bic", float(ols.bic)),
    ("f_stat", float(ols.fvalue) if ols.fvalue is not None else np.nan),
    ("f_p_value", float(ols.f_pvalue) if ols.f_pvalue is not None else np.nan),
    ("rmse", rmse),
    ("mae", mae),
    ("durbin_watson", dw),
    ("jarque_bera_stat", float(jb_stat)),
    ("jarque_bera_p_value", float(jb_p)),
    ("omnibus_stat", float(omni_stat)),
    ("omnibus_p_value", float(omni_p)),
    ("resid_skew", float(skew)),
    ("resid_kurtosis", float(kurt)),
    ("breusch_pagan_lm_stat", float(bp_lm)),
    ("breusch_pagan_lm_p_value", float(bp_lm_p)),
    ("breusch_pagan_f_stat", float(bp_f)),
    ("breusch_pagan_f_p_value", float(bp_f_p)),
    ("condition_number", float(ols.condition_number)),
]

diag_df = pd.DataFrame(
    {
        "type": "diagnostic",
        "term": [k for k, _ in diag_items],
        "estimate": np.nan,
        "std_error_HC1": np.nan,
        "t_stat_HC1": np.nan,
        "p_value_HC1": np.nan,
        "ci95_low_HC1": np.nan,
        "ci95_high_HC1": np.nan,
        "diagnostic_value": [v for _, v in diag_items],
    }
)

results_long = pd.concat([coef_df, diag_df], ignore_index=True)

# ----------------------------
# Save outputs
# ----------------------------
results_long.to_csv(OUTPUT_NODE_PATH, index=False)

# Manuscript-ready table: coefficients only
coef_table_path = os.path.join(tables_dir, "ols_ses_to_depression_coefficients_hc1.csv")
coef_df_out = coef_df.drop(columns=["type", "diagnostic_value"]).copy()
coef_df_out.to_csv(coef_table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_table_path,
    caption="OLS coefficients for Depression prevalence with HC1 robust standard errors (county level).",
    role="promoted",
    columns=list(coef_df_out.columns),
)

# Save diagnostics table (as intermediate table)
diag_table_path = os.path.join(OUTPUT_DIR, "ols_ses_to_depression_residual_diagnostics.csv")
diag_df_out = diag_df[["term", "diagnostic_value"]].copy()
diag_df_out.to_csv(diag_table_path, index=False)

# ----------------------------
# Diagnostic figures
# ----------------------------
# Residuals vs fitted
resfit_path = os.path.join(OUTPUT_DIR, "ols_residuals_vs_fitted.png")
plt.figure(figsize=(7, 5))
plt.scatter(fitted, resid, s=12, alpha=0.6, edgecolor="none")
plt.axhline(0, color="black", linewidth=1)
plt.xlabel("Fitted values")
plt.ylabel("Residuals")
plt.title("OLS residuals vs fitted values")
plt.tight_layout()
plt.savefig(resfit_path, dpi=200)
plt.close()

record_figure(
    output_dir=OUTPUT_DIR,
    file_path=resfit_path,
    caption="Residuals versus fitted values from the county-level OLS model (visual check for heteroskedasticity/nonlinearity).",
    role="promoted",
    objective_key="objective_1",
    step_index=1,
)

# QQ plot
qq_path = os.path.join(OUTPUT_DIR, "ols_residuals_qqplot.png")
fig = qqplot(resid, line="45", fit=True)
plt.title("OLS residuals Q-Q plot")
plt.tight_layout()
plt.savefig(qq_path, dpi=200)
plt.close()

record_figure(
    output_dir=OUTPUT_DIR,
    file_path=qq_path,
    caption="Q-Q plot of OLS residuals (visual check for departures from normality).",
    role="promoted",
    objective_key="objective_1",
    step_index=2,
)