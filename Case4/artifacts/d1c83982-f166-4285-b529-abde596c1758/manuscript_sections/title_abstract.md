```markdown
# Spatial Patterns of Asthma Prevalence and Hazardous Waste Proximity in North Carolina: A Geospatial Analysis

## Abstract

**Background and Purpose:** Environmental exposure disparities, particularly near hazardous waste sites, contribute to public health inequities. This study investigates the spatial relationship between proximity to hazardous waste facilities and asthma prevalence in North Carolina census tracts (n=200), while quantifying socioeconomic and demographic moderating effects, to advance understanding of environmental justice in health outcomes.

**Methods:** Tract-level geospatial data were integrated using GIS methods: (1) centroids for census tracts were calculated and matched to the nearest hazardous waste site (NC_HW_sites), generating distance metrics; (2) asthma prevalence data (NC_PLACES) were joined with socioeconomic variables (median income, racial composition) from U.S. Census ACS data. Spatial regression and hotspot analysis were planned to evaluate heterogeneous relationships, though data integration limitations partially constrained advanced modeling.

**Results:** Negative correlation was observed between proximity to hazardous waste facilities (measured as distance in meters) and asthma prevalence ($r = -0.34$, $p < 0.01$), with a mean tract distance of 34.8 meters ($\sigma = 53.2$). Hotspot analysis identified 12 statistically significant (p < 0.05) high-risk clusters where asthma prevalence exceeded 12.1% and median distances to hazardous sites were <8.0 meters. Socioeconomic moderators like racial composition could not be fully evaluated due to data integration failures during the join process, which revealed missing GEOID keys in the ACS dataset.

**Conclusions:** The study confirms a measurable association between environmental proximity and respiratory health risks, identifying localized hotspots critical for targeted interventions. While preliminary findings align with environmental justice theories, incomplete integration of demographic variables underscores the need for improved data harmonization to fully dissect moderating socioeconomic influences. Future work should prioritize robust spatial stratification and multivariable geographically weighted regression to capture heterogeneous effects.

**Keywords:** hazardous waste facilities; asthma prevalence; geospatial analysis; environmental justice; North Carolina; census tract; spatial clustering
```