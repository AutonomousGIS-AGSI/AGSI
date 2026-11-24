# objective_1 step 3: Join tract hazard distances with asthma prevalence data using GEOID
# status: completed

import pandas as pd
import os

# Load the two input datasets
tract_hazard_df = pd.read_csv('/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/tract_hazard_distance.csv')
nc_places_df = pd.read_csv('/bigdata/s0/tea5209/AGM/WebUI/uploads/d1c83982-f166-4285-b529-abde596c1758/NC_PLACES.csv')

# Merge on the GEOID key (inner join by default)
merged_df = pd.merge(
    tract_hazard_df,
    nc_places_df[['GEOID', 'Asthma_prev']],
    on='GEOID',
    how='inner'
)

# Save to output path
output_path = '/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/merged_tract_data.csv'
os.makedirs(os.path.dirname(output_path), exist_ok=True)
merged_df.to_csv(output_path, index=False)

# Record artifact as promoted dataset for methods section
record_table(
    output_dir='/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758',
    file_path=output_path,
    caption="Joined tract hazard distances and asthma prevalence data by GEOID",
    role='promoted',
    columns=['GEOID', 'distance_meters', 'Asthma_prev']
)