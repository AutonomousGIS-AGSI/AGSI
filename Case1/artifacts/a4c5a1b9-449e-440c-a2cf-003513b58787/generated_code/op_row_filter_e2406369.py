import os
import pandas as pd

# Paths
INPUT_PATH = "/bigdata/s0/tea5209/AGM/outputs/DataRetrieverOutput/PM2.5_Annual_California_2019.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/pm25_2019_annual_records.csv"
OUTPUT_DIR = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787"

# Load
df = pd.read_csv(INPUT_PATH, dtype=str)

# Filter (columns confirmed by get_columns)
mask = (df["year"].astype(str).str.strip() == "2019") & (
    df["pollutant_standard"].astype(str).str.strip() == "PM25 Annual 2006"
)

out_df = df.loc[mask, ["state_code", "county_code", "site_number", "arithmetic_mean"]].copy()

# Save
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
out_df.to_csv(OUTPUT_PATH, index=False)

# Record artifact (intermediate dataset)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="Filtered PM2.5 annual 2019 records for California under the 'PM25 Annual 2006' standard, retaining site identifiers and arithmetic mean.",
    viz_hint={"type": "table"},
    role="intermediate",
)