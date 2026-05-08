# Influence of Proximity to Hazardous Waste Facilities on Asthma Prevalence in North Carolina

## Research Question
How does proximity to hazardous waste facilities influence spatial patterns of asthma prevalence across census tracts of North Carolina, and how do these relationships vary spatially by socioeconomic and demographic context?

## Objectives

1. **Assess whether asthma prevalence is spatially clustered across North Carolina census tracts and whether hazardous-waste proximity aligns with high-asthma clusters**
   - Hypothesis: Census tracts with smaller nearest-site distance to hazardous waste facilities and/or larger hazardous-waste facility counts within 5000 meters have higher Asthma_prev and are overrepresented in statistically significant high-asthma clusters.
   - Steps:
     a. Reproject NC_tract to a common projected CRS in meters suitable for distance calculations while preserving GEOID.
     b. Reproject NC_HW_sites to the same projected CRS used for nc_tract_projected.gpkg while preserving SITE_NAME.
     c. Compute tract centroids from nc_tract_projected.gpkg and retain GEOID for each centroid feature.
     d. For each GEOID, compute nearest_hw_dist_m as the Euclidean distance in meters from the tract centroid to the nearest hazardous waste facility point and compute hw_count_5km as the count of hazardous waste facility points within 5000 meters of the centroid.
     e. Left-join tract_proximity_metrics.csv to NC_PLACES on GEOID and retain GEOID, Asthma_prev, nearest_hw_dist_m, and hw_count_5km.
     f. Join asthma_proximity.csv to nc_tract_projected.gpkg by GEOID to create tract polygons with attributes Asthma_prev, nearest_hw_dist_m, and hw_count_5km.
     g. Compute Global Moran’s I for Asthma_prev using queen contiguity weights defined on tract polygons and permutation-based p-values.
     h. Compute Getis-Ord Gi* for Asthma_prev using queen contiguity weights on tract polygons and write Gi* z-scores and p-value-based significance class per GEOID.
     i. Using asthma_hotspots.gpkg, subset tracts to statistically significant hotspots for Asthma_prev (Gi* p < 0.05 and positive Gi* z-score) versus all other tracts, then compare nearest_hw_dist_m and hw_count_5km distributions between groups using Mann–Whitney U tests.

2. **Estimate how the hazardous-waste proximity–asthma association varies by socioeconomic and demographic context and whether the association is spatially non-stationary**
   - Hypothesis: After adjustment for tract context, the association between hazardous waste proximity and Asthma_prev is stronger in tracts with higher ratio_poverty, higher ratio_uninsured, and higher ratio_black, and the proximity effect varies across space.
   - Steps:
     a. Left-join NC_ACS_data to asthma_proximity.csv on GEOID and retain GEOID, Asthma_prev, nearest_hw_dist_m, hw_count_5km, ratio_poverty, ratio_uninsured, med_income, ratio_black, and ratio_hispanic.
     b. Filter tract_asthma_prox_acs.csv to rows with non-missing values for Asthma_prev, nearest_hw_dist_m, ratio_poverty, ratio_uninsured, med_income, ratio_black, and ratio_hispanic.
     c. Create ln_nearest_hw_dist_m = ln(nearest_hw_dist_m + 1), create z_ratio_poverty, z_ratio_uninsured, z_med_income, z_ratio_black, and z_ratio_hispanic as z-scores of ratio_poverty, ratio_uninsured, med_income, ratio_black, and ratio_hispanic, and create interaction terms ln_nearest_hw_dist_m_x_z_ratio_poverty = ln_nearest_hw_dist_m * z_ratio_poverty and ln_nearest_hw_dist_m_x_z_ratio_black = ln_nearest_hw_dist_m * z_ratio_black.
     d. Fit an ordinary least squares model with dependent variable Asthma_prev and predictors ln_nearest_hw_dist_m, z_ratio_poverty, z_ratio_uninsured, z_med_income, z_ratio_black, z_ratio_hispanic, ln_nearest_hw_dist_m_x_z_ratio_poverty, and ln_nearest_hw_dist_m_x_z_ratio_black, and report heteroskedasticity-robust (HC) standard errors.
     e. Join centroid coordinates from nc_tract_centroids.gpkg to tract_modeling_features.csv by GEOID and write numeric x and y coordinate columns named x and y.
     f. Compute variance inflation factors (VIF) for each predictor variable in the GWR predictor set (ln_nearest_hw_dist_m, z_ratio_poverty, z_ratio_uninsured, z_med_income, z_ratio_black, z_ratio_hispanic) prior to fitting the geographically weighted regression.
     g. Fit a geographically weighted regression using an adaptive bandwidth selected by minimizing AICc and a bisquare kernel with dependent variable Asthma_prev and predictors ln_nearest_hw_dist_m, z_ratio_poverty, z_ratio_uninsured, z_med_income, z_ratio_black, and z_ratio_hispanic, and output per-GEOID local coefficients and local R2.
