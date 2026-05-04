import os
import json
import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/tract_modeling_features.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/ols_interaction_results.json"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311"

# ----------------------------
# 1) Load + clean
# ----------------------------
df = pd.read_csv(INPUT_PATH)

y_col = "Asthma_prev"
x_cols = [
    "ln_nearest_hw_dist_m",
    "z_ratio_poverty",
    "z_ratio_uninsured",
    "z_med_income",
    "z_ratio_black",
    "z_ratio_hispanic",
    "ln_nearest_hw_dist_m_x_z_ratio_poverty",
    "ln_nearest_hw_dist_m_x_z_ratio_black",
]

required_cols = [y_col] + x_cols
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise KeyError(
        f"Missing required columns: {missing}. Available columns: {list(df.columns)}"
    )

# All are typed as object in schema; coerce to numeric
for c in required_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df_clean = df.dropna(subset=required_cols).copy()
df_clean = df_clean.reset_index(drop=True)

y = df_clean[y_col].astype(float).values
X = df_clean[x_cols].astype(float)
X_const = sm.add_constant(X, has_constant="add")

# ----------------------------
# 2) Fit OLS + robust (HC) SEs
# ----------------------------
ols = sm.OLS(y, X_const).fit()
# Use heteroskedasticity-robust covariance (HC1 is common default)
ols_hc = ols.get_robustcov_results(cov_type="HC1")

param_names = ["const"] + x_cols

coef_df = pd.DataFrame(
    {
        "variable": param_names,
        "coef": ols_hc.params,
        "std_err_hc1": ols_hc.bse,
        "t_hc1": ols_hc.tvalues,
        "p_value_hc1": ols_hc.pvalues,
        "ci95_low_hc1": ols_hc.conf_int()[:, 0],
        "ci95_high_hc1": ols_hc.conf_int()[:, 1],
    }
)

# Model diagnostics (some computed on original OLS; robust affects inference, not fitted values)
resid = ols.resid
rmse = float(np.sqrt(np.mean(resid**2)))

diagnostics = {
    "n_obs": int(ols.nobs),
    "n_params": int(len(param_names)),
    "r2": float(ols.rsquared),
    "adj_r2": float(ols.rsquared_adj),
    "aic": float(ols.aic),
    "bic": float(ols.bic),
    "f_statistic": None if ols.fvalue is None else float(ols.fvalue),
    "f_pvalue": None if ols.f_pvalue is None else float(ols.f_pvalue),
    "rmse": rmse,
    "robust_cov_type": "HC1",
}

# ----------------------------
# 3) Optional: VIF (on non-constant predictors)
# ----------------------------
vif_df = pd.DataFrame(
    {
        "variable": x_cols,
        "vif": [float(variance_inflation_factor(X_const.values, i + 1)) for i in range(len(x_cols))],
    }
)

# ----------------------------
# 4) Save promoted tables
# ----------------------------
os.makedirs(OUTPUT_DIR, exist_ok=True)
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)

coef_table_path = os.path.join(tables_dir, "ols_interaction_coefficients_hc1.csv")
coef_df.to_csv(coef_table_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_table_path,
    caption="OLS coefficients for asthma prevalence with interaction terms; inference uses heteroskedasticity-robust (HC1) standard errors.",
    role="promoted",
    columns=["variable", "coef", "std_err_hc1", "t_hc1", "p_value_hc1", "ci95_low_hc1", "ci95_high_hc1"],
)

diag_table_path = os.path.join(tables_dir, "ols_interaction_model_diagnostics.csv")
pd.DataFrame([diagnostics]).to_csv(diag_table_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=diag_table_path,
    caption="OLS model diagnostics for asthma prevalence interaction model (R², adjusted R², AIC/BIC, RMSE, and sample size).",
    role="promoted",
)

vif_table_path = os.path.join(tables_dir, "ols_interaction_vif.csv")
vif_df.to_csv(vif_table_path, index=False)
record_table(
    output_dir=OUTPUT_DIR,
    file_path=vif_table_path,
    caption="Variance inflation factors (VIF) for predictors in the asthma prevalence interaction model.",
    role="intermediate",
    columns=["variable", "vif"],
)

# ----------------------------
# 5) Primary output JSON
# ----------------------------
result = {
    "model": "OLS",
    "dependent_variable": y_col,
    "predictors": x_cols,
    "robust_standard_errors": {"type": "HC1"},
    "diagnostics": diagnostics,
    "coefficients": coef_df.to_dict(orient="records"),
    "vif": vif_df.to_dict(orient="records"),
}

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
with open(OUTPUT_NODE_PATH, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2)