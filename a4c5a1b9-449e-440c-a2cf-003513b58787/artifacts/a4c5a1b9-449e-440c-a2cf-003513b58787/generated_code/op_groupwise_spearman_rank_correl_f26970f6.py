import os
import pandas as pd
import geopandas as gpd
from scipy.stats import spearmanr

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_urbanrural_2019.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_gini_spearman_by_metro_2019.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

# ---- Load -----------------------------------------------------------------
gdf = gpd.read_file(INPUT_PATH)

# Validate geometry (rule), though not used in correlation
if "geometry" in gdf.columns:
    gdf = gdf[gdf.geometry.notna()]
    gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty]

x_col = "pm25_mean_2019"
y_col = "B19083_001E:Gini Index"
group_col = "Metro2013"

needed = [x_col, y_col, group_col]
missing = [c for c in needed if c not in gdf.columns]
if missing:
    raise KeyError(f"Missing columns: {missing}. Available columns: {list(gdf.columns)}")

# ---- Prep: cast to numeric, pairwise drop NAs -----------------------------
df = gdf[[group_col, x_col, y_col]].copy()
df[group_col] = pd.to_numeric(df[group_col], errors="coerce")
df[x_col] = pd.to_numeric(df[x_col], errors="coerce")
df[y_col] = pd.to_numeric(df[y_col], errors="coerce")

rows = []
for metro_val, label in [(1, "metro"), (0, "nonmetro")]:
    sub = df[df[group_col] == metro_val].copy()
    sub = sub.dropna(subset=[x_col, y_col])
    n = len(sub)

    if n < 2:
        rho, pval = float("nan"), float("nan")
    else:
        rho, pval = spearmanr(sub[x_col], sub[y_col])

    rows.append(
        {
            "group": label,
            "Metro2013": int(metro_val),
            "n": int(n),
            "x": x_col,
            "y": y_col,
            "spearman_rho": float(rho) if pd.notna(rho) else float("nan"),
            "spearman_p": float(pval) if pd.notna(pval) else float("nan"),
        }
    )

out_df = pd.DataFrame(rows)
out_df.to_csv(OUTPUT_PATH, index=False)

# Manuscript artifact (table)
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "pm25_gini_spearman_by_metro_2019.csv")
out_df.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Spearman rank correlation between 2019 county PM2.5 and Gini Index, stratified by Metro2013 status, with sample sizes.",
    role="final",
    columns=["group", "Metro2013", "n", "spearman_rho", "spearman_p", "x", "y"],
)