import os
import numpy as np
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_ses_depression_visits.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/124e6b8e-ad5a-49f9-802e-87cc5101dda4/county_visitation_shares.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Load
df = pd.read_csv(INPUT_PATH, dtype={"GEOID": "string"})

# Required visit columns (confirmed via get_columns)
visit_cols = [
    "Full_Service_Restaurant",
    "Sport_facilities",
    "Parks",
    "Fastfood_Restaurant",
    "Convenience",
    "Supermarket",
    "Warehouse",
    "Fruit",
    "TobaccoStore",
    "DrinkingPlaces",
]

missing = [c for c in visit_cols if c not in df.columns]
if missing:
    raise KeyError(
        f"Missing required columns: {missing}. Available columns: {list(df.columns)}"
    )

# Coerce visit columns to numeric; treat non-numeric as NaN then fill with 0
for c in visit_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

# Compute total visits
df["total_visits"] = df[visit_cols].sum(axis=1)

# Compute shares; set to 0 where total_visits == 0
total = df["total_visits"].to_numpy(dtype=float)
denom = np.where(total > 0, total, np.nan)

for c in visit_cols:
    share_col = f"share_{c}"
    df[share_col] = (df[c].to_numpy(dtype=float) / denom)
    df[share_col] = df[share_col].fillna(0.0)

# Save output
df.to_csv(OUTPUT_PATH, index=False)

# Record as a data-to-viz artifact (normalized composition columns for potential plotting)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="County-level total visits and visitation composition shares by POI category.",
    viz_hint={"type": "table"},
    role="intermediate",
)