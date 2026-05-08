import os
import json
import warnings

import numpy as np
import pandas as pd
import geopandas as gpd

from scipy.stats import mannwhitneyu
import matplotlib.pyplot as plt

# Pre-imported in the environment per instructions:
# record_figure, record_table, record_data_to_viz

INPUT_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/asthma_hotspots.gpkg"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/c52bc37f-8e66-4df1-b20b-57c92bbd2311/hotspot_proximity_comparison.json"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)
os.makedirs(OUTPUT_DIR, exist_ok=True)

warnings.filterwarnings("ignore", category=UserWarning)

# ----------------------------
# Load data (handle multi-layer geopackage)
# ----------------------------
layer_to_read = None
try:
    import fiona
    layers = fiona.listlayers(INPUT_GPKG)
    if len(layers) == 0:
        raise ValueError("No layers found in the GeoPackage.")
    layer_to_read = layers[0]
except Exception:
    layer_to_read = None  # geopandas will try default

gdf = gpd.read_file(INPUT_GPKG, layer=layer_to_read) if layer_to_read else gpd.read_file(INPUT_GPKG)

# Validate geometry as required (even though not used for tests)
gdf = gdf[gdf.geometry.notna()]
gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

# ----------------------------
# Subset to hotspots vs non-hotspots
# Hotspot definition: GiP < 0.05 AND GiZ > 0
# ----------------------------
required_cols = ["GiP", "GiZ", "nearest_hw_dist_m", "hw_count_5km"]
missing = [c for c in required_cols if c not in gdf.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {list(gdf.columns)}")

df = gdf[required_cols].copy()

# Ensure numeric and handle nulls
for c in required_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df = df.dropna(subset=["GiP", "GiZ"]).copy()
df["is_hotspot"] = (df["GiP"] < 0.05) & (df["GiZ"] > 0)

# Prepare analysis subsets for each variable (drop nulls per variable)
def mannwhitney_summary(data: pd.DataFrame, value_col: str, group_col: str = "is_hotspot"):
    sub = data[[value_col, group_col]].dropna().copy()
    hotspot_vals = sub.loc[sub[group_col] == True, value_col].to_numpy()
    nonhot_vals = sub.loc[sub[group_col] == False, value_col].to_numpy()

    result = {
        "n_hotspot": int(hotspot_vals.size),
        "n_nonhotspot": int(nonhot_vals.size),
        "median_hotspot": float(np.nanmedian(hotspot_vals)) if hotspot_vals.size else None,
        "median_nonhotspot": float(np.nanmedian(nonhot_vals)) if nonhot_vals.size else None,
        "u_statistic": None,
        "p_value": None,
        "alternative": "two-sided",
    }

    if hotspot_vals.size == 0 or nonhot_vals.size == 0:
        return result

    # Mann–Whitney U test (two-sided)
    u = mannwhitneyu(hotspot_vals, nonhot_vals, alternative="two-sided", method="auto")
    result["u_statistic"] = float(u.statistic)
    result["p_value"] = float(u.pvalue)
    return result


results = {
    "hotspot_definition": {"GiP": "< 0.05", "GiZ": "> 0"},
    "overall_counts": {
        "n_total_valid_geom": int(len(gdf)),
        "n_total_with_GiP_GiZ": int(len(df)),
        "n_hotspot": int(df["is_hotspot"].sum()),
        "n_nonhotspot": int((~df["is_hotspot"]).sum()),
    },
    "tests": {
        "nearest_hw_dist_m": mannwhitney_summary(df, "nearest_hw_dist_m"),
        "hw_count_5km": mannwhitney_summary(df, "hw_count_5km"),
    },
}

# ----------------------------
# Save primary output JSON
# ----------------------------
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

# ----------------------------
# Secondary output: comparative boxplots (optional manuscript artifact)
# ----------------------------
plot_df = df[["is_hotspot", "nearest_hw_dist_m", "hw_count_5km"]].copy()
plot_df["Group"] = np.where(plot_df["is_hotspot"], "Hotspot (GiP<0.05, GiZ>0)", "Other tracts")

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# nearest_hw_dist_m
tmp = plot_df[["Group", "nearest_hw_dist_m"]].dropna()
axes[0].boxplot(
    [tmp.loc[tmp["Group"].str.startswith("Hotspot"), "nearest_hw_dist_m"].to_numpy(),
     tmp.loc[~tmp["Group"].str.startswith("Hotspot"), "nearest_hw_dist_m"].to_numpy()],
    tick_labels=["Hotspot", "Other"],
    showfliers=False,
)
axes[0].set_title("Nearest HW distance (m)")
axes[0].set_ylabel("nearest_hw_dist_m")

# hw_count_5km
tmp = plot_df[["Group", "hw_count_5km"]].dropna()
axes[1].boxplot(
    [tmp.loc[tmp["Group"].str.startswith("Hotspot"), "hw_count_5km"].to_numpy(),
     tmp.loc[~tmp["Group"].str.startswith("Hotspot"), "hw_count_5km"].to_numpy()],
    tick_labels=["Hotspot", "Other"],
    showfliers=False,
)
axes[1].set_title("HW count within 5 km")
axes[1].set_ylabel("hw_count_5km")

plt.tight_layout()
fig_path = os.path.join(OUTPUT_DIR, "hotspot_vs_nonhotspot_proximity_boxplots.png")
plt.savefig(fig_path, dpi=200, bbox_inches="tight")
plt.close()

record_figure(
    output_dir=OUTPUT_DIR,
    file_path=fig_path,
    caption="Boxplots comparing nearest hardware distance and hardware counts within 5 km between significant asthma hotspots (Gi* p<0.05, z>0) and all other tracts.",
    role="promoted",
    objective_key="objective_1",
    step_index=1,
)