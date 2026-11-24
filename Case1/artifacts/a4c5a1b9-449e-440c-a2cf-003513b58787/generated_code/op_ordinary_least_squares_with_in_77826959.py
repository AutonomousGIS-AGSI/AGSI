import os
import numpy as np
import pandas as pd
import geopandas as gpd
import statsmodels.api as sm

# Pre-imported helper (provided by the system)
# record_table(...)

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_urbanrural_interaction_2019.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ols_pm25_gini_metro_interaction_2019.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# -----------------------------
# 1) Load & basic geometry QA
# -----------------------------
gdf = gpd.read_file(INPUT_PATH)
gdf = gdf[gdf.geometry.notnull()]
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

y_col = "pm25_mean_2019"
x_cols = ["B19083_001E:Gini Index", "Metro2013", "gini_x_metro"]

# Ensure numeric types for modeling
for c in [y_col] + x_cols:
    gdf[c] = pd.to_numeric(gdf[c], errors="coerce")

df = gdf.dropna(subset=[y_col] + x_cols).copy()

# -----------------------------
# 2) Fit OLS
# -----------------------------
y = df[y_col].values.astype(float)
X = df[x_cols].values.astype(float)
X = sm.add_constant(X, has_constant="add")

model = sm.OLS(y, X).fit()

# -----------------------------
# 3) Coefficient table (coef, SE, p-value)
# -----------------------------
conf_int = model.conf_int()
coef_df = pd.DataFrame(
    {
        "variable": ["const"] + x_cols,
        "coef": model.params,
        "std_err": model.bse,
        "p_value": model.pvalues,
        "ci_low_95": conf_int[:, 0],
        "ci_high_95": conf_int[:, 1],
    }
)

# Primary output (as requested)
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
coef_df.to_csv(OUTPUT_PATH, index=False)

# Manuscript-ready table artifact
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "ols_pm25_gini_metro_interaction_2019_coefficients.csv")
coef_df.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="OLS coefficient table for PM2.5 (2019) regressed on Gini Index, Metro2013, and their interaction (gini_x_metro).",
    role="promoted",
    columns=["variable", "coef", "std_err", "p_value", "ci_low_95", "ci_high_95"],
)

# Optional: print summary to logs for traceability
print(model.summary())
print("\nSaved primary coefficients table to:", OUTPUT_PATH)
print("Saved manuscript-ready coefficients table to:", table_path)