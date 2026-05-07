import os
import numpy as np
import pandas as pd
import statsmodels.api as sm

# Pre-imported helpers (per system): record_table, record_figure, record_data_to_viz

# -----------------------------
# Paths (fixed by instruction)
# -----------------------------
INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_pca.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/outcome_model_results.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_NODE_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------------
# Load data
# -----------------------------
df = pd.read_csv(INPUT_PATH)

# -----------------------------
# Model specification
# Depression_prev ~ Med_income + percent_Poverty + percent_Unemployed + percent_Uninsured
#   + percent_>=HighSch + mobility_PC1 + percent_>=18 + percent_Black + percent_Hispanic
# -----------------------------
y_col = "Depression_prev"
x_cols = [
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
    "mobility_PC1",
    "percent_>=18",
    "percent_Black",
    "percent_Hispanic",
]

required_cols = ["GEOID", y_col] + x_cols
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {list(df.columns)}")

# Cast to numeric (all are object per schema) and drop rows with any NA in model vars
for c in [y_col] + x_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

model_df = df[required_cols].copy()
model_df["GEOID"] = model_df["GEOID"].astype(str)

model_df = model_df.dropna(subset=[y_col] + x_cols).reset_index(drop=True)
if model_df.shape[0] < (len(x_cols) + 2):
    raise ValueError(
        f"Not enough complete observations to fit model. n={model_df.shape[0]}, k={len(x_cols)}"
    )

y = model_df[y_col].values
X = model_df[x_cols]
X = sm.add_constant(X, has_constant="add")

# -----------------------------
# Fit OLS with HC1 robust SE
# -----------------------------
ols = sm.OLS(y, X).fit(cov_type="HC1")

# -----------------------------
# Save coefficients table (manuscript-ready)
# -----------------------------
coef_names = list(ols.params.index) if hasattr(ols.params, "index") else ["const"] + x_cols
conf_int = ols.conf_int()
coef_df = pd.DataFrame(
    {
        "variable": coef_names,
        "coef": np.asarray(ols.params),
        "std_err_hc1": np.asarray(ols.bse),
        "t_hc1": np.asarray(ols.tvalues),
        "p_value_hc1": np.asarray(ols.pvalues),
        "ci_low_hc1": np.asarray(conf_int)[:, 0],
        "ci_high_hc1": np.asarray(conf_int)[:, 1],
    }
)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
coef_path = os.path.join(tables_dir, "outcome_model_coefficients_hc1.csv")
coef_df.to_csv(coef_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=coef_path,
    caption="OLS outcome model coefficients with HC1 robust standard errors for county-level depression prevalence.",
    role="promoted",
    columns=list(coef_df.columns),
)

# -----------------------------
# Save residuals per GEOID (primary output)
# -----------------------------
model_df["outcome_fitted"] = np.asarray(ols.fittedvalues)
model_df["outcome_residual"] = np.asarray(ols.resid)

out_df = model_df[["GEOID", y_col, "outcome_fitted", "outcome_residual"]].copy()

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
out_df.to_csv(OUTPUT_NODE_PATH, index=False)