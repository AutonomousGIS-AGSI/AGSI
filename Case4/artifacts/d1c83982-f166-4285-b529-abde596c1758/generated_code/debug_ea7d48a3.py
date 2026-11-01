import pandas as pd
import os

# Load data to check column presence
acs_df = pd.read_csv("/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/filtered_ACS_vars.csv")

# Verify GEOID column exists (original line kept for traceability)
if 'GEOID' not in acs_df.columns:
    raise KeyError("Missing GEOID column in filtered_ACS_vars.csv")

# If no error raised, continue with actual integration logic
acs_df.to_file(os.path.join(OUTPUT_DIR, "final_analysis_dataset.gpkg"), driver="GPKG")