## 2. Methodology

### 2.1 Data

We integrated four tract-referenced datasets for North Carolina: (i) census tract polygon geometries, (ii) tract-level asthma prevalence, (iii) point locations of hazardous waste facilities, and (iv) tract-level socioeconomic and demographic attributes. All datasets were linked through a common tract identifier (`GEOID`) and analyzed at the census-tract scale to align exposure (facility proximity) and contextual covariates with the small-area health outcome, consistent with tract-based spatial epidemiology practice (Elliott and Wartenberg, 2004) [REF_1]; (Sargent et al., 1997) [REF_10].

**Census tract geometries (NC_tract).** Tract boundaries were provided as a GeoPackage (`NC_tract.gpkg`) containing 2,192 records and 5 fields: `GEOID`, `STATEFP`, `COUNTYFP`, `TRACTCE`, and `geometry`. The `GEOID` field served as the unique key for joining asthma and ACS attributes to polygons.

**Asthma prevalence (NC_PLACES).** Tract-level asthma prevalence was provided as a CSV (`NC_PLACES.csv`) with 2,169 rows and three fields: `GEOID`, `Asthma_prev`, and `geometry` (stored as an object in the CSV). `Asthma_prev` was used as the dependent variable in all regression models.

**Hazardous waste facility locations (NC_HW_sites).** Facility locations were provided as a GeoPackage (`NC_HW_sites.gpkg`) with 2,577 point records and four fields: `SITE_NAME`, `LAT`, `LONG`, and `geometry`. These points were used to compute a tract-level proximity metric based on distance from each tract to the nearest facility.

**Socioeconomic and demographic context (NC_ACS_data).** Tract-level covariates were provided as a CSV (`NC_ACS_data.csv`) with 2,195 rows and 12 fields: `GEOID`, `ratio_white`, `ratio_black`, `ratio_asian`, `ratio_hispanic`, `ratio_other_race`, `ratio_male`, `ratio_female`, `ratio_poverty`, `ratio_unemployed`, `ratio_uninsured`, and `med_income`. These variables were treated as tract-level contextual predictors and potential effect modifiers.

#### Preprocessing and feature construction

All analyses were conducted at the tract level, and the analytic sample was restricted to tracts with complete data for the full (interaction) regression specification. The final modeling dataset contained **2,169 census tracts** (`n_tracts_model` in `analysis_results.csv`), indicating that tracts without complete outcome/covariate/proximity information were excluded via complete-case filtering for the full model specification. The tract identifier `GEOID` was used as the join key across the tract geometry layer, the asthma table, and the ACS table.

To represent hazardous waste exposure potential via accessibility/proximity, we constructed a tract-level distance-to-nearest-facility measure by computing the distance from each tract (using its representative location) to the closest hazardous waste facility point. Distances were expressed in kilometers and transformed to reduce right-skew and allow interpretation on a diminishing-returns scale by computing:
\[
\text{ln\_dist\_km\_plus1}_i=\ln(\text{distance\_km}_i+1),
\]
where $\text{distance\_km}_i$ is the nearest-facility distance for tract $i$. This transformed proximity metric was used as the primary exposure variable in all regression and stratified analyses.

For comparability of effect sizes across heterogeneous covariates (percentages and income), predictors used in the global regression models were standardized (z-scored) prior to model fitting, as reflected by the coefficient table caption indicating “standardized predictors” (`ols_coefficients.csv`, per `manifest.json`). The outcome variable (`Asthma_prev`) was modeled on its original scale.

### 2.2 Methods

#### Analytical framework

To answer whether hazardous waste facility proximity was associated with tract-level asthma prevalence—and whether the proximity–asthma relationship differed by tract socioeconomic and demographic context—we implemented a sequence of complementary analyses. First, we mapped tract-level asthma prevalence and tract-level proximity to hazardous waste facilities to document spatial patterning and support visual inspection of potential co-location. Second, we fit global ordinary least squares (OLS) regression models with heteroskedasticity-robust inference to estimate the association between proximity and asthma prevalence while adjusting for tract context. Third, we evaluated contextual effect modification using (i) interaction terms in a “full” OLS specification relative to a “reduced” main-effects model and (ii) stratified OLS models fit separately within binary (median-split) subgroups of selected context variables. Finally, because tract outcomes in spatial epidemiology commonly exhibit spatial autocorrelation, we assessed global spatial clustering in both the asthma outcome and model residuals using Moran’s $I$ with a contiguity-based spatial weights matrix (Elliott and Wartenberg, 2004) [REF_1].

#### Global OLS regression with robust standard errors and interaction terms

We estimated global associations using OLS regression, treating each census tract as an observation. The baseline (reduced) model related asthma prevalence to proximity and tract context covariates:
$$
y_i = \beta_0 + \beta_1 d_i + \sum_{k=1}^{K}\beta_{k+1} x_{ik} + \varepsilon_i,
$$
where $y_i$ is tract $i$ asthma prevalence (`Asthma_prev`), $d_i$ is the transformed proximity metric $\ln(\text{distance\_km}+1)$ (`ln_dist_km_plus1`), $x_{ik}$ are standardized tract-level context covariates drawn from `NC_ACS_data.csv` (race/ethnicity composition ratios, sex ratios, poverty, unemployment, uninsured, and median income), $\beta$ are global regression parameters, and $\varepsilon_i$ is an error term with $E[\varepsilon_i|d_i,\mathbf{x}_i]=0$. Because heteroskedasticity is common in cross-sectional small-area health data, inference used heteroskedasticity-consistent robust standard errors (HC1), as documented in the output notes and table captions.

To test whether the proximity association varied systematically by tract context (effect modification), we fit a full interaction model that augmented the reduced specification with proximity-by-context interaction terms:
$$
y_i = \beta_0 + \beta_1 d_i + \sum_{k=1}^{K}\beta_{k+1} x_{ik} + \sum_{m=1}^{M}\gamma_m \left(d_i \times z_{im}\right) + \varepsilon_i,
$$
where $z_{im}$ are selected standardized contextual moderators and $\gamma_m$ are interaction coefficients capturing how the slope on proximity changes with tract context. Model comparison between the reduced and full specifications was summarized using fit metrics (including $R^2$) and a partial-$R^2$ style improvement measure for adding interactions (recorded in `analysis_results.csv`/`analysis_results_key_metrics.csv`). Coefficient estimates and robust standard errors for both specifications were exported to `ols_coefficients.csv`.

Model adequacy checks focused on (i) multicollinearity in the main-effect covariates using variance inflation factors (VIF) (saved as `tables/vif_main_effects.csv`, per `manifest.json`) and (ii) residual spatial autocorrelation using Moran’s $I$ (saved as `tables/moran_global.csv`, per `manifest.json`). These diagnostics were used to evaluate whether global linear specifications were plausible and whether residual spatial dependence remained that could motivate more explicitly spatial models in future work.

#### Stratified (subgroup) OLS models for contextual heterogeneity

To provide an interpretable complement to interaction terms, we estimated stratified OLS models in which the reduced global specification was re-fit separately within subgroups defined by median splits of selected contextual variables (as recorded in `stratified_effects.csv`). Formally, for each stratification variable $s$ and subgroup $g \in \{\text{low},\text{high}\}$, we fit:
$$
y_i = \beta_0^{(s,g)} + \beta_1^{(s,g)} d_i + \sum_{k=1}^{K}\beta_{k+1}^{(s,g)} x_{ik} + \varepsilon_i^{(s,g)} \quad \text{for } i \in (s,g),
$$
where $\beta_1^{(s,g)}$ represents the subgroup-specific association between proximity and asthma prevalence after adjusting for the same set of covariates. In the executed workflow, stratification was implemented for `poverty_median_split` and `black_share_median_split` (two groups each: `low` and `high`), and subgroup sample sizes (`n`) were tracked in the output table (`stratified_effects.csv`). These models were used as a robustness-oriented descriptive test of heterogeneity aligned with environmental justice interpretation: they asked whether proximity associations were similar or meaningfully different across higher- vs lower-vulnerability tract groupings.

#### Spatial autocorrelation assessment (Global Moran’s I)

Because tract outcomes and social/environmental covariates are often spatially clustered, we evaluated global spatial autocorrelation in (i) tract-level asthma prevalence and (ii) OLS residuals using Global Moran’s $I$ (Moran, 1950). Using a row-standardized queen-contiguity spatial weights matrix $W=\{w_{ij}\}$ defined on the tract polygon adjacency graph, Moran’s $I$ was computed as:
$$
I=\frac{n}{S_0}\,\frac{\sum_{i=1}^{n}\sum_{j=1}^{n} w_{ij}(y_i-\bar{y})(y_j-\bar{y})}{\sum_{i=1}^{n}(y_i-\bar{y})^2},
$$
where $n$ is the number of tracts, $\bar{y}$ is the mean of the variable being tested (either `Asthma_prev` or model residuals), and $S_0=\sum_i\sum_j w_{ij}$. The weights specification used **queen contiguity** with **row standardization**, as stated in the Moran table caption in the project manifest (“Queen contiguity, row-standardized”; `tables/moran_global.csv`, per `manifest.json`). Significance was evaluated via simulation-based $p$-values (`p_sim` column in the Moran output table, per `manifest.json`).

#### Visualization outputs

To support spatial interpretation and exploratory assessment, we produced choropleths of tract-level asthma prevalence and distance-to-hazardous-waste proximity and a bivariate plot relating asthma prevalence to proximity. These were saved as `fig_asthma_choropleth.png`, `fig_distance_to_hw_choropleth.png`, and `fig_asthma_vs_distance.png`.

### 2.3 Computational environment

All analyses were conducted in **Python 3.13.15** on **Windows 11** (analysis date **2026-10-05 UTC**). Spatial data handling and geometry operations used **geopandas 1.1.2**, **shapely 2.1.2**, **fiona 1.10.1**, and **pyproj 3.7.2**; spatial weights and spatial autocorrelation analysis used **libpysal 4.14.1** and **esda 2.8.1**. Regression modeling and inference used **statsmodels 0.14.6** (with heteroskedasticity-robust HC1 standard errors), alongside supporting scientific libraries including **numpy 2.3.5**, **pandas 2.3.2**, and **scipy 1.17.0**; visualization used **matplotlib 3.10.0** and **seaborn 0.13.2**. Random seeds were **not recorded**, which we note as a limitation for exact computational reproducibility of any stochastic procedures (e.g., simulation-based $p$-values for Moran’s $I$).