# The required input file 'final_analysis_dataset.gpkg' does not exist in the data registry
# Available datasets: NC_ACS_data.csv, NC_HW_sites.gpkg, NC_PLACES.csv, NC_tract.gpkg, etc.
# None of the listed datasets contain columns 'hazard_meters' or 'asthma_prevalence_rate'

raise FileNotFoundError(
    "Required input 'final_analysis_dataset.gpkg' not found. "
    "Available datasets lack required columns 'hazard_meters' and 'asthma_prevalence_rate'"
)