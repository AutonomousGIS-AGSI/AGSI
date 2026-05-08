import os
import numpy as np
import pandas as pd
import statsmodels.api as sm

# Helpers are pre-imported in the environment:
# record_table

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_pca.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/mediator_model_results.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4"

# -----------------------
# 1) Load + validate cols
# -----------------------
df = pd.read_csv(INPUT_PATH, dtype={"GEOID": "string"})

y_col = "mobility_PC1"
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

required_cols = ["GEOID", y_col] + x_cols
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise KeyError(
        f"Missing required columns: {missing}. Available columns: {list(df.columns)}"
    )

# -----------------------
# 2) Clean / coerce types
# -----------------------
for c in [y_col] + x_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

model_df = df[required_cols].dropna(subset=[y_col] + x_cols).copy()
if model_df.shape[0] < (len(x_cols) + 2):
    raise ValueError(
        f"Not enough complete cases to fit model. "
        f"n_complete={model_df.shape[0]}, predictors={len(x_cols)}"
    )

# -----------------------
# 3) Fit OLS with HC1 SEs
# -----------------------
y = model_df[y_col].to_numpy(dtype=float)
X = model_df[x_cols].to_numpy(dtype=float)
X = sm.add_constant(X, has_constant="add")

ols = sm.OLS(y, X).fit(cov_type="HC1")

# -----------------------
# 4) Save coefficients table (manuscript-ready)
# -----------------------
coef_names = ["const"] + x_cols
conf_int = ols.conf_int()
coef_df = pd.DataFrame(
    {
        "variable": coef_names,
        "coef": ols.params,
        "std_err_HC1": ols.bse,
        "t_HC1": ols.tvalues,
        "p_value_HC1": ols.pvalues,
        "ci95_low_HC1": conf_int[:, 0],
        "ci95_high_HC1": conf_int[:, 1],
    }
)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
coef_path = os.path.join(tables_dir, "mediator_model_coefficients_hc1.csv")
coef_df.to_csv(coef_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_path,
    caption=(
        "OLS mediator model coefficients with HC1 robust standard errors for "
        "mobility_PC1 regressed on SES and demographic covariates."
    ),
    role="promoted",
    columns=[
        "variable",
        "coef",
        "std_err_HC1",
        "t_HC1",
        "p_value_HC1",
        "ci95_low_HC1",
        "ci95_high_HC1",
    ],
)

# -----------------------
# 5) Save fitted values per GEOID (primary output)
# -----------------------
model_df["mobility_PC1_fitted"] = ols.fittedvalues
model_df["mobility_PC1_residual"] = ols.resid

out_df = model_df[["GEOID", "mobility_PC1", "mobility_PC1_fitted", "mobility_PC1_residual"]].copy()

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
out_df.to_csv(OUTPUT_NODE_PATH, index=False)