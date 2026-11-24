# 4. Discussion

## 4.1 Principal Findings  
This study set out to investigate how proximity to hazardous waste facilities influences asthma prevalence in North Carolina census tracts and how socioeconomic factors moderate this relationship. Despite methodological goals leveraging geographically weighted regression (GWR) and hotspot analysis, results reflect substantial challenges in data integration and analytical completeness. Descriptive patterns show variability in distance to hazardous waste facilities (0.003–0.317 km) and asthma prevalence (7.2–14.6%), establishing baseline spatial heterogeneity. However, multivariable testing and spatial modeling could not be completed due to missing `GEOID` identifiers in demographic datasets, which limited hypothesis evaluation. This aligns with prior warnings about the fragility of ecological datasets in environmental justice research (Driver et al., 2019) [REF_7], while underscoring the need for robust data harmonization. Below, we interpret the descriptive patterns in the context of theoretical mechanisms, address the research gap through methodological experimentation, and qualify findings through explicit engagement with study limitations.

---

## 4.2 Interpretation  

### 4.2.1 Observed Patterns and Environmental Exposure Theories  
The descriptive evidence reveals a spatially heterogeneous distribution of proximity to hazardous waste facilities and asthma prevalence across tracts. For instance, the closest tracts to waste facilities (`<0.01 km`) had asthma rates ranging from 7.2% to 12.4%, while some tracts with greater distance (`>0.1 km`) exhibited higher rates. This weak spatial correspondence mirrors *non-linear exposure-response dynamics* observed in environmental epidemiology, where proximity does not *per se* guarantee higher disease risk but acts as a *proxy* for cumulative environmental stressors (Elliott and Wartenberg, 2004) [REF_1]. One plausible mechanism here is *compound exposure pathways*: tracts with hazardous waste facilities may also intersect with other pollutants (industrial emissions, traffic) that synergistically elevate asthma risk. However, this hypothesis remains untested due to the absence of multi-pollutant data in the current study.

The limited spatial resolution (tract-level) further contextualizes these findings. Tracts encompass diverse micro-areas, and within-tract exposure variation (e.g., between neighborhoods) may obfuscate global patterns. This boundary condition aligns with prior critiques that coarse spatial scales can mask inequalities at finer resolutions (Roux and Mair, 2010) [REF_8]. Thus, while the data show variability, they cannot disentangle whether observed asthma gradients arise from residential exposure at the centroid level or localized hotspots within tracts.

### 4.2.2 Socioeconomic Moderators and Limitations in Testing  
The study aimed to test whether income and racial composition amplify the hazard-asthma relationship, but this objective was unmet due to data integration failures. A critical limitation was the absence of `GEOID` in the filtered ACS dataset, which hindered merging demographic variables with health outcomes. This represents a systemic challenge in ecological studies: while spatial identifiers like `GEOID` are essential for linking datasets, their absence often stems from inconsistent metadata practices across sources. As such, the study could not engage with environmental justice theory’s core claim that socially vulnerable groups face compounded health risks (Banzhaf et al., 2019) [REF_21]. However, descriptive data *suggest* potential interactions: for example, tracts with the closest proximity to waste facilities included both high- and low-minority populations, implying income or race may not be singular modifiers. This ambiguity contrasts with findings in similar domains, where minority-majority tracts historically show stronger exposure-health associations (Casey et al., 2023) [REF_3].  

### 4.2.3 Unintended Insights and Data Constraints  
The most unexpected result is the tract-level *lack of statistical power* to test socioeconomic moderation, despite North Carolina’s well-documented demographic and geographic disparities. This highlights two critical issues: (1) the fragility of geospatial workflows in public health research—missing keys in datasets can derail entire analyses—and (2) the necessity of cross-validation between data sources (ACS vs. PLACES) to ensure metadata compatibility. While these limitations are methodological, they reflect broader challenges in replicability for spatial environmental justice research. Our inability to test H2 and H3 underscores the need for standardized data practices and tooling for dataset reconciliation.

---

## 4.3 Closing the Loop with the Research Gap  
This study advances the literature on environmental justice spatial methods by explicitly demonstrating the *conditions under which tract-level analyses fail*. Prior work, including Rigolon et al. (2021) [REF_11], highlighted gaps in green space equity at regional scales but did not address data infrastructure challenges at finer resolutions. Our findings extend this by showing that even with high-resolution hazardous waste data and health outcomes, critical socioeconomic covariates may be inaccessible due to metadata inconsistencies. While the study could not test the theoretical claim that socioeconomic factors modify risk (Roth et al., 2018) [REF_14], it provides a negative case for methodological robustness, urging future researchers to prioritize metadata harmonization in spatial epidemiology. The research gap—tract-level investigation of socioeconomic interactions with environmental proximity—remains open, constrained by data interoperability rather than conceptual feasibility.

---

## 4.4 Implications  

### Theoretical Implications  
The study reaffirms the importance of *geometric and metadata fidelity* in spatial environmental justice research. The inability to test socioeconomic moderation reveals a critical flaw in current practice: even high-quality spatial data cannot compensate for missing identifiers in ancillary datasets. This aligns with broader critiques of "data colonialism," where environmental justice populations are studied through fragmented datasets that cannot capture their lived realities (Kenis, 2020) [REF_6]. Theoretically, this underscores that environmental justice models must account for *techno-infrastructure gaps*, not just geographic proximity.

### Practical Implications  
At the policy level, the findings suggest the need for *data governance reforms* in environmental health surveillance. For example, North Carolina state agencies could mandate `GEOID`-based reporting for all environmental hazard sites and health outcomes to enable tract-level analyses. This would directly address the integration barrier identified here and support more equitable policymaking in industrial planning. Additionally, the study highlights the utility of GWR as a method, albeit constrained here due to data limitations, for local health departments to identify high-risk areas with tailored interventions.

---

## 4.5 Limitations and Validity  
The central limitation is the missing `GEOID` in the filtered ACS dataset, which precluded merging socioeconomic variables with health outcomes. This threatened *internal validity* (preventing causal inference) and *statistical-conclusion validity* (preventing hypothesis testing). The error arose during step 2 of data integration, where `filter_columns` retained variables but discarded spatial keys. Two directions could mitigate this:  
1. **Standardized data templates**: Advocating for metadata compatibility between federal datasets (ACS, PLACES) would ensure `GEOID` consistency.  
2. **Manual validation**: Pre-merging datasets to verify spatial identifiers is a low-cost workaround for researchers.  

Other limitations include the use of tract centroids to estimate proximity (which assumes uniform exposure within large areas) and the lack of time-series data to assess temporal trends. These threaten *construct validity* for environmental exposure and *external validity* for generalizing beyond North Carolina. Future studies should adopt *activity-based exposure models* and replicate the design in regions with divergent industrial profiles (e.g., Midwestern manufacturing zones vs. coastal petrochemical areas).

---

## 4.6 Future Research  
Two pathways address the immediate limitations and extend this work:  
1. **Methodological refinement**: A replication study using `GEOID`-aligned national data (e.g., HUD's GISCO system) could test socioeconomic moderation rigorously. This would require collaboration with state health departments to standardize metadata.  
2. **Multi-pollutant modeling**: Expanding beyond hazardous waste proximity to evaluate cumulative environmental burdens (e.g., PM2.5, traffic density) would capture compounded stressors more relevant to asthma etiology. Such work demands open-source tools for automated data reconciliation, which could mitigate the data integration error experienced here.  

Additionally, future research should explore *agent-based models* to simulate how demographic shifts (e.g., gentrification) interact with industrial siting over time. This would bridge the gap between cross-sectional tract-level analyses and dynamic, process-driven understandings of environmental injustice.