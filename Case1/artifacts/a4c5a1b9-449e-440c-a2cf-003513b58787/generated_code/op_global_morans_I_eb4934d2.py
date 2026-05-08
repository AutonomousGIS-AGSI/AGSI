import os
import warnings

import geopandas as gpd
import numpy as np
import pandas as pd
from esda.moran import Moran
from libpysal.weights import Queen

# ---------------------------
# Paths
# ---------------------------
RESID_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/counties_pm25_gini_2019_olsresid.gpkg"
WQ_GPKG = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ca_county_queen_weights_2019.gpkg"

OUT_CSV = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/ols_residuals_moransI_2019.csv"
OUTPUT_DIR = os.path.dirname(OUT_CSV)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------
# Load data
# ---------------------------
resid_gdf = gpd.read_file(RESID_GPKG)
wgeom_gdf = gpd.read_file(WQ_GPKG)

# ---------------------------
# Basic geometry validation
# ---------------------------
resid_gdf = resid_gdf[resid_gdf.geometry.notna()]
resid_gdf = resid_gdf[resid_gdf.geometry.is_valid & ~resid_gdf.geometry.is_empty].copy()

wgeom_gdf = wgeom_gdf[wgeom_gdf.geometry.notna()]
wgeom_gdf = wgeom_gdf[wgeom_gdf.geometry.is_valid & ~wgeom_gdf.geometry.is_empty].copy()

# ---------------------------
# CRS harmonization (reproject weights geometry to match residuals)
# ---------------------------
if resid_gdf.crs is not None and wgeom_gdf.crs is not None and resid_gdf.crs != wgeom_gdf.crs:
    wgeom_gdf = wgeom_gdf.to_crs(resid_gdf.crs)

# ---------------------------
# Prepare analysis frame keyed by GEOID
# (Use weight geometry as the spatial support; attach residuals by GEOID)
# ---------------------------
resid_df = resid_gdf[["GEOID", "ols_residual_pm25"]].copy()
resid_df["GEOID"] = resid_df["GEOID"].astype(str)
wgeom_gdf = wgeom_gdf.copy()
wgeom_gdf["GEOID"] = wgeom_gdf["GEOID"].astype(str)

gdf = wgeom_gdf.merge(resid_df, on="GEOID", how="left")

# Drop missing residuals (and reset index BEFORE building weights)
gdf = gdf.dropna(subset=["ols_residual_pm25"]).reset_index(drop=True)

if len(gdf) == 0:
    raise ValueError("No rows available after dropping NA in 'ols_residual_pm25'.")

# Ensure numeric array
y = pd.to_numeric(gdf["ols_residual_pm25"], errors="coerce")
gdf = gdf.assign(ols_residual_pm25=y).dropna(subset=["ols_residual_pm25"]).reset_index(drop=True)
if len(gdf) == 0:
    raise ValueError("All values in 'ols_residual_pm25' became NA after numeric coercion.")

# ---------------------------
# Build Queen contiguity weights keyed by GEOID
# ---------------------------
w = Queen.from_dataframe(gdf, ids=gdf["GEOID"].tolist())

# Handle islands while preserving Queen contiguity requirement:
# drop islands and rebuild Queen weights on the remaining units
if getattr(w, "islands", None):
    islands = list(w.islands)
    if len(islands) > 0:
        warnings.warn(
            f"Queen weights contain {len(islands)} island(s). Dropping island GEOID(s) and rebuilding Queen weights."
        )
        gdf = gdf[~gdf["GEOID"].isin(islands)].reset_index(drop=True)
        if len(gdf) == 0:
            raise ValueError("All observations are islands under Queen contiguity; cannot compute Moran's I.")
        w = Queen.from_dataframe(gdf, ids=gdf["GEOID"].tolist())

w.transform = "r"

# ---------------------------
# Compute Global Moran's I (permutation inference)
# ---------------------------
mi = Moran(gdf["ols_residual_pm25"].to_numpy(dtype=float), w, permutations=999)

results = pd.DataFrame(
    [
        {
            "variable": "ols_residual_pm25",
            "morans_I": float(mi.I),
            "z_sim": float(mi.z_sim),
            "p_sim": float(mi.p_sim),
            "n": int(len(gdf)),
        }
    ]
)

# Primary output (as specified)
results.to_csv(OUT_CSV, index=False)

# Manuscript table copy (opt-in via tables/ directory) + record
tables_dir = os.path.join(OUTPUT_DIR, "tables")
os.makedirs(tables_dir, exist_ok=True)
table_path = os.path.join(tables_dir, "ols_residuals_moransI_2019.csv")
results.to_csv(table_path, index=False)

record_table(
    output_dir=OUTPUT_DIR,
    file_path=table_path,
    caption="Global Moran’s I (permutation-based) for spatial autocorrelation in OLS residuals of PM2.5 across California counties using Queen contiguity.",
    role="final",
    columns=["variable", "morans_I", "z_sim", "p_sim", "n"],
)