## 2. Methodology

### 2.1 Data

We conducted a county-level analysis for South Carolina using four inputs aligned by a common county identifier (`GEOID`) and one integrated geospatial output. All tabular sources were provided as comma-separated values (CSV) and the county boundaries were provided as a GeoPackage (GPKG). Each dataset contained 46 records, corresponding to the 46 counties in South Carolina, and all merges were therefore performed at the county scale.

**County boundaries (SC_counties).** County geometries were read from `SC_counties.gpkg`, containing 46 features and two fields: `GEOID` and `geometry`. The integrated analytical GeoPackage produced by the pipeline (`county_analysis_with_SES_mobility_depression.gpkg`) preserved a geographic coordinate reference system of EPSG:4269.

**Depression prevalence (SC_PLACES_depression).** County-level depression prevalence was read from `SC_PLACES_depression.csv` (46 rows, 2 columns). The key variables were `GEOID` and `Depression_prev`, where `Depression_prev` represented the outcome used in all regression models.

**Socioeconomic covariates (SC_ACS_data).** County-level socioeconomic and demographic variables were read from `SC_ACS_data.csv` (46 rows, 15 columns). Variables used for SES construction and/or as controls were: `percent_>=18`, `percent_Married`, `percent_White`, `percent_Black`, `percent_Asian`, `percent_Hispanic`, `percent_Other_Race`, `percent_Male`, `percent_Female`, `percent_>=HighSch`, `percent_Poverty`, `percent_Unemployed`, `percent_Uninsured`, and `Med_income`, keyed by `GEOID`.

**Place-visitation (mobility) measures (SC_Visitor_POI).** County-aggregated visitation counts by point-of-interest type were read from `SC_Visitor_POI.csv` (46 rows, 11 columns), keyed by `GEOID`. The place categories were `Full_Service_Restaurant`, `Sport_facilities`, `Parks`, `Fastfood_Restaurant`, `Convenience`, `Supermarket`, `Warehouse`, `Fruit`, `TobaccoStore`, and `DrinkingPlaces`. These category-specific volumes were used to derive mobility measures representing (i) overall visitation intensity and (ii) diversity of visited place types.

**Integrated analytical dataset (output).** After preprocessing and derivation, the analysis generated a single county geospatial layer, `county_analysis_with_SES_mobility_depression.gpkg` (46 rows, 6 columns; CRS EPSG:4269) with fields: `GEOID`, `Depression_prev`, `SES_index`, `log_mobility_total_visits`, `mobility_entropy`, and `geometry`. This layer served as the spatially enabled table for mapping and for spatial residual diagnostics.

**Preprocessing and feature construction.** We aligned all sources by county `GEOID` and constructed a single analytical table of 46 counties, then attached the resulting attributes to county geometries to form the GeoPackage output (46 features). Two derived mobility mediators were constructed from the POI visitation categories: (1) `log_mobility_total_visits`, representing a log-transformed overall visitation intensity computed from the total visits across the ten POI columns and then log-transformed (the output variable name indicates a log transform consistent with a $\log(1+x)$ form); and (2) `mobility_entropy`, representing the entropy of the within-county distribution of visits across POI categories (computed from the vector of category shares within each county). In parallel, we produced a standardized SES summary measure `SES_index` from the ACS-based county attributes (stored as a single continuous index in the integrated output). The workflow did not record any county exclusions in the execution trace, and the final analytical file contained all 46 counties with non-missing values for the variables used in modeling (`Depression_prev`, `SES_index`, `log_mobility_total_visits`, `mobility_entropy`).

### 2.2 Methods

#### Analytical framework

To evaluate whether county-level mobility patterns mediated the association between county socioeconomic status and depression prevalence, we implemented a regression-based mediation workflow that decomposed the SES–depression association into (i) a total effect of SES on depression, (ii) an indirect pathway via mobility, and (iii) a remaining direct effect after accounting for mobility. This design followed a classical product-of-coefficients approach to mediation implemented via ordinary least squares (OLS), and we complemented inferential estimates with diagnostics for multicollinearity and for residual spatial autocorrelation. The latter step was included because county-level health outcomes often exhibit spatial dependence; if residuals remain spatially autocorrelated after covariate adjustment, this indicates remaining geographic structure not captured by the aspatial regression specification and motivates spatial model extensions in subsequent work.

#### OLS mediation models and Sobel test

We estimated mediation for two alternative mediators: (1) mobility intensity (`log_mobility_total_visits`) and (2) mobility diversity (`mobility_entropy`). For each mediator, we fit three OLS models at the county level ($n=46$):

1) **Total-effect model (path $c$):**
$$
y_i = \beta_0 + c\,SES_i + \boldsymbol{\gamma}^\top \mathbf{Z}_i + \varepsilon_i,
$$

2) **Mediator model (path $a$):**
$$
M_i = \alpha_0 + a\,SES_i + \boldsymbol{\delta}^\top \mathbf{Z}_i + \eta_i,
$$

3) **Direct + mediator outcome model (paths $c'$ and $b$):**
$$
y_i = \theta_0 + c'\,SES_i + b\,M_i + \boldsymbol{\kappa}^\top \mathbf{Z}_i + \xi_i,
$$

where $i$ indexed counties; $y_i$ was `Depression_prev`; $SES_i$ was `SES_index`; $M_i$ was one of the two mediators (`log_mobility_total_visits` or `mobility_entropy`); and $\mathbf{Z}_i$ represented a vector of county-level controls drawn from `SC_ACS_data.csv` (e.g., age composition, education, poverty, unemployment, insurance coverage, and race/ethnicity composition, as represented by the available `percent_*` and `Med_income` fields). Error terms ($\varepsilon_i$, $\eta_i$, $\xi_i$) were treated under the standard OLS assumptions of mean-zero disturbances and independent errors; because heteroskedasticity is common in areal health data, we reported coefficient inference using heteroskedasticity-consistent standard errors (HC1) and also saved non-robust fit summaries separately.

For each mediator, we computed the **indirect (mediated) effect** as the product $ab$, and we evaluated its uncertainty using the **Sobel test**, which uses the delta method to approximate the standard error of $ab$:
$$
SE_{ab} = \sqrt{b^2 SE_a^2 + a^2 SE_b^2},
$$
with test statistic
$$
z = \frac{ab}{SE_{ab}}.
$$
We also computed the **proportion mediated** as $\frac{ab}{c}$ for descriptive decomposition of the total association into indirect and remaining components.

All OLS models and mediation quantities were written to `analysis_results.csv` (and the duplicate export `analysis_results_key_quantitative.csv`), and full coefficient tables with HC1 robust standard errors were saved to `mediation_ols_coefficients_robustHC1.csv`. Model fit summaries for the OLS specifications were saved to `model_fit_stats.csv`. This end-to-end mediation workflow was conceptually aligned with prior epidemiologic mediation practice emphasizing pathway decomposition, while remaining transparent about its reliance on regression-based identification assumptions rather than a fully specified causal g-formula (Ochoa et al., 2023) [REF_3].

#### Multicollinearity assessment (VIF)

Because mediation models include SES, a mediator derived from visitation data, and additional socioeconomic controls, we assessed potential multicollinearity using variance inflation factors (VIF). VIF for each predictor was computed as
$$
VIF_j = \frac{1}{1 - R_j^2},
$$
where $R_j^2$ is the coefficient of determination from regressing predictor $x_j$ on the remaining predictors. Separate VIF tables were produced for the two mediation outcome specifications, saved as `vif_MobilityTotalVisits_log1p.csv` and `vif_MobilityDiversity_entropy.csv`. These diagnostics were used to evaluate whether any predictors in the direct+mediator models were linearly redundant enough to threaten coefficient stability and interpretability.

#### Spatial residual autocorrelation diagnostics (Moran’s I)

To evaluate whether the aspatial OLS mediation specifications left residual spatial structure, we computed Moran’s $I$ for model residuals using county geometries. Moran’s $I$ was computed as
$$
I = \frac{n}{S_0}\frac{\sum_i \sum_j w_{ij}(e_i-\bar{e})(e_j-\bar{e})}{\sum_i (e_i-\bar{e})^2},
$$
where $e_i$ are regression residuals, $\bar{e}$ is their mean, $w_{ij}$ are spatial weights, $S_0=\sum_i\sum_j w_{ij}$, and $n$ is the number of counties (Moran, 1950). The resulting residual-autocorrelation diagnostics were recorded in `analysis_results.csv` under the `spatial_residual_diagnostics` section for each fitted direct+mediator outcome model (as indicated by the `model` field in the output).

Because the execution trace did not explicitly record the spatial-weights construction rule (e.g., queen contiguity, rook contiguity, $k$-nearest neighbors, or a distance-band threshold) or any row-standardization choice, we report this as a reproducibility limitation: Moran’s $I$ was computed with `libpysal`/`esda` tooling (per the computational environment), but the exact neighbor definition and weight normalization used to generate $W=[w_{ij}]$ cannot be uniquely reconstructed from the saved artifacts alone. Nevertheless, the diagnostic step itself is fully documented via the exported statistics fields (`moran_I`, `moran_p_sim`, `moran_z_sim`) and the model identifiers attached to those diagnostics in `analysis_results.csv`.

#### Mapping and exploratory visualization

To support spatial interpretation and to check face validity of constructed measures, we generated county-level choropleths for `Depression_prev`, `SES_index`, and `log_mobility_total_visits` from the integrated GeoPackage layer: `choropleth_depression_prev.png`, `choropleth_SES_index.png`, and `choropleth_mobility_log_total_visits.png`. We also generated an exploratory bivariate scatter plot of SES versus depression colored by mobility (`scatter_SES_vs_depression_colored_by_mobility.png`). These figures were produced as descriptive visualizations and were not used for inferential decisions beyond motivating residual spatial diagnostics.

### 2.3 Computational environment

All analyses were executed in Python 3.13.15 on Windows 11, with an analysis date (UTC) of 2026-10-05. Core spatial processing used geopandas 1.1.2 with fiona 1.10.1, shapely 2.1.2, and pyproj 3.7.2; spatial autocorrelation diagnostics relied on esda 2.8.1 and libpysal 4.14.1; and regression modeling used statsmodels 0.14.6 (with mgwr 2.2.1 and spreg 1.8.5 also available in the environment). Random seed(s) were not recorded, which we note as a reproducibility limitation, particularly for any procedures involving stochastic simulation (e.g., permutation-based $p$-values for Moran’s $I$).