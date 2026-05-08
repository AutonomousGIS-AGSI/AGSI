import os
import numpy as np
import pandas as pd
import statsmodels.api as sm

# Pre-imported helpers (per system)
# record_table, record_figure, record_data_to_viz

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_mobility_pca.csv"
OUTPUT_NODE_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/mediation_effects_bootstrap.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4"

os.makedirs(os.path.dirname(OUTPUT_NODE_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -----------------------------
# 1) Load + clean
# -----------------------------
df = pd.read_csv(INPUT_PATH)

y_col = "Depression_prev"
m_col = "mobility_PC1"

ses_vars = [
    "Med_income",
    "percent_Poverty",
    "percent_Unemployed",
    "percent_Uninsured",
    "percent_>=HighSch",
]
covars = ["percent_>=18", "percent_Black", "percent_Hispanic"]

needed_cols = [y_col, m_col] + ses_vars + covars
missing = [c for c in needed_cols if c not in df.columns]
if missing:
    raise KeyError(
        f"Missing required columns: {missing}. Available columns: {list(df.columns)}"
    )

# Convert to numeric
for c in needed_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

# Drop rows with missing in any modeling variable
df_model = df.dropna(subset=needed_cols).reset_index(drop=True)
n = len(df_model)
if n < 10:
    raise ValueError(f"Too few complete cases after dropna: n={n}")

# -----------------------------
# 2) Model-fitting utilities
# -----------------------------
def fit_ols(endog, exog_df):
    X = sm.add_constant(exog_df, has_constant="add")
    model = sm.OLS(endog, X).fit()
    return model

def mediation_effects_from_models(mediator_model, outcome_model, x_var, mediator_var):
    """
    ACME (indirect) = a * b
      a: coef of x_var in mediator model
      b: coef of mediator_var in outcome model
    ADE (direct) = c' = coef of x_var in outcome model
    Total = ACME + ADE
    """
    a = mediator_model.params.get(x_var, np.nan)
    b = outcome_model.params.get(mediator_var, np.nan)
    ade = outcome_model.params.get(x_var, np.nan)
    acme = a * b
    total = acme + ade
    return acme, ade, total

# -----------------------------
# 3) Point estimates (original sample)
# -----------------------------
mediator_exog_cols = ses_vars + covars
outcome_exog_cols = ses_vars + [m_col] + covars

med_model = fit_ols(df_model[m_col], df_model[mediator_exog_cols])
out_model = fit_ols(df_model[y_col], df_model[outcome_exog_cols])

point_rows = []
for x in ses_vars:
    acme, ade, total = mediation_effects_from_models(med_model, out_model, x, m_col)
    point_rows.extend(
        [
            {"variable": x, "effect": "ACME", "estimate": float(acme)},
            {"variable": x, "effect": "ADE", "estimate": float(ade)},
            {"variable": x, "effect": "Total", "estimate": float(total)},
        ]
    )
point_df = pd.DataFrame(point_rows)

# -----------------------------
# 4) Bootstrap
# -----------------------------
B = 5000  # adjust if runtime is a concern
seed = 12345
rng = np.random.default_rng(seed)

boot_records = []
idx = np.arange(n)

for b in range(B):
    samp_idx = rng.choice(idx, size=n, replace=True)
    d = df_model.iloc[samp_idx].reset_index(drop=True)

    # Refit models
    med_b = fit_ols(d[m_col], d[mediator_exog_cols])
    out_b = fit_ols(d[y_col], d[outcome_exog_cols])

    for x in ses_vars:
        acme, ade, total = mediation_effects_from_models(med_b, out_b, x, m_col)
        boot_records.append({"bootstrap": b, "variable": x, "effect": "ACME", "value": acme})
        boot_records.append({"bootstrap": b, "variable": x, "effect": "ADE", "value": ade})
        boot_records.append({"bootstrap": b, "variable": x, "effect": "Total", "value": total})

boot_df = pd.DataFrame(boot_records).dropna(subset=["value"]).reset_index(drop=True)

# Percentile CIs
alpha = 0.05
lo_q, hi_q = alpha / 2, 1 - alpha / 2

summ_rows = []
for x in ses_vars:
    for eff in ["ACME", "ADE", "Total"]:
        vals = boot_df.loc[(boot_df["variable"] == x) & (boot_df["effect"] == eff), "value"].to_numpy()
        if vals.size == 0:
            ci_low = np.nan
            ci_high = np.nan
            boot_mean = np.nan
        else:
            ci_low = float(np.quantile(vals, lo_q))
            ci_high = float(np.quantile(vals, hi_q))
            boot_mean = float(np.mean(vals))

        point_est = point_df.loc[(point_df["variable"] == x) & (point_df["effect"] == eff), "estimate"]
        point_est = float(point_est.iloc[0]) if len(point_est) else np.nan

        summ_rows.append(
            {
                "variable": x,
                "effect": eff,
                "estimate": point_est,
                "bootstrap_mean": boot_mean,
                "ci_low": ci_low,
                "ci_high": ci_high,
                "n_complete_cases": int(n),
                "n_bootstrap": int(B),
                "seed": int(seed),
                "ci_method": "percentile",
            }
        )

summary_df = pd.DataFrame(summ_rows)

# -----------------------------
# 5) Save outputs
# -----------------------------
summary_df.to_csv(OUTPUT_NODE_PATH, index=False)

tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "mediation_effects_bootstrap.csv")
summary_df.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Bootstrap mediation effects (ACME, ADE, Total) of socioeconomic variables on depression prevalence via mobility_PC1, with percentile 95% confidence intervals.",
    role="promoted",
    columns=list(summary_df.columns),
)