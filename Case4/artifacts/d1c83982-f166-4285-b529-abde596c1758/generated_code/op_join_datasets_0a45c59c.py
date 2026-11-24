```python
# Raise KeyError because filtered_ACS_vars.csv is missing GEOID join column
import os

raise KeyError(
    "Missing GEOID column in filtered_ACS_vars.csv. "
    "Required columns for integration: GEOID not found in ACS demographic data."
)