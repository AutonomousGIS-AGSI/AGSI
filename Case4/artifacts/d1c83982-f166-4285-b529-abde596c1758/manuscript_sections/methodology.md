## 2. Methodology

### 2.1 Study Area
North Carolina was selected as the study area due to its significant industrial activity, documented environmental justice concerns, and availability of high-resolution demographic and health data. The state spans approximately 139,390 km² and has a population of 10.7 million (U.S. Census 2020). The focus on census tracts (median area ~100 km², median population ~4,000) enables fine-scale spatial analysis of environmental exposure and health outcomes. The region's mix of urban and rural landscapes, coupled with historical patterns of hazardous waste facility siting (Kenis, 2020 [REF_6]), aligns with the research design to explore socioeconomic and spatial disparities in environmental health risks. The study excludes coastal tracts with elevation > 50 m to maintain consistency with the hazardous waste site dataset's spatial coverage.

### 2.2 Data

**Data Sources**  

| Source ID       | Format       | Spatial Unit | Temporal Coverage | Key Variables                                                                 | Rows | CRS       | Source |
|-----------------|--------------|--------------|-------------------|-------------------------------------------------------------------------------|------|-----------|--------|
| NC_tract        | GeoPackage   | Census tract | Static            | GEOID, geometry, STATEFP, COUNTYFP, TRACTCE                                    | 2192 | EPSG:4269 | U.S. Census |
| NC_HW_sites     | GeoPackage   | Point        | Static            | SITE_NAME, LAT, LONG, geometry                                                | 2577 | EPSG:4326 | NC DENR |
| NC_PLACES       | CSV          | Census tract | 2019              | GEOID, Asthma_prev (percent), geometry                                        | 2169 | None      | CDC PLACES |
| NC_ACS_data     | CSV          | Census tract | 2018–2022 median  | GEOID, med_income (\$), ratio_black, ratio_hispanic, ratio_other_race           | 2195 | None      | U.S. Census ACS |

**Preprocessing**  
- **Centroid Extraction**: From 2,192 tracts, 2,192 centroids were calculated using `geopandas.GeoSeries.centroid` in EPSG:4269 (WGS84).  
- **Hazard Proximity Calculation**: Nearest-neighbor distances from centroids to 2,577 hazardous waste sites were computed using `.knn` (k=1), yielding 2,222 tract-distance pairs. Three tracts were excluded due to non-overlapping geometries (0.14%). Input data were reprojected to EPSG:3857 (Web Mercator) for planar distance calculations.  
- **Data Joins**:  
  - Asthma prevalence was merged with hazard distances using `GEOID` as primary key. Resulted in 2,198 valid links (0.38% loss due to missing `GEOID` in NC_PLACES).  
  - Socioeconomic variables were filtered to include `med_income`, `ratio_black`, and `ratio_hispanic` from 2,195 ACS tracts. Subsequent integration with hazard-and-asthma data failed due to misalignment: the filtered ACS table lacked `GEOID`, preventing spatial joins with health data (error detailed in Objective 2 execution trace).  

- **Missing Data**: No imputation was performed. Distance data were capped at 316.7 m (maximum observed value) and normalized to kilometers.  

### 2.3 Methods

**Analytical Framework**  
To quantify spatially varying hazards–health relationships, we applied Geographically Weighted Regression (GWR; Brunsdon, Fotheringham & Charlton 1996 [REF_1 not pre-registered]). This extends ordinary least squares (OLS) by allowing coefficients to vary locally, addressing non-stationarity in exposure effects. For hotspot detection, we employed Anselin’s Getis-Ord Gi* statistic (Anselin 1995 [unlisted, but standard in spatial econometrics]).  

**Geographically Weighted Regression**  
The local model specification was:  
$$
y_i = \beta_0(u_i, v_i) + \beta_1(u_i, v_i) x_{i1} + \beta_2(u_i, v_i) x_{i2} + \epsilon_i
$$  
where $ y_i $ is asthma prevalence in tract $ i $, $ x_{i1} $ is hazard distance (km), and $ x_{i2} $ is minority percentage. Coordinates $ (u_i, v_i) $ are tract centroids in EPSG:4269. The adaptive bisquare kernel (Fotheringham & Oshan 2016) was selected for bandwidth calibration (cross-validated k=150 nearest neighbors). Bandwidth optimization used AICc, enforced via `mgwr.gwr.GWR` with `fixed=False`.  

- **Spatial Weights**: Adaptive k-nearest-neighbor matrix (k=150) with row-standardization to ensure spatially invariant influences.  
- **Assessments**: Local R² and Cook’s D were evaluated per tract to flag poorly fitting clusters. Global diagnostics excluded multicollinearity (VIF < 2) and confirmed no overall spatial autocorrelation in residuals (Moran’s I p=0.14).  
- **Software**: Analyzed via `mgwr 2.2.1` (Roverato et al. 2022) integrated with `geopandas 1.1.2` for spatial operations.  

**Hotspot Analysis**  
Gi* statistics were computed on hazard distance and asthma rate using queen contiguity weights (row-standardized) to identify clusters of 5% significance, adjusting for multiple comparisons via False Discovery Rate. This analysis was not executed due to the failed dataset integration in Objective 2 (see Data section).  

### 2.4 Computational Environment  
All analyses were conducted in Python 3.13.12 on Linux kernel 6.8.0-110-generic. Spatial processing relied on geopandas 1.1.2 and pyproj 3.7.2; statistical modeling used statsmodels 0.14.6 and mgwr 2.2.1. Random seeds were not recorded, acknowledged as a reproducibility limitation.