## 3. Results

### 3.1 Overview

Analyses were conducted for North Carolina at the census-tract scale using the complete-case modeling sample (2,169 tracts with non-missing outcome, proximity, and covariates; `n_tracts_model` in `analysis_results_key_metrics.csv`). As described in Section 2 (Methodology), the primary exposure metric was tract centroid distance to the nearest hazardous waste facility (km), transformed as $\ln(\text{distance}_\text{km}+1)$ and standardized alongside tract covariates for global OLS models with HC1 robust standard errors.

Across outcomes and models, substantial spatial structure was observed in asthma prevalence, and global regression estimates indicated a statistically detectable association between hazardous-waste proximity and asthma prevalence after adjustment for tract socioeconomic and demographic context (Section 2.2).

### 3.2 Proximity to hazardous waste facilities, tract context, and spatial patterning of asthma prevalence (Objective 1)

#### Spatial distribution of asthma prevalence and hazardous-waste proximity

Figure 1 maps tract-level asthma prevalence across North Carolina.  
![Figure 1: Choropleth map of asthma prevalence across North Carolina census tracts.](fig_asthma_choropleth.png)

The choropleth indicated marked geographic variability in asthma prevalence, with contiguous groups of higher- and lower-prevalence tracts visible across the state rather than a spatially random pattern.

Figure 2 overlays hazardous waste facility locations on the asthma prevalence choropleth to support visual comparison of prevalence gradients and facility distributions.  
![Figure 2: Choropleth of tract-level asthma prevalence overlaid with hazardous waste facility locations across North Carolina.](map_asthma_prevalence.png)

The overlaid map showed that facility points were broadly distributed across the state and frequently occurred in proximity to tracts spanning the asthma prevalence range, motivating formal proximity-based and spatial-autocorrelation analyses (Section 2.2).

Figure 12 summarizes the derived exposure surface by mapping tract centroid distance to the nearest hazardous waste facility (km).  
![Figure 12: Choropleth map of tract centroid distance to the nearest hazardous waste facility (km).](fig_distance_to_hw_choropleth.png)

The distance choropleth showed substantial spatial heterogeneity in nearest-facility distance across tracts, with clear geographic gradients separating relatively near versus far tracts.

#### Bivariate proximity–asthma association

Figure 3 plots tract-level asthma prevalence against distance to the nearest hazardous waste facility, with a binned-mean trend line.  
![Figure 3: Scatterplot of tract-level asthma prevalence versus distance to nearest hazardous waste facility, with binned mean trend.](fig_asthma_vs_distance.png)

The scatterplot indicated a weak-to-moderate marginal gradient in asthma prevalence across the distance range, while also showing considerable dispersion in prevalence at any given distance—supporting multivariable modeling that accounted for tract context covariates (Section 2.2).

#### Global OLS estimates (reduced and interaction specifications)

Table 6 reports fit statistics for the global OLS model with robust (HC1) standard errors, as specified in Section 2.2. The model achieved $R^2 = 0.825$ and adjusted $R^2 = 0.824$ for 2,198 observations (as recorded in `model_fit_stats.csv`).

**Table 6.** Model fit statistics for the global OLS model (robust standard errors).

| model | n | r2 | adj_r2 | aic | bic | f_pvalue |
|---|---:|---:|---:|---:|---:|---:|
| OLS_HC1 | 2198 | 0.824815 | 0.824095 | 3584.21165 | 3641.164681 | 0.0 |

Table 8 reports coefficient estimates for (i) a reduced main-effects model and (ii) a full model including proximity-by-context interaction terms (Section 2.2). In the reduced model, the standardized coefficient for $\ln(\text{distance}_\text{km}+1)$ was $\beta = 0.148$ (SE = 0.0133, p < 0.001). In the full interaction model, the standardized proximity coefficient was similar in magnitude, $\beta = 0.156$ (SE = 0.0134, p < 0.001).

**Table 8.** Table 1. OLS regression coefficients predicting tract-level asthma prevalence from proximity to hazardous waste facilities and socioeconomic/demographic context (standardized predictors; HC1 robust SEs).

| model | variable | coef | std_err | t | p_value |
|---|---|---:|---:|---:|---:|
| OLS_reduced | const | 9.739235 | 0.011835 | 822.902790 | 0.000000e+00 |
| OLS_reduced | ln_dist_km_plus1 | 0.147582 | 0.013309 | 11.089111 | 1.416885e-28 |
| OLS_reduced | ratio_poverty | 0.524186 | 0.030312 | 17.292791 | 5.330767e-67 |
| OLS_reduced | ratio_black | 0.477199 | 0.017533 | 27.216521 | 4.140877e-163 |
| OLS_reduced | ratio_hispanic | -0.010729 | 0.020129 | -0.533000 | 5.940339e-01 |
| OLS_reduced | ratio_uninsured | 0.115954 | 0.033307 | 3.481369 | 4.988582e-04 |
| OLS_reduced | med_income | -0.376485 | 0.026536 | -14.187675 | 1.092207e-45 |
| OLS_full | const | 9.726357 | 0.013039 | 745.959627 | 0.000000e+00 |
| OLS_full | ln_dist_km_plus1 | 0.155796 | 0.013403 | 11.623816 | 3.118887e-31 |
| OLS_full | ratio_poverty | 0.494022 | 0.037734 | 13.092096 | 3.653816e-39 |
| OLS_full | ratio_black | 0.472189 | 0.017577 | 26.864378 | 5.729589e-159 |
| OLS_full | ratio_hispanic | -0.002870 | 0.019309 | -0.148662 | 8.818202e-01 |
| OLS_full | ratio_uninsured | 0.119260 | 0.036346 | 3.281256 | 1.033460e-03 |
| OLS_full | med_income | -0.375198 | 0.028411 | -13.206150 | 8.085485e-40 |
| OLS_full | ln_dist_x_poverty | -0.059461 | 0.036584 | -1.625309 | 1.040967e-01 |
| OLS_full | ln_dist_x_black | -0.030257 | 0.017478 | -1.731123 | 8.342982e-02 |
| OLS_full | ln_dist_x_hispanic | 0.009610 | 0.017743 | 0.541595 | 5.880973e-01 |
| OLS_full | ln_dist_x_uninsured | 0.019323 | 0.037287 | 0.518220 | 6.043051e-01 |
| OLS_full | ln_dist_x_income | 0.011138 | 0.036517 | 0.305019 | 7.603517e-01 |

Across both specifications, several context covariates were estimated with comparatively larger standardized magnitudes. For example, in the reduced model, the standardized poverty coefficient was $\beta = 0.524$ (SE = 0.0303, p < 0.001), the standardized Black population share coefficient was $\beta = 0.477$ (SE = 0.0175, p < 0.001), and the standardized median income coefficient was $\beta = -0.376$ (SE = 0.0265, p < 0.001). Coefficients for Hispanic share were near zero in both models (reduced: $\beta = -0.0107$, SE = 0.0201, p = 0.594; full: $\beta = -0.00287$, SE = 0.0193, p = 0.882).

The key metrics table (Table 5) summarized model comparison and interaction-term inference (Section 2.2). The full model $R^2$ was 0.824, compared to 0.822 for the reduced model, corresponding to a partial-$R^2$ improvement of 0.0148 when adding the set of proximity-by-context interactions. In the full model, interaction terms between proximity and poverty (standardized $\beta = -0.0595$, p = 0.104) and proximity and Black share (standardized $\beta = -0.0303$, p = 0.0834) were not estimated as statistically distinguishable from zero at conventional thresholds, and other interaction terms were more weakly estimated (p ≥ 0.588).

**Table 5.** Table 3. Key quantitative results: proximity effect estimates, interaction significance, and spatial autocorrelation diagnostics.

| metric | value | notes |
|---|---:|---|
| n_tracts_model | 2.169000e+03 | Number of census tracts with complete data for full model. |
| ols_reduced_r2 | 8.217521e-01 | R-squared for reduced OLS (no interactions), HC1 robust SEs. |
| ols_full_r2 | 8.243970e-01 | R-squared for full OLS (with interactions), HC1 robust SEs. |
| partial_r2_interactions | 1.483814e-02 | Partial R2 improvement when adding proximity×context interactions (full vs reduced). |
| ols_reduced_coef_ln_dist | 1.475819e-01 | Standardized coefficient for ln(distance_km+1). Negative implies higher asthma closer to sites. |
| ols_reduced_p_ln_dist | 1.416885e-28 | P-value for standardized ln(distance_km+1) coefficient in reduced model. |
| ols_full_coef_ln_dist | 1.557958e-01 | Standardized coefficient for ln(distance_km+1) in full interaction model. |
| ols_full_p_ln_dist | 3.118887e-31 | P-value for standardized ln(distance_km+1) coefficient in full interaction model. |
| morans_I_asthma | 5.836076e-01 | Global Moran's I for asthma prevalence (KNN k=8), permutations=999; p_sim=0.001. |
| morans_p_asthma | 1.000000e-03 | Permutation p-value for Global Moran's I (asthma). |
| morans_I_ols_full_residuals | 3.222877e-01 | Global Moran's I for full-model residuals (KNN k=8), permutations=999; p_sim=0.001. |
| morans_p_ols_full_residuals | 1.000000e-03 | Permutation p-value for Global Moran's I (full-model residuals). |
| ols_full_coef_ln_dist_x_poverty | -5.946066e-02 | Standardized interaction coefficient for ln_dist_x_poverty (proximity×context). |
| ols_full_p_ln_dist_x_poverty | 1.040967e-01 | P-value for interaction term ln_dist_x_poverty in full model. |
| ols_full_coef_ln_dist_x_black | -3.025719e-02 | Standardized interaction coefficient for ln_dist_x_black (proximity×context). |
| ols_full_p_ln_dist_x_black | 8.342982e-02 | P-value for interaction term ln_dist_x_black in full model. |
| ols_full_coef_ln_dist_x_hispanic | 9.609653e-03 | Standardized interaction coefficient for ln_dist_x_hispanic (proximity×context). |
| ols_full_p_ln_dist_x_hispanic | 5.880973e-01 | P-value for interaction term ln_dist_x_hispanic in full model. |
| ols_full_coef_ln_dist_x_uninsured | 1.932287e-02 | Standardized interaction coefficient for ln_dist_x_uninsured (proximity×context). |
| ols_full_p_ln_dist_x_uninsured | 6.043051e-01 | P-value for interaction term ln_dist_x_uninsured in full model. |
| ols_full_coef_ln_dist_x_income | 1.113829e-02 | Standardized interaction coefficient for ln_dist_x_income (proximity×context). |
| ols_full_p_ln_dist_x_income | 7.603517e-01 | P-value for interaction term ln_dist_x_income in full model. |
| strat_poverty_median_split_low_coef_ln_dist | 1.139788e-01 | Stratified (median split) standardized ln(distance) coefficient; n=1094; p=4.93749e-12. |
| strat_poverty_median_split_high_coef_ln_dist | -7.810657e-02 | Stratified (median split) standardized ln(distance) coefficient; n=1075; p=0.00400681. |
| strat_black_share_median_split_low_coef_ln_dist | 9.383323e-02 | Stratified (median split) standardized ln(distance) coefficient; n=1085; p=4.56119e-07. |
| strat_black_share_median_split_high_coef_ln_dist | 2.390042e-02 | Stratified (median split) standardized ln(distance) coefficient; n=1084; p=0.281261. |

Finally, multicollinearity diagnostics for main effects (Section 2.2) are provided in Table 11. VIF values ranged from 1.19 (ln distance) to 2.12 (median income), indicating limited inflation under this diagnostic.

**Table 11.** Vif main effects

| variable | VIF |
|---|---:|
| med_income | 2.119695 |
| ratio_uninsured | 2.079367 |
| ratio_poverty | 1.996121 |
| ratio_hispanic | 1.575089 |
| ratio_black | 1.432159 |
| ln_dist_to_hw_km | 1.185529 |

#### Stratified proximity associations across tract context

Table 9 reports stratified OLS estimates (median splits) of the standardized $\ln(\text{distance}_\text{km}+1)$ coefficient, consistent with the stratified specification described in Section 2.2. Under poverty stratification, the proximity coefficient was positive in the lower-poverty half (β = 0.114, SE = 0.0165, p < 0.001; $n$ = 1,094; $R^2$ = 0.598) and negative in the higher-poverty half (β = −0.0781, SE = 0.0271, p = 0.00401; $n$ = 1,075; $R^2$ = 0.520). Under Black share stratification, the proximity coefficient was positive and statistically detectable in the lower-Black-share half (β = 0.0938, SE = 0.0186, p < 0.001; $n$ = 1,085; $R^2$ = 0.617) and smaller and not statistically distinguishable from zero in the higher-Black-share half (β = 0.0239, SE = 0.0222, p = 0.281; $n$ = 1,084; $R^2$ = 0.614).

**Table 9.** Table 2. Stratified OLS estimates of the proximity (ln distance) association with asthma prevalence across socioeconomic/demographic context (median splits; standardized predictors; HC1 robust SEs).

| stratification | group | n | coef_ln_dist | se_ln_dist | p_ln_dist | r2 |
|---|---|---:|---:|---:|---:|---:|
| poverty_median_split | low | 1094 | 0.113979 | 0.016501 | 4.937490e-12 | 0.597618 |
| poverty_median_split | high | 1075 | -0.078107 | 0.027143 | 4.006814e-03 | 0.520095 |
| black_share_median_split | low | 1085 | 0.093833 | 0.018603 | 4.561192e-07 | 0.617408 |
| black_share_median_split | high | 1084 | 0.023900 | 0.022182 | 2.812609e-01 | 0.614130 |

Figure 16 visualizes this contextual variation by plotting asthma prevalence against standardized $\ln(\text{distance}_\text{km}+1)$ and faceting by poverty terciles.  
![Figure 16: Scatter of tract asthma prevalence versus hazardous-waste proximity (ln distance), stratified by poverty terciles to illustrate contextual variation.](scatter_asthma_lnDist_by_poverty.png)

The stratified scatterplots showed different prevalence–proximity gradients across poverty terciles, consistent with the sign and magnitude differences reported for poverty-based subgroup OLS estimates in Table 9.

Complementing the model-based stratification, Table 10 summarizes mean asthma prevalence differences comparing tracts within 3 km of a facility versus those outside 3 km across terciles of poverty, Black population share, and median income. Mean differences were negative in low- and mid-poverty terciles (within–outside differences: −0.302 and −0.102, respectively) but positive in the high-poverty tercile (0.424). Differences were negative for low- and mid-Black-share terciles (−0.571 and −0.293) and slightly positive for the high-Black-share tercile (0.143). For income terciles, the within–outside difference was positive in the low-income tercile (0.489) and negative in mid- and high-income terciles (−0.119 and −0.267).

**Table 10.** Stratified mean differences in asthma prevalence (within 3 km vs outside) by terciles of poverty, Black population share, and median income.

| context_var | context_level | n | n_within_3km | mean_asthma_within_3km | mean_asthma_outside_3km | diff_within_minus_outside |
|---|---|---:|---:|---:|---:|---:|
| poverty_tercile | Low | 764 | 403 | 8.533251 | 8.835180 | -0.301929 |
| poverty_tercile | Mid | 744 | 328 | 9.587195 | 9.689423 | -0.102228 |
| poverty_tercile | High | 750 | 465 | 11.097419 | 10.672982 | 0.424437 |
| black_tercile | Low | 753 | 270 | 8.704444 | 9.275569 | -0.571125 |
| black_tercile | Mid | 752 | 398 | 9.258543 | 9.551977 | -0.293435 |
| black_tercile | High | 753 | 528 | 10.811932 | 10.669333 | 0.142598 |
| income_tercile | Low | 756 | 465 | 11.175484 | 10.686598 | 0.488886 |
| income_tercile | Mid | 749 | 321 | 9.610903 | 9.729907 | -0.119003 |
| income_tercile | High | 753 | 410 | 8.444146 | 8.711079 | -0.266932 |

#### Spatial autocorrelation in asthma prevalence and model residuals

Global Moran’s $I$ statistics (Section 2.2) are reported in Table 7 for asthma prevalence and OLS residuals (queen contiguity, row-standardized). Asthma prevalence exhibited strong positive spatial autocorrelation (Moran’s $I = 0.603$, $p = 0.001$, $n$ = 2,169). Residuals from the OLS model also remained spatially clustered (Moran’s $I = 0.358$, $p = 0.001$, $n$ = 2,169), indicating that spatial dependence persisted after adjusting for proximity and covariates in a global linear model.

**Table 7.** Global Moran's I for asthma prevalence and for OLS residuals (Queen contiguity, row-standardized).

| variable | moran_I | p_sim | n |
|---|---:|---:|---:|
| Asthma_prev | 0.603388 | 0.001 | 2169 |
| ols_resid | 0.358304 | 0.001 | 2169 |

To localize clustering, Figure 14 presents a Local Moran’s $I$ (LISA) cluster map for asthma prevalence (p ≤ 0.05), as described in Section 2.2.  
![Figure 14: Local Moran's I (LISA) cluster map identifying significant hot spots/cold spots of asthma prevalence (Queen contiguity, p ≤ 0.05).](map_lisa_asthma_clusters.png)

The LISA map highlighted spatially contiguous hot spots (high–high) and cold spots (low–low), indicating that the statewide positive Moran’s $I$ reflected geographically concentrated clusters rather than diffuse weak dependence.

#### Spatially varying proximity association (GWR outputs)

Figure 4 maps the geographically weighted regression (GWR) coefficient surface for hazardous-waste proximity (the local coefficient on $\ln(\text{distance}_\text{km}+1)$), corresponding to the spatially varying specification described in Section 2.2.  
![Figure 4: Geographically weighted regression (GWR) map of the spatially varying association between hazardous-waste proximity (ln distance) and asthma prevalence.](map_gwr_beta_lnDist.png)

The coefficient surface showed that the proximity association varied across space, with areas exhibiting comparatively more positive versus more negative local coefficients rather than a uniform statewide slope.

Figure 15 maps the corresponding local $R^2$ values from the GWR model.  
![Figure 15: Local R² from the GWR model, highlighting where hazardous-waste proximity and covariates better explain asthma prevalence.](map_gwr_localR2.png)

Local $R^2$ also varied spatially, indicating that the combined explanatory power of proximity and covariates differed across regions of North Carolina in the locally weighted model.