## 3. Results

### 3.1 Overview
All analyses were conducted at the county level for South Carolina. After key harmonization and validation, the analytical sample comprised **46/46 counties** with complete data for depression prevalence and all retained socioeconomic and demographic covariates (0 missing values for `Depression_prev`, `Med_income`, `percent_Poverty`, `percent_Unemployed`, `percent_Uninsured`, `percent_>=HighSch`, `percent_>=18`, `percent_Black`, and `percent_Hispanic`). The GIS-ready polygon layer used for mapping and spatial diagnostics (`counties_ses_depression.gpkg`) also contained **46 counties** in **EPSG:4269**, with a join audit confirming **46/46 (100.0%)** matched records and no unmatched counties.

Across counties, depression prevalence (`Depression_prev`) averaged **20.3** (SD = **1.58**; range **16.6–22.2**). Median household income (`Med_income`) averaged **$50,335** (SD = **$11,240**; range **$31,800–$74,199**), and the percent in poverty averaged **16.6%** (SD = **4.33**; range **8.4%–26.1%**). Mobility indicators were derived from ten POI-category visit counts per county and summarized both as Shannon entropy (`mobility_diversity`) and principal component scores (`mobility_PC1`, `mobility_PC2`) from PCA on standardized category shares (Methods, Section 2.2–2.3).

For geographic orientation and verification of the mapped analytical layer, Figure 11 displays the South Carolina county polygons enriched with depression, SES, and demographic attributes.
  
![Figure 11: South Carolina county polygons enriched with depression prevalence and SES/demographic indicators for choropleth mapping.](counties_ses_depression__70942a90.png)

The polygon layer shown in Figure 11 constituted the spatial backbone for subsequent mapping of geographically varying relationships in the GWR models (Section 3.4) and for constructing spatial weights used in residual spatial-autocorrelation testing (Table 1).

---

### 3.2 Objective 1: County-level association between socioeconomic status and depression prevalence
Using the robust OLS specification described in Methods (Section 2.3; `Depression_prev ~ SES_index + percent_>=18 + percent_Black + percent_Hispanic` with HC1 standard errors), the composite socioeconomic status index exhibited a negative association with depression prevalence. Specifically, `SES_index` was estimated as **β = −0.966** (HC1 SE = **0.268**; 95% CI: **[−1.51, −0.425]**; p < 0.001), indicating lower depression prevalence at higher SES index values after demographic adjustment. Additional covariates were also negative: `percent_>=18` had **β = −0.193** (SE = **0.0540**; 95% CI: **[−0.302, −0.0838]**; p = 0.001), `percent_Black` had **β = −0.0951** (SE = **0.0148**; 95% CI: **[−0.125, −0.0652]**; p < 0.001), and `percent_Hispanic` had **β = −0.197** (SE = **0.0548**; 95% CI: **[−0.307, −0.0858]**; p < 0.001).

**Table 17** reports the full set of HC1-robust coefficient estimates for the Objective 1 OLS model.

**Table 17.** OLS coefficients for Depression prevalence with HC1 robust standard errors (county level).

| term | estimate | std_error_HC1 | t_stat_HC1 | p_value_HC1 | ci95_low_HC1 | ci95_high_HC1 |
|---|---:|---:|---:|---:|---:|---:|
| const | 39.740142 | 4.136201 | 9.607884 | 4.683952e-12 | 31.386914 | 48.093370 |
| SES_index | -0.966279 | 0.267930 | -3.606463 | 8.343914e-04 | -1.507374 | -0.425184 |
| percent_>=18 | -0.192874 | 0.053997 | -3.571928 | 9.226584e-04 | -0.301924 | -0.083825 |
| percent_Black | -0.095082 | 0.014804 | -6.422570 | 1.084092e-07 | -0.124980 | -0.065184 |
| percent_Hispanic | -0.196530 | 0.054819 | -3.585045 | 8.881255e-04 | -0.307240 | -0.085820 |

Visual diagnostics for the OLS model are shown in Figures 21–22. Figure 21 plots residuals against fitted values as a visual check for systematic mean–variance patterns, while Figure 22 displays the residual Q–Q plot to assess distributional departures in the tails.

![Figure 21: Residuals versus fitted values from the county-level OLS model (visual check for heteroskedasticity/nonlinearity).](ols_residuals_vs_fitted.png)

The residual–fitted scatter in Figure 21 did not exhibit a strong curved mean structure, and Figure 22 indicated that residual quantiles broadly tracked the reference line with visible deviations in the tails.

![Figure 22: Q-Q plot of OLS residuals (visual check for departures from normality).](ols_residuals_qqplot.png)

**Hypothesis Assessment (Objective 1).** The SES–depression hypothesis was evaluated using the adjusted association between `SES_index` and `Depression_prev`. The estimated coefficient for `SES_index` was negative and statistically different from zero (β = −0.966; 95% CI: [−1.51, −0.425]; p < 0.001), consistent with higher depression prevalence in counties with lower socioeconomic status (as operationalized by the composite index). **Verdict: supported.**

---

### 3.3 Objective 2: Socioeconomic gradients in place-visitation composition summaries
Two mobility summaries were modeled as outcomes using robust OLS (Methods, Section 2.3): (i) `mobility_PC1`, the first principal-component score derived from standardized POI-category visitation shares, and (ii) `mobility_diversity`, Shannon entropy across the ten POI-category shares. **Table 18** provides HC1-robust coefficient estimates and model fit statistics for both models (N = 46 each).

For the `mobility_PC1` model, several SES variables were negatively associated with the PC1 score: `Med_income` (β = **−0.000131**, SE = **0.000018**, p < 0.001; 95% CI: **[−0.000167, −0.000095]**), `percent_Unemployed` (β = **−0.272**, SE = **0.103**, p = 0.008; 95% CI: **[−0.474, −0.0697]**), `percent_Uninsured` (β = **−0.230**, SE = **0.0565**, p < 0.001; 95% CI: **[−0.340, −0.119]**), and `percent_>=HighSch` (β = **−0.279**, SE = **0.0334**, p < 0.001; 95% CI: **[−0.345, −0.214]**). The fitted model for `mobility_PC1` had **R² = 0.913** (adjusted R² = **0.894**, N = **46**).

For the `mobility_diversity` model, covariate associations were generally smaller in magnitude and less precisely estimated; `percent_Black` was positive and statistically different from zero (β = **0.000988**, SE = **0.000405**, p = 0.015), while `Med_income` and `percent_>=HighSch` were positive but not statistically different from zero at conventional levels (p = 0.094 and p = 0.088, respectively). The fitted `mobility_diversity` model had **R² = 0.289** (adjusted R² = **0.135**, N = **46**).

**Table 18.** OLS regression results with HC1 robust standard errors for mobility_PC1 and mobility_diversity as functions of SES and demographic covariates.

| model | dependent | variable | coef | std_err_HC1 | t_stat | p_value | r_squared | adj_r_squared | n_obs |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| OLS_1_mobility_PC1 | mobility_PC1 | const | 46.308740 | 4.660423 | 9.936596 | 2.885184e-23 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | Med_income | -0.000131 | 0.000018 | -7.076954 | 1.473574e-12 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | percent_Poverty | -0.071897 | 0.042657 | -1.685458 | 9.190017e-02 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | percent_Unemployed | -0.271613 | 0.103032 | -2.636194 | 8.384189e-03 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | percent_Uninsured | -0.229628 | 0.056549 | -4.060700 | 4.892590e-05 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | percent_>=HighSch | -0.279192 | 0.033363 | -8.368370 | 5.842056e-17 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | percent_>=18 | -0.138417 | 0.031981 | -4.328101 | 1.504007e-05 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | percent_Black | -0.014114 | 0.009832 | -1.435485 | 1.511489e-01 | 0.912547 | 0.893638 | 46 |
| OLS_1_mobility_PC1 | mobility_PC1 | percent_Hispanic | 0.032996 | 0.031350 | 1.052501 | 2.925697e-01 | 0.912547 | 0.893638 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | const | 1.423868 | 0.417087 | 3.413836 | 6.405505e-04 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | Med_income | 0.000003 | 0.000002 | 1.673770 | 9.417578e-02 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | percent_Poverty | 0.002844 | 0.003317 | 0.857556 | 3.911379e-01 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | percent_Unemployed | 0.009797 | 0.008226 | 1.190966 | 2.336668e-01 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | percent_Uninsured | 0.002008 | 0.004439 | 0.452291 | 6.510595e-01 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | percent_>=HighSch | 0.004722 | 0.002767 | 1.706377 | 8.793795e-02 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | percent_>=18 | -0.002573 | 0.002785 | -0.923768 | 3.556070e-01 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | percent_Black | 0.000988 | 0.000405 | 2.440289 | 1.467552e-02 | 0.288837 | 0.135072 | 46 |
| OLS_2_mobility_diversity | mobility_diversity | percent_Hispanic | -0.000279 | 0.003375 | -0.082645 | 9.341340e-01 | 0.288837 | 0.135072 | 46 |

**Hypothesis Assessment (Objective 2).** The hypothesis predicted systematic differences in visitation composition summaries and *lower* `mobility_diversity` in lower-SES counties. In the `mobility_PC1` model, multiple SES variables were statistically associated with `mobility_PC1` (e.g., `Med_income` β = −0.000131, p < 0.001; `percent_Uninsured` β = −0.230, p < 0.001; `percent_>=HighSch` β = −0.279, p < 0.001), indicating that mobility composition gradients varied with SES. In contrast, the `mobility_diversity` model did not exhibit statistically different-from-zero associations for core SES variables (`Med_income` p = 0.094; `percent_>=HighSch` p = 0.088; others p ≥ 0.23), and the direction was not consistently negative. **Verdict: partially supported** (supported for systematic differences in composition via `mobility_PC1`, not supported for lower entropy-based diversity).

---

### 3.4 Objective 3: Mediation by mobility composition and spatial dependence in the SES–depression relationship
Objective 3 evaluated (i) whether mobility composition (operationalized via `mobility_PC1`) transmitted indirect effects from SES variables to depression prevalence, and (ii) whether accounting for spatial structure altered inference (Methods, Section 2.3). Results are reported for the mediator model, the depression outcome model including mobility, bootstrap mediation effects, residual spatial autocorrelation, a spatial error model (SEM), and geographically weighted regression (GWR).

#### 3.4.1 Mediator model (mobility_PC1)
The mediator model regressed `mobility_PC1` on SES variables and demographic covariates using HC1-robust inference. **Table 16** shows that `mobility_PC1` was negatively associated with `Med_income` (β = **−0.000131**, SE = **0.000018**, 95% CI: **[−0.000167, −0.000095]**, p < 0.001), `percent_Unemployed` (β = **−0.272**, SE = **0.103**, 95% CI: **[−0.474, −0.0697]**, p = 0.008), `percent_Uninsured` (β = **−0.230**, SE = **0.0565**, 95% CI: **[−0.340, −0.119]**, p < 0.001), and `percent_>=HighSch` (β = **−0.279**, SE = **0.0334**, 95% CI: **[−0.345, −0.214]**, p < 0.001). `percent_Poverty` was negative but not statistically different from zero (p = 0.092).

**Table 16.** OLS mediator model coefficients with HC1 robust standard errors for mobility_PC1 regressed on SES and demographic covariates.

| variable | coef | std_err_HC1 | t_HC1 | p_value_HC1 | ci95_low_HC1 | ci95_high_HC1 |
|---|---:|---:|---:|---:|---:|---:|
| const | 46.308740 | 4.660423 | 9.936596 | 2.885184e-23 | 37.174479 | 55.443001 |
| Med_income | -0.000131 | 0.000018 | -7.076954 | 1.473574e-12 | -0.000167 | -0.000095 |
| percent_Poverty | -0.071897 | 0.042657 | -1.685458 | 9.190017e-02 | -0.155503 | 0.011710 |
| percent_Unemployed | -0.271613 | 0.103032 | -2.636194 | 8.384189e-03 | -0.473552 | -0.069673 |
| percent_Uninsured | -0.229628 | 0.056549 | -4.060700 | 4.892590e-05 | -0.340461 | -0.118794 |
| percent_>=HighSch | -0.279192 | 0.033363 | -8.368370 | 5.842056e-17 | -0.344582 | -0.213803 |
| percent_>=18 | -0.138417 | 0.031981 | -4.328101 | 1.504007e-05 | -0.201098 | -0.075735 |
| percent_Black | -0.014114 | 0.009832 | -1.435485 | 1.511489e-01 | -0.033386 | 0.005157 |
| percent_Hispanic | 0.032996 | 0.031350 | 1.052501 | 2.925697e-01 | -0.028449 | 0.094441 |

#### 3.4.2 Outcome model including mobility_PC1
The depression outcome model included SES variables, `mobility_PC1`, and demographic covariates with HC1-robust inference (Table 19). In this specification, `Med_income` remained negatively associated with `Depression_prev` (β = **−0.000100**, SE = **0.000037**, 95% CI: **[−0.000171, −0.000028]**, p = 0.007). `percent_>=18` and `percent_Black` were also negative and precisely estimated (β = **−0.260**, p < 0.001; and β = **−0.106**, p < 0.001, respectively). `mobility_PC1` was negative but not statistically different from zero (β = **−0.220**, SE = **0.221**, 95% CI: **[−0.653, 0.214]**, p = 0.321).

**Table 19.** OLS outcome model coefficients with HC1 robust standard errors for county-level depression prevalence.

| variable | coef | std_err_hc1 | t_hc1 | p_value_hc1 | ci_low_hc1 | ci_high_hc1 |
|---|---:|---:|---:|---:|---:|---:|
| const | 57.814053 | 11.054490 | 5.229916 | 1.695872e-07 | 36.147651 | 79.480456 |
| Med_income | -0.000100 | 0.000037 | -2.715359 | 6.620405e-03 | -0.000171 | -0.000028 |
| percent_Poverty | 0.050220 | 0.084910 | 0.591450 | 5.542193e-01 | -0.116200 | 0.216640 |
| percent_Unemployed | -0.139136 | 0.136600 | -1.018572 | 3.084061e-01 | -0.406867 | 0.128594 |
| percent_Uninsured | -0.110090 | 0.096753 | -1.137856 | 2.551806e-01 | -0.299722 | 0.079541 |
| percent_>=HighSch | -0.081172 | 0.080245 | -1.011547 | 3.117548e-01 | -0.238449 | 0.076106 |
| mobility_PC1 | -0.219611 | 0.221182 | -0.992896 | 3.207605e-01 | -0.653120 | 0.213898 |
| percent_>=18 | -0.259562 | 0.053655 | -4.837625 | 1.313998e-06 | -0.364724 | -0.154400 |
| percent_Black | -0.106296 | 0.014600 | -7.280364 | 3.329202e-13 | -0.134912 | -0.077680 |
| percent_Hispanic | -0.121825 | 0.056682 | -2.149255 | 3.161416e-02 | -0.232920 | -0.010729 |

#### 3.4.3 Bootstrap mediation effects via mobility_PC1
Bootstrap mediation decompositions (ACME = indirect effect via `mobility_PC1`, ADE = direct effect, Total = ACME + ADE) are reported in **Table 15** with percentile 95% confidence intervals (5,000 bootstrap replications; N complete cases = 46). Across the SES variables evaluated, all ACME intervals included zero. For example, for `Med_income`, ACME was **0.000029** with 95% CI **[−0.000039, 0.000091]**, while ADE was **−0.000100** with 95% CI **[−0.000182, −0.000018]**, and Total was **−0.000071** with 95% CI **[−0.000131, −0.000017]**. For `percent_Poverty`, ACME was **0.0158** (95% CI **[−0.0319, 0.0634]**), with Total **0.0660** (95% CI **[−0.112, 0.231]**).

**Table 15.** Bootstrap mediation effects (ACME, ADE, Total) of socioeconomic variables on depression prevalence via mobility_PC1, with percentile 95% confidence intervals.

| variable | effect | estimate | bootstrap_mean | ci_low | ci_high | n_complete_cases | n_bootstrap | seed | ci_method |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Med_income | ACME | 0.000029 | 0.000025 | -0.000039 | 0.000091 | 46 | 5000 | 12345 | percentile |
| Med_income | ADE | -0.000100 | -0.000097 | -0.000182 | -0.000018 | 46 | 5000 | 12345 | percentile |
| Med_income | Total | -0.000071 | -0.000072 | -0.000131 | -0.000017 | 46 | 5000 | 12345 | percentile |
| percent_Poverty | ACME | 0.015789 | 0.011976 | -0.031920 | 0.063441 | 46 | 5000 | 12345 | percentile |
| percent_Poverty | ADE | 0.050220 | 0.051788 | -0.125532 | 0.228288 | 46 | 5000 | 12345 | percentile |
| percent_Poverty | Total | 0.066009 | 0.063764 | -0.111602 | 0.230815 | 46 | 5000 | 12345 | percentile |
| percent_Unemployed | ACME | 0.059649 | 0.054464 | -0.089069 | 0.237230 | 46 | 5000 | 12345 | percentile |
| percent_Unemployed | ADE | -0.139136 | -0.133901 | -0.467475 | 0.211739 | 46 | 5000 | 12345 | percentile |
| percent_Unemployed | Total | -0.079487 | -0.079437 | -0.359049 | 0.212806 | 46 | 5000 | 12345 | percentile |
| percent_Uninsured | ACME | 0.050429 | 0.046191 | -0.060735 | 0.170639 | 46 | 5000 | 12345 | percentile |
| percent_Uninsured | ADE | -0.110090 | -0.124550 | -0.350838 | 0.086918 | 46 | 5000 | 12345 | percentile |
| percent_Uninsured | Total | -0.059662 | -0.078359 | -0.289748 | 0.093371 | 46 | 5000 | 12345 | percentile |
| percent_>=HighSch | ACME | 0.061314 | 0.051860 | -0.091464 | 0.185882 | 46 | 5000 | 12345 | percentile |
| percent_>=HighSch | ADE | -0.081172 | -0.068740 | -0.232951 | 0.127379 | 46 | 5000 | 12345 | percentile |
| percent_>=HighSch | Total | -0.019858 | -0.016879 | -0.147985 | 0.123467 | 46 | 5000 | 12345 | percentile |

#### 3.4.4 Spatial dependence: residual autocorrelation and SEM robustness
Global Moran’s I was computed for the outcome-model residuals using aligned Queen contiguity weights (999 permutations). As reported in **Table 1**, Moran’s I for the outcome residuals was **−0.0673** with permutation p-value **0.321**, indicating no statistically detectable global spatial autocorrelation in residuals under this specification.

**Table 1.** Global Moran’s I test (with permutation p-value) for spatial autocorrelation in Depression_prev outcome-model residuals using aligned Queen contiguity weights.

| variable | morans_I | expected_I | variance_norm | z_norm | p_perm | permutations | n | s0 | n_islands |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| outcome_residual | -0.067247 | -0.022222 | 0.008419 | -0.490694 | 0.321 | 999 | 46 | 46.0 | 0 |

A spatial error model (SEM) was also estimated as a robustness check (Table 20). The SEM estimated the spatial error parameter as **λ = −0.286** (SE = **0.238**, p = 0.229). Coefficient patterns for key covariates were similar in sign to the non-spatial outcome model for several terms, including `Med_income` (estimate **−9.63e−05**, p = 0.010), `percent_>=18` (estimate **−0.272**, p < 0.001), `percent_Black` (estimate **−0.109**, p < 0.001), and `percent_Hispanic` (estimate **−0.115**, p = 0.021). The SEM model fit summary reported pseudo-$R^2$ = **0.735** and AIC = **129.2** (N = 46, k = 10).

**Table 20.** Spatial error (SEM) regression results for Depression prevalence with aligned Queen contiguity weights (coefficients, lambda, standard errors, and fit statistics).

| category | term | estimate | std_err | z | p_value |
|---|---|---:|---:|---:|---:|
| coefficient | CONSTANT | 58.411955066529345 | 11.917606 | 4.901316 | 9.519672e-07 |
| coefficient | Med_income | -9.633172785577203e-05 | 0.000037 | -2.593223 | 9.508109e-03 |
| coefficient | percent_Poverty | 0.03801344179357413 | 0.062717 | 0.606107 | 5.444438e-01 |
| coefficient | percent_Unemployed | -0.1129639237560518 | 0.153228 | -0.737226 | 4.609849e-01 |
| coefficient | percent_Uninsured | -0.12785191717234046 | 0.092621 | -1.380372 | 1.674723e-01 |
| coefficient | percent_>=HighSch | -0.07418646333801937 | 0.076455 | -0.970324 | 3.318851e-01 |
| coefficient | mobility_PC1 | -0.1354727576226118 | 0.212390 | -0.637850 | 5.235715e-01 |
| coefficient | percent_>=18 | -0.27210915834565963 | 0.060635 | -4.487676 | 7.200444e-06 |
| coefficient | percent_Black | -0.10917180560982409 | 0.010192 | -10.711413 | 8.997787e-27 |
| coefficient | percent_Hispanic | -0.11541303280259996 | 0.050091 | -2.304077 | 2.121835e-02 |
| coefficient | lambda | -0.2855481489441874 | 0.237603 | -1.201786 | 2.294463e-01 |
| model_fit | n | 46 |  |  |  |
| model_fit | k | 10 |  |  |  |
| model_fit | log_likelihood | -54.58391756956071 |  |  |  |
| model_fit | aic | 129.16783513912142 |  |  |  |
| model_fit | bic_schwarz | 147.45424910401238 |  |  |  |
| model_fit | pseudo_r2 | 0.7352404143045579 |  |  |  |
| model_fit | sigma2 | [[0.61828934]] |  |  |  |
| model_fit | lambda | -0.2855481489441874 |  |  |  |

#### 3.4.5 Geographically weighted regression (GWR): spatially varying coefficients
A GWR model (Methods, Section 2.3) was estimated for `Depression_prev` using a bisquare kernel with an **adaptive** bandwidth selected by AICc. **Table 14** reports that the selected bandwidth was **43** (neighbors), with model fit **R² = 0.856** and adjusted R² = **0.749** (AICc = **115.6**, N = **46**).

**Table 14.** GWR model diagnostics and selected bandwidth for county-level Depression_prev regression.

| n | y | predictors | kernel | fixed | spherical | bandwidth | bandwidth_criterion | aicc | aic | bic | R2 | adj_R2 | sigma2 | scale |
|---:|---|---|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 46 | Depression_prev | Med_income, percent_Poverty, percent_Unemployed, percent_Uninsured, percent_>=HighSch, mobility_PC1, percent_>=18, percent_Black, percent_Hispanic | bisquare | False | False | 43 | AICc | 115.596331 | 81.649385 | 118.358832 | 0.855677 | 0.749491 | 0.246565 | 0.246565 |

Spatial variability in local coefficient estimates is summarized in **Table 13**. For `Med_income`, local coefficients were uniformly negative across counties (min **−0.000140**, median **−0.000082**, max **−0.000036**). For `mobility_PC1`, the coefficient ranged from negative to positive (min **−0.544**, median **−0.275**, max **0.178**). Several demographic and SES coefficients also exhibited non-trivial ranges across space, including `percent_Poverty` (min **−0.0368**, median **0.0271**, max **0.167**) and `percent_Uninsured` (min **−0.230**, median **−0.0221**, max **0.0741**). Local fit was mapped via local $R^2$ (see Figure 10 below) and also reflected in the spatially varying intercept (min **40.2**, max **60.7**).

**Table 13.** Summary statistics describing spatial variability of GWR local coefficients (original units).

| coefficient | mean | std | min | p25 | median | p75 | max | iqr |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| b_Intercept | 51.428125 | 5.503089 | 40.158497 | 47.617743 | 51.136164 | 55.929938 | 60.660196 | 8.312195 |
| b_Med_income | -0.000087 | 0.000031 | -0.000140 | -0.000113 | -0.000082 | -0.000061 | -0.000036 | 0.000052 |
| b_mobility_PC1 | -0.246936 | 0.204731 | -0.544388 | -0.383671 | -0.274737 | -0.124070 | 0.177564 | 0.259601 |
| b_percent_Black | -0.090640 | 0.012245 | -0.108510 | -0.101996 | -0.091062 | -0.081290 | -0.068835 | 0.020705 |
| b_percent_Hispanic | -0.107183 | 0.048379 | -0.161001 | -0.139187 | -0.128122 | -0.089011 | 0.014937 | 0.050176 |
| b_percent_Poverty | 0.045772 | 0.065634 | -0.036841 | -0.013886 | 0.027098 | 0.108347 | 0.167027 | 0.122234 |
| b_percent_Unemployed | -0.177440 | 0.082330 | -0.339567 | -0.239304 | -0.169253 | -0.105459 | -0.057456 | 0.133845 |
| b_percent_Uninsured | -0.049257 | 0.085048 | -0.229957 | -0.101451 | -0.022104 | 0.003864 | 0.074059 | 0.105315 |
| b_percent__18 | -0.234689 | 0.033570 | -0.294623 | -0.255331 | -0.244844 | -0.223773 | -0.148703 | 0.031558 |
| b_percent__HighSch | -0.048248 | 0.025351 | -0.086949 | -0.068111 | -0.053828 | -0.031427 | 0.017451 | 0.036684 |

Figures 2–10 map selected local coefficients and local model fit. Figure 2 maps local `Med_income` coefficients, while Figure 3 maps local `mobility_PC1` coefficients. Figures 6–9 map the spatial variation in SES-component coefficients, and Figures 4–5 show demographic coefficients. Figure 10 maps the local $R^2$ values of the GWR fit.

![Figure 2: Choropleth map of b_Med_income coefficients across counties.](choropleth_b_Med_income.png)

In Figure 2, local `b_Med_income` coefficients were negative statewide (consistent with Table 13’s negative min-to-max range), with the magnitude varying across counties.

![Figure 3: Choropleth map of b_mobility_PC1 coefficients across counties.](choropleth_b_mobility_PC1.png)

Figure 3 shows that `b_mobility_PC1` varied in both magnitude and sign across the state, consistent with the coefficient range from **−0.544** to **0.178** in Table 13.

![Figure 4: Choropleth map of b_percent_Black coefficients across counties.](choropleth_b_percent_Black.png)

Figure 4 indicates that local `b_percent_Black` coefficients were negative across counties with modest spatial variation (Table 13: min **−0.109**, max **−0.0688**).

![Figure 5: Choropleth map of b_percent_Hispanic coefficients across counties.](choropleth_b_percent_Hispanic.png)

As shown in Figure 5, local `b_percent_Hispanic` coefficients ranged from negative to slightly positive in some counties (Table 13: max **0.0149**), indicating spatial heterogeneity in this association.

![Figure 6: Choropleth map of b_percent_Poverty coefficients across counties.](choropleth_b_percent_Poverty.png)

Figure 6 shows that the local `b_percent_Poverty` coefficient varied from slightly negative in some counties to positive in others, consistent with Table 13 (min **−0.0368**, max **0.167**).

![Figure 7: Choropleth map of b_percent_Unemployed coefficients across counties.](choropleth_b_percent_Unemployed.png)

Figure 7 maps the spatial variation in `b_percent_Unemployed`, which remained negative across counties (Table 13: min **−0.340**, max **−0.0575**) with varying magnitude.

![Figure 8: Choropleth map of b_percent_Uninsured coefficients across counties.](choropleth_b_percent_Uninsured.png)

Figure 8 indicates that `b_percent_Uninsured` varied substantially across space and crossed zero in some counties (Table 13: max **0.0741**).

![Figure 9: Choropleth map of b_percent__HighSch coefficients across counties.](choropleth_b_percent__HighSch.png)

Figure 9 shows that `b_percent__HighSch` varied from negative to slightly positive (Table 13: max **0.0175**), indicating spatial heterogeneity in the local education–depression slope.

![Figure 10: Choropleth map of gwr_localR2 coefficients across counties.](choropleth_gwr_localR2.png)

Figure 10 maps the local $R^2$ surface of the GWR, highlighting geographic variation in model explanatory power across counties.

For a compact visualization of multiple local coefficients at county centroids, Figure 12 provides an additional summary view of local-coefficient patterns.

![Figure 12: Gwr local coefficients centroid maps](gwr_local_coefficients_centroid_maps.png)

**Hypothesis Assessment (Objective 3).** The mediation hypothesis required evidence of non-zero indirect effects (ACME) via `mobility_PC1` and/or `mobility_diversity`, and the spatial-dependence hypothesis required evidence that accounting for spatial structure altered inference. Bootstrap mediation results indicated that **all ACME confidence intervals included zero** for the evaluated SES variables (e.g., `Med_income` ACME = 0.000029, 95% CI: [−0.000039, 0.000091]; `percent_Poverty` ACME = 0.0158, 95% CI: [−0.0319, 0.0634]), and the outcome-model coefficient on `mobility_PC1` was not statistically different from zero (β = −0.220; 95% CI: [−0.653, 0.214]; p = 0.321). Residual spatial autocorrelation was not statistically detected (Moran’s I = −0.0673, p = 0.321), and the SEM spatial error parameter was not statistically different from zero (λ = −0.286, p = 0.229), although GWR results documented **substantial spatial variability** in several local coefficients (e.g., `b_mobility_PC1` ranged from −0.544 to 0.178 and `b_percent_Poverty` ranged from −0.0368 to 0.167). **Verdict: partially supported** (not supported for mediation via `mobility_PC1` given null ACME intervals; partially supported for spatial heterogeneity insofar as GWR coefficients and local $R^2$ varied geographically, while global residual dependence and SEM λ were not statistically detected).