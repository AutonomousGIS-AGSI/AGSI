# Required input dataset not found in registry
# Available datasets lack required columns 'hazard_meters' and 'asthma_prevalence_rate'

raise FileNotFoundError(
    "Required input 'final_analysis_dataset.gpkg' not found. "
    "Available datasets lack required columns 'hazard_meters' "
    "and 'asthma_prevalence_rate'"
)