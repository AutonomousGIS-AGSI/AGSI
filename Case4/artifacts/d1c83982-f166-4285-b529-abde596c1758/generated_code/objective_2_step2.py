# objective_2 step 2: Integrate demographic variables with existing spatial and health data using GEOID
# status: error
# recorded error: "GEOID missing in filtered_ACS_vars.csv (available: ['med_income', 'ratio_black', 'ratio_black.1', 'ratio_asian', 'ratio_hispanic', 'ratio_other_race'])"

import os
import pandas as pd
import geopandas as gpd

# Define input/output paths
merged_tract_path = "/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/merged_tract_data.csv"
acs_path = "/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/filtered_ACS_vars.csv"
output_path = "/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/final_analysis_dataset.gpkg"

# Load datasets
merged_tract = pd.read_csv(merged_tract_path)
acs = pd.read_csv(acs_path)

# Check for required join key in both datasets
if 'GEOID' not in merged_tract.columns or 'GEOID' not in acs.columns:
    missing_in_tract = 'GEOID' not in merged_tract.columns
    missing_in_acs = 'GEOID' not in acs.columns
    missing_info = []
    if missing_in_tract:
        missing_info.append("GEOID missing in merged_tract_data.csv")
    if missing_in_acs:
        missing_info.append(f"GEOID missing in filtered_ACS_vars.csv (available: {acs.columns.tolist()})")
    raise KeyError("; ".join(missing_info))

# Ensure string type for join keys
merged_tract['GEOID'] = merged_tract['GEOID'].astype(str)
acs['GEOID'] = acs['GEOID'].astype(str)

# Merge datasets
merged = merged_tract.merge(acs, on='GEOID', how='left')

# Save final dataset
os.makedirs(os.path.dirname(output_path), exist_ok=True)
merged.to_file(output_path, driver='GPKG')