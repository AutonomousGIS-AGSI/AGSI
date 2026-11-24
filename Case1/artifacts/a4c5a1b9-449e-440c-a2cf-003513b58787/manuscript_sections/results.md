## 3. Results

### 3.1 Overview

Analyses were conducted for California’s 58 counties (EPSG:4269), integrating monitor-derived annual mean PM2.5 for 2019 (`pm25_mean_2019`) with county income inequality (`B19083_001E:Gini Index`) and spatial weights derived from county geometry (Queen contiguity) and county centroids (K-nearest neighbors). Monitor-derived PM2.5 summaries were available for 44 of 58 counties (75.9%), with 14 counties (24.1%) missing `pm25_mean_2019` under the specified monitoring-site filter and aggregation (Methods, Section 2.2; join audit/QC).

Among counties with observed PM2.5 (complete cases), mean annual PM2.5 was 7.45 (SD = 2.14), with an interquartile range of 5.65–9.23 and a range of 3.14–12.90. The mean number of monitoring sites contributing to county summaries was 3.39 (SD = 3.24), with a median of 2.5 and a maximum of 19 sites. Income inequality (Gini) was complete across all counties (mean = 0.459, SD = 0.025; observed range reported in outputs beginning at 0.400).

### 3.2 Objective 1: Assess how PM2.5 exposure varies across California counties in 2019 and whether county-level PM2.5 is spatially clustered

Using the Queen contiguity specification described in Methods (Section 2.3), spatial neighborhood structure was constructed for the 58 county polygons. Counties had, on average, 4.79 Queen neighbors (SD = 1.39), with a minimum of 2 and a maximum of 8 neighbors. Figure 2 summarizes the contiguity network by mapping neighbor links and per-county neighbor counts.

![Figure 2: California county polygons with Queen contiguity summary (neighbor counts) and centroid-to-centroid neighbor links keyed by GEOID.](ca_county_queen_weights_2019__658d6726.png)

Figure 2 shows a connected contiguity graph across the state, with variation in neighbor counts that reflected boundary geometry (e.g., fewer neighbors along the state boundary and coastline, more in interior multi-adjacent counties). This Queen graph provided the spatial weights used to test global spatial autocorrelation in county PM2.5.

Global Moran’s I for `pm25_mean_2019` (computed on the 44 complete-case counties) was positive and statistically distinguishable from spatial randomness (Table 6). The permutation-based Moran’s I was 0.237 (expected $I = -0.0233$, variance = 0.0121), with $z = 2.39$ and $p = 0.009$.

**Table 6.** Global Moran’s I (Queen contiguity; row-standardized) for county-level PM2.5 mean in 2019, reporting permutation-based variance, z-score, and p-value.

| variable        | weights | n  | permutations | morans_I  | expected_I  | variance  | z_score  | p_value |
|----------------|---------|----|--------------|-----------|-------------|-----------|----------|---------|
| pm25_mean_2019 | queen   | 44 | 999          | 0.236979  | -0.023256   | 0.012133  | 2.385176 | 0.009   |

**Hypothesis assessment (Objective 1).** PM2.5 exhibited positive global spatial autocorrelation under Queen contiguity ($I = 0.237$, $p = 0.009$, $n = 44$), indicating non-random spatial clustering in the observed county PM2.5 values for 2019. This evidence supported the Objective 1 hypothesis of positive global Moran’s I for county PM2.5.

### 3.3 Objective 2: Estimate the county-level association between PM2.5 exposure and income inequality (Gini) in 2019 and test whether residual spatial autocorrelation remains

#### 3.3.1 Baseline OLS association and residual spatial autocorrelation

Using the OLS specification described in Methods (Section 2.3), `pm25_mean_2019` was regressed on `B19083_001E:Gini Index` for complete cases ($n = 44$). The estimated Gini slope was small relative to its uncertainty and not statistically distinguishable from zero (Table 10): $\beta = 2.20$ (SE = 14.0, $p = 0.876$), with a 95% CI of [−26.1, 30.5]. Model fit was minimal (Table 11), with $R^2 = 0.000587$ (adjusted $R^2 = -0.0232$) and RMSE = 2.12.

**Table 10.** OLS coefficients for PM2.5 (2019) regressed on county Gini Index.

| variable               | coef     | std_err  | p_value  | ci_low    | ci_high   |
|------------------------|----------|----------|----------|-----------|-----------|
| const                  | 6.438133 | 6.460260 | 0.324678 | -6.599201 | 19.475466 |
| B19083_001E:Gini Index | 2.200437 | 14.006256| 0.875916 | -26.065332| 30.466207 |

**Table 11.** OLS fit statistics for PM2.5 (2019) ~ Gini Index model.

| n  | R2      | adj_R2   | AIC        | BIC        | RMSE     |
|----|---------|----------|------------|------------|----------|
| 44 | 0.000587| -0.023208| 194.943296 | 198.511675 | 2.118846 |

Figure 3 maps the OLS fitted values and residuals appended to the county geography (Methods, Section 2.3). Residual values ranged from −4.36 to 5.45 across counties (complete cases), with a mean near zero by construction.

![Figure 3: County-level OLS fitted PM2.5 (2019) and residuals from regression on Gini Index.](counties_pm25_gini_2019_olsresid__0bd13476.png)

Figure 3 highlights that the fitted surface was nearly constant across space (consistent with the near-zero $R^2$), while residuals displayed coherent geographic patterning rather than spatially alternating noise. Consistent with this mapped structure, global Moran’s I for OLS residuals (Queen contiguity; $n = 44$) was 0.242 with permutation $z = 2.32$ and $p = 0.015$ (Table 4), indicating statistically significant positive residual spatial autocorrelation.

**Table 4.** Global Moran’s I (permutation-based) for spatial autocorrelation in OLS residuals of PM2.5 across California counties using Queen contiguity.

| variable            | morans_I  | z_sim   | p_sim | n  |
|--------------------|-----------|---------|------:|----|
| ols_residual_pm25  | 0.242459  | 2.321096| 0.015 | 44 |

#### 3.3.2 Stratified rank association by metro status and interaction-based OLS

To describe potential urban–rural differences in the PM2.5–Gini relationship (as operationalized by `Metro2013`), Spearman rank correlations were computed separately for metro and nonmetro counties among complete cases (Table 5). In metro counties ($n = 33$), Spearman’s $\rho$ was −0.0204 ($p = 0.910$). In nonmetro counties ($n = 11$), Spearman’s $\rho$ was 0.155 ($p = 0.650$).

**Table 5.** Spearman rank correlation between 2019 county PM2.5 and Gini Index, stratified by Metro2013 status, with sample sizes.

| group    | Metro2013 | n  | spearman_rho | spearman_p | x              | y                      |
|----------|-----------|----|--------------|------------|----------------|------------------------|
| metro    | 1         | 33 | -0.020388    | 0.910337   | pm25_mean_2019 | B19083_001E:Gini Index |
| nonmetro | 0         | 11 | 0.154545     | 0.650034   | pm25_mean_2019 | B19083_001E:Gini Index |

An OLS model including `Metro2013` and a Gini×Metro interaction (Methods, Section 2.3) likewise produced imprecise estimates with wide confidence intervals (Table 12). The interaction term was negative ($\beta = -16.5$, SE = 28.8, $p = 0.571$; 95% CI [−74.6, 41.7]), and neither the main effect of Gini ($p = 0.643$) nor the main effect of Metro2013 ($p = 0.464$) was statistically distinguishable from zero in this specification.

**Table 12.** OLS coefficient table for PM2.5 (2019) regressed on Gini Index, Metro2013, and their interaction (gini_x_metro).

| variable               | coef       | std_err    | p_value  | ci_low_95  | ci_high_95 |
|------------------------|------------|------------|----------|------------|------------|
| const                  | 0.528214   | 11.282688  | 0.962893 | -22.274949 | 23.331376  |
| B19083_001E:Gini Index | 11.483663  | 24.602370  | 0.643196 | -38.239582 | 61.206907  |
| Metro2013              | 9.773199   | 13.228208  | 0.464333 | -16.962007 | 36.508405  |
| gini_x_metro           | -16.455723 | 28.785020  | 0.570740 | -74.632418 | 41.720971  |

#### 3.3.3 Spatial regression specifications

Given significant residual spatial autocorrelation in the baseline OLS residuals (Table 4), spatial regression specifications were estimated as described in Methods (Section 2.3). For the spatial lag (SAR) model using Queen contiguity weights (Gini-only specification), the estimated spatial autoregressive parameter was positive and statistically distinguishable from zero via the spatially lagged dependent-variable term (Table 13): $W\,\text{pm25\_mean\_2019}$ coefficient = 0.417 (SE = 0.158, $z = 2.64$, $p = 0.00823$). In contrast, the Gini coefficient remained imprecise and not statistically distinguishable from zero in the SAR model: $\beta = 7.53$ (SE = 12.6, $z = 0.597$, $p = 0.551$). Model fit statistics reported pseudo-$R^2 = 0.198$ with AIC = 192.15 ($n = 44$).

**Table 13.** Maximum-likelihood spatial lag (SAR) model results for county PM2.5 (2019) regressed on Gini Index with Queen contiguity weights (GEOID-keyed).

| section     | variable               | estimate    | std_err   | z_value  | p_value  |
|------------|-------------------------|-------------|-----------|----------|----------|
| parameters | CONSTANT                | 0.830436    | 5.907173  | 0.140581 | 0.888201 |
| parameters | B19083_001E:Gini Index  | 7.531772    | 12.622788 | 0.596681 | 0.550721 |
| parameters | W_pm25_mean_2019        | 0.416924    | 0.157767  | 2.642652 | 0.008226 |
| parameters | rho                     | 0.416924    | NaN       | NaN      | NaN      |
| fit_stats  | n                       | 44.000000   | NaN       | NaN      | NaN      |
| fit_stats  | k                       | 3.000000    | NaN       | NaN      | NaN      |
| fit_stats  | log_likelihood          | -93.077178  | NaN       | NaN      | NaN      |
| fit_stats  | aic                     | 192.154356  | NaN       | NaN      | NaN      |
| fit_stats  | bic_schwarz             | 197.506925  | NaN       | NaN      | NaN      |
| fit_stats  | pseudo_r2               | 0.197621    | NaN       | NaN      | NaN      |
| fit_stats  | sigma2                  | 3.817439    | NaN       | NaN      | NaN      |

To visualize the spatial structure in the SAR residuals, Figure 9 mapped spatial lag residuals for 2019. Residuals were not spatially uniform, with some geographically contiguous areas sharing similar sign and magnitude.

![Figure 9: Spatial lag residuals map 2019](spatial_lag_residuals_map_2019.png)

Figure 9 directs attention to remaining geographic heterogeneity in residuals after accounting for spatial lag dependence, with residual contrasts apparent across regions rather than being evenly interspersed county-to-county.

A spatial error (SEM) model was also fit using a K-nearest-neighbor graph (k = 5). Figure 1 summarizes the KNN structure used to define the SEM neighborhood relations.

![Figure 1: K-nearest-neighbor (k=5) spatial weights for counties, represented as centroid-to-centroid edges keyed by GEOID.](ca_county_knn_weights_2019__39620c5a.png)

Figure 1 shows centroid-based links that connect each county to its five nearest neighbors, including connections that can cross non-contiguous boundaries (e.g., across narrow separations), reflecting the distance-based rather than topology-based neighborhood definition.

In the SEM model (Table 7), the spatial error parameter was positive (λ = 0.582), while the Gini coefficient was again not statistically distinguishable from zero: $\beta = 14.6$ (SE = 12.5, $z = 1.17$, $p = 0.244$). Fit statistics for this SEM specification reported AIC = 186.48 and pseudo-$R^2 = 0.000587 ($n = 44$).

**Table 7.** Spatial error (SEM) maximum-likelihood estimates for PM2.5 (2019) regressed on county Gini Index (KNN k=5 weights, keyed by GEOID).

| variable               | coef      | std_err   | z_value  | p_value  | lambda   | aic      | bic       | log_likelihood | pseudo_r2 | n  | k |
|------------------------|-----------|-----------|----------|----------|----------|----------|-----------|----------------|-----------|----|---|
| CONSTANT               | 0.427243  | 5.769348  | 0.074054 | 0.940967 | 0.582317 | 186.48456| 190.052939| -91.24228      | 0.000587  | 44 | 2 |
| B19083_001E:Gini Index | 14.570880 | 12.506137 | 1.165098 | 0.243979 | 0.582317 | 186.48456| 190.052939| -91.24228      | 0.000587  | 44 | 2 |

Finally, a SAR interaction model incorporating Gini, Metro2013, and their interaction (Queen contiguity) reported a statistically distinguishable spatial dependence parameter (ρ = 0.393, SE = 0.155, $p = 0.0109$) but imprecise covariate and interaction estimates (Table 8). The interaction term was negative (−33.1, SE = 25.6, $p = 0.196$), while main effects of Gini ($p = 0.183$) and Metro2013 ($p = 0.147$) were not statistically distinguishable from zero in this model; pseudo-$R^2$ was 0.320 ($n = 44$).

**Table 8.** Maximum-likelihood spatial lag (SAR) model coefficients for county PM2.5 (2019) with Gini, Metro2013, and their interaction using Queen contiguity weights keyed by GEOID.

| variable               | coef       | std_err   | z        | p_value  | n  | k | aic       | bic       | pseudo_r2 |
|------------------------|------------|-----------|----------|----------|----|---|-----------|-----------|-----------|
| CONSTANT               | -10.275258 | 10.139456 | -1.013393| 0.310872 | 44 | 5 | 186.393056| 195.314004| 0.319882  |
| B19083_001E:Gini Index | 29.133698  | 21.890438 | 1.330887 | 0.183226 | 44 | 5 | 186.393056| 195.314004| 0.319882  |
| Metro2013              | 17.068384  | 11.770344 | 1.450118 | 0.147026 | 44 | 5 | 186.393056| 195.314004| 0.319882  |
| gini_x_metro           | -33.129736 | 25.625393 | -1.292848| 0.196064 | 44 | 5 | 186.393056| 195.314004| 0.319882  |
| rho                    | 0.393330   | 0.154540  | 2.545174 | 0.010922 | 44 | 5 | 186.393056| 195.314004| 0.319882  |

**Hypothesis assessment (Objective 2).** In the baseline OLS model, the estimated association between Gini and county PM2.5 was not positive in a statistically distinguishable way (OLS: $\beta = 2.20$, SE = 14.0, 95% CI [−26.1, 30.5], $p = 0.876$, $n = 44$), and stratified rank correlations were likewise near zero in metro counties and small in nonmetro counties (Table 5). However, OLS residuals exhibited significant positive spatial autocorrelation (Moran’s $I = 0.242$, $p = 0.015$, $n = 44$), consistent with remaining spatial dependence after the non-spatial baseline. Thus, the hypothesis was **partially supported**: residual spatial autocorrelation was supported, whereas a positive Gini–PM2.5 association was not supported by the estimated coefficients and uncertainty in the models reported here.