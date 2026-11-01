import pandas as pd
import os

# Define input and output paths
input_path = "/bigdata/s0/tea5209/AGM/WebUI/uploads/d1c83982-f166-4285-b529-abde596c1758/NC_ACS_data.csv"
output_path = "/bigdata/s0/tea5209/AGM/Outputs/d1c83982-f166-4285-b529-abde596c1758/filtered_ACS_vars.csv"

# Ensure output directory exists
os.makedirs(os.path.dirname(output_path), exist_ok=True)

# Read data and select socioeconomic variables
df = pd.read_csv(input_path)
selected_columns = ['median_household_income', 'percent_minority', 'percent_children']
filtered_df = df[selected_columns]

# Save result
filtered_df.to_csv(output_path, index=False)