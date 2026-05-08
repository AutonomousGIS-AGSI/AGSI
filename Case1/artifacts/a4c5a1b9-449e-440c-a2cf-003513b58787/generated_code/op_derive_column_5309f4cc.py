import os
import pandas as pd

INPUT_PATH = "/bigdata/s0/tea5209/AGM/outputs/DataRetrieverOutput/California_UrbanRural_Classification_2019.csv"
OUTPUT_PATH = "/bigdata/s0/tea5209/AGM/Outputs/a4c5a1b9-449e-440c-a2cf-003513b58787/urban_rural_with_geoid.csv"
OUTPUT_DIR = os.path.dirname(OUTPUT_PATH)

# --- Load -----------------------------------------------------------------
df = pd.read_csv(INPUT_PATH)

# --- Create GEOID (county GEOID: 5-char, zero-padded) ---------------------
if "FIPSTXT" not in df.columns:
    raise KeyError(f"Missing required column 'FIPSTXT'. Available columns: {list(df.columns)}")

df["GEOID"] = df["FIPSTXT"].astype(str).str.strip().str.zfill(5)

# --- Keep only requested fields ------------------------------------------
keep_cols = ["GEOID", "Metro2013", "Nonmetro2013", "RuralUrbanContinuumCode2013"]
missing = [c for c in keep_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing required columns: {missing}. Available columns: {list(df.columns)}")

out_df = df[keep_cols].copy()

# --- Save -----------------------------------------------------------------
os.makedirs(OUTPUT_DIR, exist_ok=True)
out_df.to_csv(OUTPUT_PATH, index=False)

# Manuscript artifact logging (intermediate dataset)
record_data_to_viz(
    output_dir=OUTPUT_DIR,
    file_path=OUTPUT_PATH,
    caption="County-level urban–rural classification fields with standardized 5-character county GEOID.",
    viz_hint={"type": "table"},
    role="intermediate",
)