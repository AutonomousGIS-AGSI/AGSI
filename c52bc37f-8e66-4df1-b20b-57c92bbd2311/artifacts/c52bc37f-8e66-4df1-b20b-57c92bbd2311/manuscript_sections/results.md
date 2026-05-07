## 3. Results

### 3.1 Overview

Analyses were conducted at the census-tract scale for North Carolina using tract asthma prevalence from PLACES (`Asthma_prev`) and two hazardous-waste proximity proxies derived from tract centroids: (i) Euclidean distance to the nearest hazardous-waste facility (`nearest_hw_dist_m`) and (ii) the count of facilities within a 5,000 m radius (`hw_count_5km`). As documented by the join audit, 2,169 tracts had non-missing asthma prevalence and were retained for asthma-based spatial statistics and subsequent modeling, out of 2,192 tract polygons (99.0%), with 23 polygons unmatched on `Asthma_prev` and therefore excluded from asthma-based inference.

In the working analytic extracts used for mapped outputs and descriptive summaries, `Asthma_prev` averaged 9.81 (SD = 0.984; range: 7.8–13.8) across 200 GEOID-keyed tracts in the asthma–proximity table. In the same table, `nearest_hw_dist_m` averaged 4,829 m (SD = 5,209; range: 52.8–32,919 m) and `hw_count_5km` averaged 7.24 facilities (SD = 9.68; range: 0–52). These proximity metrics were subsequently linked to hotspot classifications and to multivariable models as described in the Methods (Section 2.3).

### 3.2 Objective 1 — Spatial clustering of asthma prevalence and alignment with hazardous-waste proximity

Using the queen-contiguity specification described in Section 2.3.3, asthma prevalence exhibited strong positive global spatial autocorrelation. Global Moran’s $I$ was 0.603 (permutation $z = 49.4$, 999 permutations; $p = 0.001$; $n = 2{,}169$), indicating that similar asthma prevalence values were more spatially clustered than expected under spatial randomness. The weights metadata reported one island tract (no queen neighbors), which was retained in the contiguity-based computations.

Local clustering patterns from the Getis–Ord Gi* analysis (Section 2.3.4) are mapped in Figure 1. The map shows the spatial distribution of hotspot/coldspot classifications, with extensive “NotSig” tracts interspersed with statistically significant clusters, consistent with a non-uniform pattern of local spatial association across the state.

![Figure 1: Census tract Getis-Ord Gi* hotspot/coldspot classification for asthma prevalence (Queen contiguity).](asthma_hotspots__d55f31ab.png)

To evaluate whether hazardous-waste proximity aligned with high-asthma clustering (Section 2.3.5), proximity metrics were compared between statistically significant asthma hotspots (Gi* definition: `GiP < 0.05` and `GiZ > 0`) and all other tracts using Mann–Whitney U tests. Of 2,169 tracts with Gi* outputs, 337 were classified as hotspots and 1,832 as non-hotspots. Hotspot tracts had a smaller median distance to the nearest hazardous-waste facility (median = 1,552 m) than non-hotspot tracts (median = 2,277 m), and this distributional difference was statistically significant (U = 269,627; $p < 0.001$). Hotspot tracts also had higher facility counts within 5 km (median = 7) than non-hotspot tracts (median = 4), with a statistically significant difference (U = 352,350; $p < 0.001$). Figure 15 visualizes these contrasts, showing lower central tendency in nearest-site distance and higher central tendency in 5 km facility counts for hotspots relative to other tracts.

![Figure 15: Boxplots comparing nearest hardware distance and hardware counts within 5 km between significant asthma hotspots (Gi* p<0.05, z>0) and all other tracts.](hotspot_vs_nonhotspot_proximity_boxplots.png)

**Hypothesis Assessment (Objective 1).** Global Moran’s $I$ indicated positive and statistically significant clustering of `Asthma_prev` ($I = 0.603$, $p = 0.001$). In addition, significant asthma hotspots (Gi* `p < 0.05`, `z > 0`; $n=337$) were characterized by smaller median `nearest_hw_dist_m` (1,552 m vs. 2,277 m; $p < 0.001$) and larger median `hw_count_5km` (7 vs. 4; $p < 0.001$) compared to non-hotspots. Taken together, the evidence supported the hypothesis that hazardous-waste proximity metrics aligned with high-asthma clusters.

### 3.3 Objective 2 — Contextual moderation and spatial non-stationarity in the proximity–asthma association

#### 3.3.1 Adjusted OLS with interaction terms (global association with contextual moderation)

Using the OLS interaction specification described in Section 2.3.6, the fitted model used $n=2{,}169$ tracts and explained a large share of tract-to-tract variation in asthma prevalence (Table 12; $R^2 = 0.825$, adjusted $R^2 = 0.824$; AIC = 3,547; RMSE = 0.546; robust covariance type HC1). Coefficient estimates with heteroskedasticity-robust (HC1) standard errors are reported in Table 11.

**Table 12.** OLS model diagnostics for asthma prevalence interaction model (R², adjusted R², AIC/BIC, RMSE, and sample size).

|   n_obs |   n_params |      r2 |   adj_r2 |      aic |      bic |   f_statistic |   f_pvalue |     rmse | robust_cov_type   |
|--------:|-----------:|--------:|---------:|---------:|---------:|--------------:|-----------:|---------:|:------------------|
|    2169 |          9 | 0.824628 | 0.823978 | 3547.08  | 3598.21  |       1269.58 |          0 | 0.545849 | HC1               |

**Table 11.** OLS coefficients for asthma prevalence with interaction terms; inference uses heteroskedasticity-robust (HC1) standard errors.

| variable | coef | std_err_hc1 | t_hc1 | p_value_hc1 | ci95_low_hc1 | ci95_high_hc1 |
|---|---:|---:|---:|---:|---:|---:|
| const | 8.597805 | 0.091145 | 94.330703 | p < 0.001 | 8.419064 | 8.776547 |
| ln_nearest_hw_dist_m | 0.144828 | 0.011451 | 12.647142 | p < 0.001 | 0.122371 | 0.167285 |
| z_ratio_poverty | 0.799169 | 0.174368 | 4.583235 | p < 0.001 | 0.457223 | 1.141116 |
| z_ratio_uninsured | 0.111456 | 0.032927 | 3.384982 | p < 0.001 | 0.046885 | 0.176027 |
| z_med_income | -0.382019 | 0.027452 | -13.915661 | p < 0.001 | -0.435855 | -0.328183 |
| z_ratio_black | 0.793183 | 0.114992 | 6.897742 | p < 0.001 | 0.567677 | 1.018689 |
| z_ratio_hispanic | -0.007999 | 0.020142 | -0.397120 | 0.691 | -0.047499 | 0.031501 |
| ln_nearest_hw_dist_m_x_z_ratio_poverty | -0.038129 | 0.025747 | -1.480909 | 0.139 | -0.088621 | 0.012363 |
| ln_nearest_hw_dist_m_x_z_ratio_black | -0.042092 | 0.015348 | -2.742441 | 0.006 | -0.072191 | -0.011993 |

In the adjusted model, the transformed nearest-facility distance (`ln_nearest_hw_dist_m`) was positively associated with `Asthma_prev` (β = 0.145, SE = 0.0115, $p < 0.001$; 95% CI [0.122, 0.167]). Among tract context covariates, standardized poverty ratio (`z_ratio_poverty`) was positive (β = 0.799, SE = 0.174, $p < 0.001$; 95% CI [0.457, 1.141]), standardized uninsured ratio (`z_ratio_uninsured`) was positive (β = 0.111, SE = 0.0329, $p < 0.001$; 95% CI [0.0469, 0.176]), and standardized median income (`z_med_income`) was negative (β = −0.382, SE = 0.0275, $p < 0.001$; 95% CI [−0.436, −0.328]). The standardized Black population ratio (`z_ratio_black`) was positive (β = 0.793, SE = 0.115, $p < 0.001$; 95% CI [0.568, 1.019]), while the standardized Hispanic population ratio (`z_ratio_hispanic`) was not statistically distinguishable from zero (β = −0.00800, SE = 0.0201, $p = 0.691$; 95% CI [−0.0475, 0.0315]).

Regarding effect modification, the interaction between hazardous-waste distance and poverty (`ln_nearest_hw_dist_m_x_z_ratio_poverty`) was not statistically significant (β = −0.0381, SE = 0.0257, $p = 0.139$; 95% CI [−0.0886, 0.0124]). The interaction between hazardous-waste distance and Black population ratio (`ln_nearest_hw_dist_m_x_z_ratio_black`) was negative and statistically significant (β = −0.0421, SE = 0.0153, $p = 0.006$; 95% CI [−0.0722, −0.0120]).

Multicollinearity diagnostics for the interaction model are reported in Table 13. VIF values were near 1–2 for several main effects (e.g., `ln_nearest_hw_dist_m` VIF = 1.20; `z_ratio_uninsured` VIF = 2.16; `z_med_income` VIF = 2.11; `z_ratio_hispanic` VIF = 1.60), but were substantially larger for `z_ratio_poverty`, `z_ratio_black`, and the corresponding interaction terms (VIFs ≈ 58.6–65.8).

**Table 13.** Variance inflation factors (VIF) for the OLS interaction model predictors.

| variable | vif |
|---|---:|
| ln_nearest_hw_dist_m | 1.204681 |
| z_ratio_poverty | 58.942624 |
| z_ratio_uninsured | 2.164871 |
| z_med_income | 2.110209 |
| z_ratio_black | 65.752562 |
| z_ratio_hispanic | 1.597767 |
| ln_nearest_hw_dist_m_x_z_ratio_poverty | 58.615873 |
| ln_nearest_hw_dist_m_x_z_ratio_black | 63.983828 |

#### 3.3.2 Geographically weighted regression (spatially varying associations)

Using the geographically weighted regression specification described in Section 2.3.7, the adaptive bisquare-kernel GWR used a single selected bandwidth of 116 (recorded in `gwr_bw` for all tracts). Local goodness-of-fit varied across space: local $R^2$ ranged from 0.689 to at least 0.90, with a median of 0.880 and mean of 0.859 across the 200 mapped GEOIDs in the GWR output.

Spatial patterns in local coefficient estimates and local $R^2$ are summarized in Figure 2, which collates mapped outputs for each predictor and model fit. The figure allows comparison of where coefficients were positive versus negative and where the model achieved higher or lower local explanatory power.

![Figure 2: Geographically weighted regression (adaptive bisquare kernel; bandwidth selected by AICc) local coefficients for asthma prevalence predictors and local R² by tract GEOID.](gwr_local_coefficients__5db2adb9.png)

To provide variable-specific views of spatial non-stationarity, Figures 4–10 map the GWR intercept and each covariate’s local coefficient surface. Figure 5 maps the local coefficient for `ln_nearest_hw_dist_m`, which varied in sign and magnitude across tracts (range: −0.113 to 0.228; median = 0.109; mean = 0.117). Figure 6 maps `z_med_income`, which was consistently negative in most locations (range: −1.65 to −0.0759; median = −0.538; mean = −0.553). Figures 7–10 show local coefficients for `z_ratio_black` (range: −0.105 to 1.05; median = 0.427), `z_ratio_hispanic` (range: −0.246 to 0.335; median = 0.0902), `z_ratio_poverty` (range: −0.253 to 0.929; median = 0.431), and `z_ratio_uninsured` (range: −0.159 to 0.284; median = 0.0979), indicating spatial heterogeneity in both direction and magnitude for several predictors.

![Figure 4: Gwr thematic map intercept](gwr_thematic_map_Intercept.png)

![Figure 5: Gwr thematic map ln nearest hw dist m](gwr_thematic_map_ln_nearest_hw_dist_m.png)

![Figure 6: Gwr thematic map z med income](gwr_thematic_map_z_med_income.png)

![Figure 7: Gwr thematic map z ratio black](gwr_thematic_map_z_ratio_black.png)

![Figure 8: Gwr thematic map z ratio hispanic](gwr_thematic_map_z_ratio_hispanic.png)

![Figure 9: Gwr thematic map z ratio poverty](gwr_thematic_map_z_ratio_poverty.png)

![Figure 10: Gwr thematic map z ratio uninsured](gwr_thematic_map_z_ratio_uninsured.png)

Prior to fitting the GWR, multicollinearity among the predictor set was assessed via VIF (Section 2.3.6). As shown in Table 14, VIF values for the GWR predictors were all close to 1–2 (`ln_nearest_hw_dist_m` VIF = 1.18; `z_ratio_black` VIF = 1.42; `z_ratio_hispanic` VIF = 1.58; `z_ratio_poverty` VIF = 2.00; `z_ratio_uninsured` VIF = 2.10; `z_med_income` VIF = 2.10), indicating limited multicollinearity within the GWR covariate set.

**Table 14.** Variance inflation factors (VIF) for GWR predictor variables.

| variable | vif |
|---|---:|
| z_med_income | 2.102664 |
| z_ratio_uninsured | 2.100347 |
| z_ratio_poverty | 2.002235 |
| z_ratio_hispanic | 1.578931 |
| z_ratio_black | 1.424054 |
| ln_nearest_hw_dist_m | 1.175010 |

**Hypothesis Assessment (Objective 2).** In the adjusted OLS interaction model, `ln_nearest_hw_dist_m` was positively associated with `Asthma_prev` (β = 0.145, SE = 0.0115, $p < 0.001$), but the poverty interaction term was not statistically significant (β = −0.0381, SE = 0.0257, $p = 0.139$). The interaction with `z_ratio_black` was negative and statistically significant (β = −0.0421, SE = 0.0153, $p = 0.006$), indicating that the fitted distance–asthma slope varied with `z_ratio_black` in the opposite direction to the hypothesized strengthening. The GWR results indicated spatial non-stationarity in the proximity effect, with the local `ln_nearest_hw_dist_m` coefficient ranging from −0.113 to 0.228 and local $R^2$ ranging from 0.689 to at least 0.90 (median = 0.880) under an adaptive bandwidth of 116. Overall, the hypothesis was **partially supported**: evidence for spatial variation in the proximity effect was consistent with the hypothesis, whereas the specified contextual strengthening by poverty and Black population ratio was not consistently supported by the estimated interaction terms.