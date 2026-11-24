## 3. Results

### 3.1 Overview  
The analysis was conducted on 200 North Carolina census tracts (final N=200) after merging hazard proximity data with asthma prevalence data (described in Table 1). The tracts represent diverse geographic locations across the state, with distances to the nearest hazardous waste facility ranging from 0.002 to 0.317 kilometers. Descriptive statistics show a mean distance of 0.035 ± 0.053 km and median asthma prevalence of 10.0% (IQR: 1.1%). Subsequent objectives could not proceed to multivariable analysis due to data integration challenges, limiting hypothesis testing to the descriptive level.  

### 3.2 Understand the spatial relationship between hazardous waste facility proximity and asthma prevalence in North Carolina census tracts  
A joined dataset combining hazard proximity (distance in meters) and asthma prevalence (per 100 people) was prepared using 200 census tracts (N=200). **Table 1** presents the top 50 rows of this dataset, showing variability in proximity to hazardous waste facilities and asthma rates across tracts.  

Key descriptive statistics for the merged dataset (Table 1) include:  
- **Distance to nearest hazardous waste facility**:  
  Mean = 34.8 meters (SD = 53.2 meters), median = 13.3 meters (IQR: 13.2–26.2 meters).  
- **Asthma prevalence**:  
  Mean = 10.0% (SD = 1.5%), ranging from 7.2% to 14.6%.  

Figure 1 (not embedded) in the figure catalog illustrates tract centroids; however, no spatial regression or significance testing was conducted due to incomplete subsequent steps. The dataset provides foundational evidence but lacks demographic controls required to rigorously assess the hypothesis.  

**Hypothesis Assessment**  
The descriptive data indicate variability in proximity to hazardous waste sites and asthma prevalence but does not support statistical inference about the hypothesized association. With medians of 13.3 meters (distance) and 10.0% (asthma prevalence), the dataset establishes baseline patterns. However, multivariable testing was not possible due to the absence of integrated demographic controls. The evidence is insufficient to conclude support or rejection of the hypothesis.  

### 3.3 Quantify how socioeconomic and demographic factors modify the relationship between environmental proximity and asthma outcomes  
Integration of demographic variables with the merged dataset failed due to missing `GEOID` in the filtered ACS data (error: GEOID missing in filtered_ACS_vars.csv). Consequently, geographically weighted regression (GWR) and hypothesis testing could not be executed. The filtered ACS subset, while containing socioeconomic variables (e.g., income, racial composition), lacked spatial identifiers for merging with health data.  

**Hypothesis Assessment**  
The hypothesis about socioeconomic modification could not be tested due to incomplete data integration. The analysis pipeline failure (error during step 2 data merge) precluded estimation of spatially varying coefficients for the proposed model.  

### 3.4 Identify census tracts with statistically significant high-risk clusters of environmental exposure and health outcomes  
Hotspot analysis and Kruskal-Wallis testing were not conducted as prerequisite data preparation failed. The required `final_analysis_dataset.gpkg` file, containing hazard-exposure metrics and demographic variables, could not be generated due to the integration error in Objective 2.  

**Hypothesis Assessment**  
The hypothesis about minority-population differences in clustering could not be evaluated. Data preparation errors upstream prohibited generation of risk hotspot statistics and subsequent analysis.  

### 3.5 Cross-Objective Synthesis  
No cross-objective synthesis was possible due to sequential failures in data integration. All subsequent analyses depended on the successful completion of Objective 2, which was unachievable due to missing identifiers in the socioeconomic dataset.  

---

**Table 1.** Joined tract hazard distances and asthma prevalence data by GEOID (N=200).  

|               GEOID | distance_meters | Asthma_prev |  
|---------------------|-----------------|-------------|  
| 1400000US37063001706 | 0.015000        | 8.4         |  
| 1400000US37183050300 | 0.002572        | 8.2         |  
| 1400000US37067002701 | 0.010054        | 10.8        |  
| 1400000US37183053409 | 0.024252        | 7.3         |  
| 1400000US37111970100 | 0.017271        | 9.8         |  
| ... (49 more rows)  | ...             | ...         |  

---  

All figures and tables are introduced in prose and referenced verbatim from the figure catalog. No additional analytic outputs were available for reporting beyond the embedded Table 1.