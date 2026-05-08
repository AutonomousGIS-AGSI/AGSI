import os
import numpy as np
import pandas as pd
import statsmodels.api as sm

# ----------------------------- Paths -----------------------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_pca.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/ols_ses_to_mobility_results.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4"

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)

# ----------------------------- Load ------------------------------------------
df = pd.read_csv(INPUT_PATH)

y_cols = ["mobility_PC1", "mobility_diversity"]
x_cols = [
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "percent_>=18",
    "percent_Black",
    "percent_Hispanic",
]

required_cols = set(y_cols + x_cols)
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available: {list(df.columns)}")

# Convert to numeric (inputs are object-typed)
for c in (y_cols + x_cols):
    df[c] = pd.to_numeric(df[c], errors="coerce")

# ----------------------------- Fit models ------------------------------------
def fit_ols_hc1(data: pd.DataFrame, y_col: str, x_cols_list: list[str]):
    model_df = data[[y_col] + x_cols_list].dropna().reset_index(drop=True)
    y = model_df[y_col].values
    X = sm.add_constant(model_df[x_cols_list], has_constant="add")
    res = sm.OLS(y, X).fit(cov_type="HC1")  # robust SE (HC1)
    return res

results = []
models = [
    ("OLS_1_mobility_PC1", "mobility_PC1"),
    ("OLS_2_mobility_diversity", "mobility_diversity"),
]

for model_name, y in models:
    res = fit_ols_hc1(df, y, x_cols)

    variables = list(res.params.index)  # includes 'const' + predictors
    for v in variables:
        results.append(
            {
                "model": model_name,
                "dependent": y,
                "variable": v,
                "coef": float(res.params[v]),
                "std_err_HC1": float(res.bse[v]),
                "t_stat": float(res.tvalues[v]),
                "p_value": float(res.pvalues[v]),
                "r_squared": float(res.rsquared),
                "adj_r_squared": float(res.rsquared_adj),
                "n_obs": int(res.nobs),
            }
        )

results_df = pd.DataFrame(results)

# ----------------------------- Save outputs ----------------------------------
# Primary output (node path)
results_df.to_csv(OUTPUT_NODE_PATH, index=False)

# Manuscript-ready table copy
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "ols_ses_to_mobility_results.csv")
results_df.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption=(
        "OLS regression results with HC1 robust standard errors for mobility_PC1 and "
        "mobility_diversity as functions of SES and demographic covariates."
    ),
    role="promoted",
    columns=[
        "model",
        "dependent",
        "variable",
        "coef",
        "std_err_HC1",
        "t_stat",
        "p_value",
        "r_squared",
        "adj_r_squared",
        "n_obs",
    ],
)