## 3. Results

### 3.1 Overview

All analyses were conducted at the county scale for South Carolina ($n = 46$ counties), with complete-case coverage across the outcome (`Depression_prev`), exposure (`SES_index`), and both mobility mediators (`log_mobility_total_visits`, `mobility_entropy`) in the integrated analytical GeoPackage (`county_analysis_with_SES_mobility_depression.gpkg`; CRS EPSG:4269). Depression prevalence averaged 20.3 (SD = 1.58) and ranged from 16.6 to 24.5 across counties. The standardized SES index had a near-zero mean (as constructed) with SD = 0.802 and ranged from −1.97 to 1.55. Mobility intensity (log-transformed total visits) averaged 13.4 (SD = 1.35) with a range of 10.7–15.9, while mobility diversity (entropy) averaged 1.90 (SD = 0.050) with a range of 1.80–1.98.

The primary inferential analyses followed the mediation framework described in the Methods (Section 2.2), estimating (i) the total SES–depression association (path $c$), (ii) the SES–mobility association (path $a$), and (iii) the outcome model including both SES and mobility (paths $c'$ and $b$), separately for mobility intensity and mobility diversity mediators. Robust (HC1) standard errors were used for coefficient inference, and Moran’s $I$ residual diagnostics were computed for the direct+mediator outcome models.

### 3.2 Objective 1: Mobility mediation of the SES–depression association

#### Spatial distributions of depression, SES, and mobility intensity

Figure 1 maps county-level depression prevalence across South Carolina.  
![Figure 1: County-level depression prevalence (PLACES) across South Carolina](choropleth_depression_prev.png)

Depression prevalence varied across counties (range: 16.6–24.5), with clear geographic heterogeneity visible in the choropleth rather than a uniform statewide pattern.

Figure 7 maps the standardized county-level SES index used as the focal exposure in the mediation models (higher values indicate higher SES).  
![Figure 7: County-level socioeconomic status (SES) index across South Carolina (higher = higher SES)](choropleth_SES_index.png)

SES showed marked spatial variation across counties (range: −1.97 to 1.55), providing the cross-county contrast that underpinned the regression and mediation decomposition.

Figure 8 maps mobility intensity, operationalized as $\log(1+\text{total visits})$ aggregated across place categories.  
![Figure 8: County-level mobility intensity: log(1 + total place visitation) across South Carolina](choropleth_mobility_log_total_visits.png)

Mobility intensity also displayed substantial spatial variability (range: 10.7–15.9), supporting its use as a candidate mediator between SES and depression prevalence.

To summarize the joint pattern among SES, depression, and mobility intensity, Figure 9 plots SES versus depression prevalence, with point color indicating mobility intensity.  
![Figure 9: Scatterplot of county SES index versus depression prevalence; point color indicates mobility intensity (log total visits).](scatter_SES_vs_depression_colored_by_mobility.png)

The bivariate association between SES and depression prevalence was negative in the scatterplot, consistent with the total-effect regression estimates reported below; mobility intensity varied across the SES range and was not visually concentrated only among the highest- or lowest-SES counties.

#### Mediation results: mobility intensity as mediator (log total visits)

Using the mediation specification described in Section 2.2, the total-effect model estimated a negative SES–depression association: $\beta_{SES} = -0.943$ (SE = 0.273, $p = 0.00135$; 95% CI: −1.50, −0.391) (Table 3; model “MobilityTotalVisits_log1p: total”). Model fit for this total-effect specification was $R^2 = 0.672$ (adjusted $R^2 = 0.621$; $n=46$) (Table 4).

In the mediator (a-path) model predicting mobility intensity, SES was positively associated with log mobility intensity: $\beta_{SES} = 0.576$ (SE = 0.185, $p = 0.00343$; 95% CI: 0.202, 0.950) (Table 3; model “MobilityTotalVisits_log1p: a-path”). This mediator model had $R^2 = 0.798$ (adjusted $R^2 = 0.767$) (Table 4).

In the direct+mediator outcome model, the direct SES effect remained negative and similar in magnitude to the total effect: $\beta_{SES} = -0.978$ (SE = 0.300, $p = 0.00235$; 95% CI: −1.58, −0.371). The mediator (log mobility intensity) was not associated with depression prevalence conditional on SES and controls: $\beta_{M} = 0.0602$ (SE = 0.199, $p = 0.765$; 95% CI: −0.344, 0.464) (Table 3; model “MobilityTotalVisits_log1p: b/c'-paths”). The non-robust fit summary for this direct+mediator specification was $R^2 = 0.672$ (adjusted $R^2 = 0.612$) (Table 4).

The product-of-coefficients indirect effect for mobility intensity was $ab = 0.0346$ with Sobel SE = 0.115 and Sobel $z = 0.300$ ($p = 0.764$), corresponding to an estimated proportion mediated of $ab/c = -0.0367$ (Table 2). Moran’s $I$ computed on residuals from the direct+mediator outcome model was 0.0147 with simulation-based $p = 0.332$ ($z = 0.425$), indicating no detected residual spatial autocorrelation at conventional levels (Table 2).

Table 2 reports the mediation decomposition and residual spatial diagnostics for both mobility mediators.  

**Table 2.** Key quantitative results: mediation estimates (a, b, c, c', indirect effect with Sobel test) and Moran's I residual autocorrelation diagnostics.

| section | mediation_label | mediator | n | c_total_SES_effect | cp_direct_SES_effect | a_SES_to_M | b_M_to_y | indirect_ab | indirect_se | sobel_z | sobel_p | prop_mediated_ab_over_c | R2_total_model | R2_direct_mediator_model | metric | model | moran_I | moran_p_sim | moran_z_sim |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|---:|
| mediation_results | MobilityTotalVisits_log1p | log_mobility_total_visits | 46 | -0.943157 | -0.977802 | 0.575835 | 0.060166 | 0.034645 | 0.115400 | 0.300222 | 0.764008 | -0.036733 | 0.671904 | 0.672434 | NaN | NaN | NaN | NaN | NaN |
| mediation_results | MobilityDiversity_entropy | mobility_entropy | 46 | -0.943157 | -0.902485 | 0.015172 | -2.680683 | -0.040672 | 0.059801 | -0.680117 | 0.496430 | 0.043123 | 0.671904 | 0.676597 | NaN | NaN | NaN | NaN | NaN |
| spatial_residual_diagnostics | NaN | NaN | 46 | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | Moran_I_residuals | MobilityTotalVisits_log1p_direct_plus_mediator | 0.014694 | 0.332 | 0.424508 |
| spatial_residual_diagnostics | NaN | NaN | 46 | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | Moran_I_residuals | MobilityDiversity_entropy_direct_plus_mediator | -0.045104 | 0.409 | -0.241048 |

#### Mediation results: mobility diversity as mediator (entropy)

For the mobility-diversity mediator, the total-effect model was the same SES–depression specification and yielded the identical total effect estimate: $\beta_{SES} = -0.943$ (SE = 0.273, $p = 0.00135$; 95% CI: −1.50, −0.391) (Table 3). The non-robust model fit remained $R^2 = 0.672$ (Table 4).

In the mediator (a-path) model for mobility entropy, SES was not associated with entropy: $\beta_{SES} = 0.0152$ (SE = 0.0118, $p = 0.205$; 95% CI: −0.00863, 0.0390) (Table 3; model “MobilityDiversity_entropy: a-path”). This mediator model had substantially lower fit than the mobility-intensity mediator model ($R^2 = 0.341$, adjusted $R^2 = 0.239$) (Table 4).

In the direct+mediator outcome model, the direct SES effect remained negative: $\beta_{SES} = -0.902$ (SE = 0.262, $p = 0.00142$; 95% CI: −1.43, −0.372). Mobility entropy was not associated with depression prevalence conditional on SES and controls: $\beta_{M} = -2.68$ (SE = 3.35, $p = 0.428$; 95% CI: −9.46, 4.10) (Table 3; model “MobilityDiversity_entropy: b/c'-paths”). The corresponding non-robust fit was $R^2 = 0.677$ (adjusted $R^2 = 0.617$) (Table 4).

The estimated indirect effect for mobility entropy was $ab = -0.0407$ (Sobel SE = 0.0598), with Sobel $z = -0.680$ ($p = 0.496$) and an estimated proportion mediated of $ab/c = 0.0431$ (Table 2). Moran’s $I$ on residuals from the entropy direct+mediator model was −0.0451 with simulation-based $p = 0.409$ ($z = -0.241$), again not indicating residual spatial autocorrelation (Table 2).

#### Coefficient summaries and model fit across mediation specifications

Table 3 reports the HC1-robust coefficient estimates and 95% confidence intervals for the three-model mediation sequence for each mediator. Across both mediator sets, the SES coefficient remained negative and statistically distinguishable from zero in all outcome models (total and direct+mediator), while the mediator coefficients ($b$ paths) were not distinguishable from zero (Table 3).  

**Table 3.** OLS coefficient tables (HC1 robust standard errors) for mediation models: total effect, mediator model, and direct+mediator outcome model.

| model | variable | beta | std_err | t | p_value | ci_low | ci_high |
|---|---|---:|---:|---:|---:|---:|---:|
| MobilityTotalVisits_log1p: total (y~SES+controls) | const | 36.730425 | 8.902213 | 4.125988 | 1.875487e-04 | 18.724000 | 54.736850 |
| MobilityTotalVisits_log1p: total (y~SES+controls) | SES_index | -0.943157 | 0.273111 | -3.453385 | 1.347727e-03 | -1.495576 | -0.390738 |
| MobilityTotalVisits_log1p: total (y~SES+controls) | percent_White | 0.040584 | 0.097560 | 0.415993 | 6.796953e-01 | -0.156749 | 0.237918 |
| MobilityTotalVisits_log1p: total (y~SES+controls) | percent_Black | -0.055343 | 0.096724 | -0.572174 | 5.704880e-01 | -0.250986 | 0.140300 |
| MobilityTotalVisits_log1p: total (y~SES+controls) | percent_Hispanic | -0.156438 | 0.101360 | -1.543398 | 1.308105e-01 | -0.361457 | 0.048581 |
| MobilityTotalVisits_log1p: total (y~SES+controls) | percent_>=18 | -0.198476 | 0.081701 | -2.429309 | 1.983522e-02 | -0.363731 | -0.033221 |
| MobilityTotalVisits_log1p: total (y~SES+controls) | percent_Male | -0.008644 | 0.084357 | -0.102468 | 9.189102e-01 | -0.179272 | 0.161984 |
| MobilityTotalVisits_log1p: a-path (M~SES+controls) | const | 52.725378 | 7.334269 | 7.188907 | 1.181126e-08 | 37.890418 | 67.560338 |
| MobilityTotalVisits_log1p: a-path (M~SES+controls) | SES_index | 0.575835 | 0.184804 | 3.115920 | 3.433691e-03 | 0.202033 | 0.949637 |
| MobilityTotalVisits_log1p: a-path (M~SES+controls) | percent_White | -0.256782 | 0.080377 | -3.194708 | 2.770741e-03 | -0.419361 | -0.094204 |
| MobilityTotalVisits_log1p: a-path (M~SES+controls) | percent_Black | -0.278783 | 0.080500 | -3.463162 | 1.310903e-03 | -0.441609 | -0.115957 |
| MobilityTotalVisits_log1p: a-path (M~SES+controls) | percent_Hispanic | -0.227912 | 0.073924 | -3.083047 | 3.752451e-03 | -0.377437 | -0.078386 |
| MobilityTotalVisits_log1p: a-path (M~SES+controls) | percent_>=18 | -0.044522 | 0.075748 | -0.587771 | 5.600740e-01 | -0.197736 | 0.108692 |
| MobilityTotalVisits_log1p: a-path (M~SES+controls) | percent_Male | -0.212667 | 0.085979 | -2.473478 | 1.784153e-02 | -0.386575 | -0.038758 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | const | 33.558176 | 13.079053 | 2.565796 | 1.436197e-02 | 7.081018 | 60.035334 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | SES_index | -0.977802 | 0.299901 | -3.260416 | 2.350923e-03 | -1.584920 | -0.370684 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | log_mobility_total_visits | 0.060166 | 0.199471 | 0.301625 | 7.645826e-01 | -0.343643 | 0.463974 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | percent_White | 0.056034 | 0.107324 | 0.522100 | 6.046311e-01 | -0.161232 | 0.273299 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | percent_Black | -0.038570 | 0.107655 | -0.358273 | 7.221214e-01 | -0.256506 | 0.179366 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | percent_Hispanic | -0.142726 | 0.105392 | -1.354232 | 1.836612e-01 | -0.356081 | 0.070630 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | percent_>=18 | -0.195797 | 0.083139 | -2.355064 | 2.378565e-02 | -0.364103 | -0.027491 |
| MobilityTotalVisits_log1p: b/c'-paths (y~SES+M+controls) | percent_Male | 0.004151 | 0.099524 | 0.041711 | 9.669472e-01 | -0.197325 | 0.205627 |
| MobilityDiversity_entropy: total (y~SES+controls) | const | 36.730425 | 8.902213 | 4.125988 | 1.875487e-04 | 18.724000 | 54.736850 |
| MobilityDiversity_entropy: total (y~SES+controls) | SES_index | -0.943157 | 0.273111 | -3.453385 | 1.347727e-03 | -1.495576 | -0.390738 |
| MobilityDiversity_entropy: total (y~SES+controls) | percent_White | 0.040584 | 0.097560 | 0.415993 | 6.796953e-01 | -0.156749 | 0.237918 |
| MobilityDiversity_entropy: total (y~SES+controls) | percent_Black | -0.055343 | 0.096724 | -0.572174 | 5.704880e-01 | -0.250986 | 0.140300 |
| MobilityDiversity_entropy: total (y~SES+controls) | percent_Hispanic | -0.156438 | 0.101360 | -1.543398 | 1.308105e-01 | -0.361457 | 0.048581 |
| MobilityDiversity_entropy: total (y~SES+controls) | percent_>=18 | -0.198476 | 0.081701 | -2.429309 | 1.983522e-02 | -0.363731 | -0.033221 |
| MobilityDiversity_entropy: total (y~SES+controls) | percent_Male | -0.008644 | 0.084357 | -0.102468 | 9.189102e-01 | -0.179272 | 0.161984 |
| MobilityDiversity_entropy: a-path (M~SES+controls) | const | 3.486649 | 0.404012 | 8.630064 | 1.395275e-10 | 2.669458 | 4.303840 |
| MobilityDiversity_entropy: a-path (M~SES+controls) | SES_index | 0.015172 | 0.011765 | 1.289596 | 2.047865e-01 | -0.008625 | 0.038969 |
| MobilityDiversity_entropy: a-path (M~SES+controls) | percent_White | -0.016432 | 0.004284 | -3.835695 | 4.460755e-04 | -0.025097 | -0.007767 |
| MobilityDiversity_entropy: a-path (M~SES+controls) | percent_Black | -0.015177 | 0.004316 | -3.516405 | 1.126697e-03 | -0.023907 | -0.006447 |
| MobilityDiversity_entropy: a-path (M~SES+controls) | percent_Hispanic | -0.013576 | 0.004734 | -2.867901 | 6.634103e-03 | -0.023151 | -0.004001 |
| MobilityDiversity_entropy: a-path (M~SES+controls) | percent_>=18 | 0.000521 | 0.003162 | 0.164689 | 8.700397e-01 | -0.005875 | 0.006917 |
| MobilityDiversity_entropy: a-path (M~SES+controls) | percent_Male | -0.002182 | 0.004550 | -0.479526 | 6.342430e-01 | -0.011385 | 0.007021 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | const | 46.077026 | 17.199930 | 2.678908 | 1.085429e-02 | 11.257587 | 80.896464 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | SES_index | -0.902485 | 0.262165 | -3.442437 | 1.417442e-03 | -1.433210 | -0.371761 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | mobility_entropy | -2.680683 | 3.348795 | -0.800492 | 4.284024e-01 | -9.459964 | 4.098598 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | percent_White | -0.003464 | 0.122187 | -0.028354 | 9.775283e-01 | -0.250820 | 0.243891 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | percent_Black | -0.096028 | 0.118781 | -0.808444 | 4.238675e-01 | -0.336488 | 0.144432 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | percent_Hispanic | -0.192831 | 0.120215 | -1.604048 | 1.169839e-01 | -0.436194 | 0.050532 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | percent_>=18 | -0.197080 | 0.081217 | -2.426592 | 2.009413e-02 | -0.361495 | -0.032665 |
| MobilityDiversity_entropy: b/c'-paths (y~SES+M+controls) | percent_Male | -0.014493 | 0.086554 | -0.167443 | 8.679096e-01 | -0.189712 | 0.160726 |

Table 4 reports non-robust fit summaries for each model in the mediation sequence; across the two mediator sets, the outcome-model $R^2$ values were similar (0.672–0.677), while the mediator-model $R^2$ differed substantially between mobility intensity (0.798) and mobility entropy (0.341).  

**Table 4.** Model fit statistics (non-robust OLS) for total, mediator, and direct+mediator models.

| model | n | k | R2 | adj_R2 | AIC | BIC | F | F_pvalue | RMSE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| MobilityTotalVisits_log1p_total_nonrobust | 46 | 6 | 0.671904 | 0.621427 | 134.508451 | 147.308940 | 13.311247 | 3.805982e-08 | 0.896673 |
| MobilityTotalVisits_log1p_a_nonrobust | 46 | 6 | 0.798235 | 0.767194 | 97.442130 | 110.242620 | 25.715731 | 4.005082e-12 | 0.599320 |
| MobilityTotalVisits_log1p_b_nonrobust | 46 | 7 | 0.672434 | 0.612093 | 136.434002 | 151.063133 | 11.143885 | 1.434707e-07 | 0.895948 |
| MobilityDiversity_entropy_total_nonrobust | 46 | 6 | 0.671904 | 0.621427 | 134.508451 | 147.308940 | 13.311247 | 3.805982e-08 | 0.896673 |
| MobilityDiversity_entropy_a_nonrobust | 46 | 6 | 0.340745 | 0.239321 | -151.582232 | -138.781742 | 3.359617 | 9.137242e-03 | 0.040005 |
| MobilityDiversity_entropy_b_nonrobust | 46 | 7 | 0.676597 | 0.617022 | 135.845718 | 150.474849 | 11.357188 | 1.141393e-07 | 0.890237 |

#### Multicollinearity diagnostics (VIF)

Multicollinearity diagnostics for the direct+mediator outcome models are reported in Tables 5–6. In both outcome specifications, the largest VIF values were observed for the race/ethnicity composition covariates (e.g., percent White and percent Black), with VIFs exceeding 100 in both mediator models (Tables 5–6). In contrast, SES and the mediator terms exhibited lower VIFs: for the entropy model, VIF was 2.18 for SES and 1.52 for mobility entropy (Table 5); for the log-total-visits model, VIF was 2.67 for SES and 4.96 for log mobility intensity (Table 6).

**Table 5.** Variance inflation factors (VIF) for predictors in the MobilityDiversity_entropy mediation outcome model.

| variable | VIF |
|---|---:|
| SES_index | 2.176474 |
| mobility_entropy | 1.516864 |
| percent_White | 165.994409 |
| percent_Black | 195.832276 |
| percent_Hispanic | 6.696858 |
| percent_>=18 | 2.106701 |
| percent_Male | 1.843398 |

**Table 6.** Variance inflation factors (VIF) for predictors in the MobilityTotalVisits_log1p mediation outcome model.

| variable | VIF |
|---|---:|
| SES_index | 2.666854 |
| log_mobility_total_visits | 4.956266 |
| percent_White | 169.161944 |
| percent_Black | 215.177841 |
| percent_Hispanic | 6.955917 |
| percent_>=18 | 2.138240 |
| percent_Male | 2.266810 |