raise FileNotFoundError(
        "Required input 'final_analysis_dataset.gpkg' not found. "
        "Available datasets lack required columns 'hazard_meters' "
        "and 'asthma_prevalence_rate'"
    )