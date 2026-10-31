## 3. Results

### 3.1 Overview

The analysis integrated county boundaries, county income inequality (Gini index), an urban–rural classification, and PM2.5 monitoring observations aggregated to annual county means for California in 2019 (Methods, Section 2.2). Although the merged county layer contained all 58 California counties, PM2.5 annual mean exposure (`pm25_mean`) was available for 44 counties; these 44 counties constituted the analytic sample for inequality measurement, correlation analysis, OLS modeling, and spatial autocorrelation diagnostics.

Across the monitored subset (n = 44), mean county PM2.5 was 7.44 (annual mean concentration units as provided by the monitoring dataset). Urban–rural stratification yielded 33 Metro counties and 11 Nonmetro counties in the monitored subset used for stratified correlation analysis (Table 12); descriptive summaries computed from the workflow’s metro/nonmetro grouping are reported in Table 5.

### 3.2 Spatial inequality in PM2.5 exposure and its association with county income inequality (Gini), with urban–rural effect modification

#### Spatial patterns of county PM2.5 exposure and county income inequality

Figure 1 mapped county PM2.5 annual mean exposure (2019) across California (Methods, Section 2.2).  
![Figure 1: County choropleth of PM2.5 annual mean concentration (2019) aggregated from monitoring sites.](fig_pm25_choropleth_2019.png)

The choropleth indicated marked spatial heterogeneity in county PM2.5. Among monitored counties, `pm25_mean` ranged from 3.14 to 12.90 (as summarized in the merged GeoPackage descriptives), with higher values visually concentrated in a subset of interior counties and lower values in several coastal and northern counties (Figure 1).

Figure 2 mapped county income inequality (Gini index) for 2019.  
![Figure 2: County choropleth of income inequality (Gini index) in 2019.](fig_gini_choropleth_2019.png)

The Gini index was available for all 58 counties and varied from 0.400 to 0.518 (merged GeoPackage descriptives). Spatial variability was evident across the state, with higher and lower inequality values occurring in multiple regions rather than following a single broad gradient (Figure 2).

#### PM2.5 exposure inequality across counties and by urban–rural class

Across monitored counties (n = 44), the inequality of county PM2.5 exposure (computed across counties’ annual means) was moderate: the PM2.5 Gini coefficient across counties was 0.159, the coefficient of variation (CV) was 0.284, and Theil’s $T$ was 0.040 (from `analysis_results.csv`). The statewide mean PM2.5 across monitored counties was 7.44.

Descriptive statistics by metro versus nonmetro classification are reported in Table 5. Metro counties had a higher mean PM2.5 (mean = 8.00, SD = 2.02; n = 37 in this grouped summary output) than Nonmetro counties (mean = 5.78, SD = 1.57; n = 21). PM2.5 inequality measured within each stratum using a county-level PM2.5 Gini was similar in magnitude (Metro: 0.140; Nonmetro: 0.134). Mean Gini index was 0.462 (SD = 0.024) in Metro counties and 0.455 (SD = 0.027) in Nonmetro counties.

**Table 5.** Descriptive statistics of county-level PM2.5 exposure and income inequality (Gini index) by metro vs nonmetro classification (2019).

| urban_rural | n_counties | pm25_mean | pm25_sd | pm25_gini_across_counties | gini_index_mean | gini_index_sd |
|---|---:|---:|---:|---:|---:|---:|
| Metro | 37 | 7.996824 | 2.021807 | 0.140137 | 0.462157 | 0.024024 |
| Nonmetro | 21 | 5.783464 | 1.574976 | 0.134021 | 0.454538 | 0.027215 |

Figure 14 visualized the distribution of county PM2.5 by urban–rural classification.  
![Figure 14: Boxplots of county PM2.5 annual mean (2019) by urban–rural classification.](fig_box_pm25_by_urbanrural_2019.png)

Consistent with Table 5, the boxplots showed a higher central tendency of PM2.5 in Metro counties than in Nonmetro counties, along with variability in both groups and several higher-exposure Metro counties (Figure 14).

#### Bivariate association between PM2.5 and income inequality (overall and stratified)

Pearson correlations between county PM2.5 and the county Gini index are summarized in Table 12. Overall (n = 44), the correlation was near zero (r = 0.023, p = 0.882). Stratified correlations were also small and not statistically distinguishable from zero in this sample (Metro: r = −0.058, p = 0.748, n = 33; Nonmetro: r = 0.181, p = 0.594, n = 11).

**Table 12.** Pearson correlation between county PM2.5 exposure and income inequality (Gini index), overall and stratified by urban–rural classification (2019).

| urban_rural | r | p_value | n |
|---|---:|---:|---:|
| Overall | 0.023087 | 0.881748 | 44 |
| Metro | -0.058130 | 0.747961 | 33 |
| Nonmetro | 0.181336 | 0.593614 | 11 |

Figure 3 plotted county PM2.5 versus Gini, colored by urban–rural class with groupwise OLS trend lines (Methods, Section 2.3).  
![Figure 3: Scatterplot of county PM2.5 (2019) versus Gini (2019), colored by urban–rural class with groupwise OLS trend lines.](fig_scatter_pm25_vs_gini_by_urbanrural_2019.png)

The scatterplot showed substantial dispersion in PM2.5 at similar Gini values and broadly shallow fitted lines within both urban–rural classes, consistent with the small stratified correlations reported in Table 12 (Figure 3).

#### OLS models with an urban–rural interaction

OLS coefficient estimates for the baseline model (`pm25_mean ~ gini`) and the interaction model (`pm25_mean ~ gini + urban_rural + gini×urban_rural`) are reported in Table 7 (Methods, Section 2.3). In the baseline model, the estimated slope for Gini was $\beta = 2.09$ (SE = 13.95, p = 0.882; 95% CI: −26.1, 30.2). In the interaction model (with `is_nonmetro` as the indicator and Metro as the reference), the Gini main effect (Metro slope) was $\beta = -5.03$ (SE = 14.88, p = 0.737; 95% CI: −35.1, 25.0), the Nonmetro main effect was $\beta = -9.69$ (SE = 13.17, p = 0.466; 95% CI: −36.3, 16.9), and the interaction term was $\beta = 16.3$ (SE = 28.7, p = 0.573; 95% CI: −41.6, 74.2).

**Table 7.** OLS coefficients for county PM2.5 (2019) regressed on Gini and urban–rural classification with interaction.

| model | variable | beta | std_err | t | p | ci_low | ci_high |
|---|---|---:|---:|---:|---:|---:|---:|
| Model1_pm25~gini | const | 6.481826 | 6.433807 | 1.007464 | 0.319481 | -6.502122 | 19.465773 |
| Model1_pm25~gini | gini | 2.087612 | 13.948903 | 0.149661 | 0.881748 | -26.062414 | 30.237638 |
| Model2_pm25~gini+UR+interaction | const | 10.320650 | 6.874689 | 1.501253 | 0.141143 | -3.573614 | 24.214915 |
| Model2_pm25~gini+UR+interaction | gini | -5.034880 | 14.876496 | -0.338445 | 0.736798 | -35.101400 | 25.031640 |
| Model2_pm25~gini+UR+interaction | is_nonmetro | -9.694117 | 13.169115 | -0.736125 | 0.465950 | -36.309891 | 16.921656 |
| Model2_pm25~gini+UR+interaction | gini_x_nonmetro | 16.295448 | 28.656430 | 0.568649 | 0.572773 | -41.621356 | 74.212253 |

Model fit statistics are summarized in Table 9. The baseline model had $R^2 = 0.000533$ (adjusted $R^2 = -0.0233$; RMSE = 2.11; n = 44). The interaction model had higher in-sample fit ($R^2 = 0.213$, adjusted $R^2 = 0.154$; RMSE = 1.87; n = 44) and a lower AIC (188.09) than the baseline model (194.58). The omnibus F-test for the interaction model was $F = 3.60$ with p = 0.0215 (Table 9).

**Table 9.** OLS model fit statistics comparing baseline and interaction models for PM2.5 vs Gini (2019).

| analysis | model | group | n | R2 | adj_R2 | AIC | BIC | F | F_pvalue | RMSE |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ols_model_fit | Model1_pm25~gini | All (with urban_rural) | 44 | 0.000533 | -0.023264 | 194.582211 | 198.150590 | 0.022399 | 0.881748 | 2.110170 |
| ols_model_fit | Model2_pm25~gini+UR+interaction | All (with urban_rural) | 44 | 0.212592 | 0.153537 | 188.089265 | 195.226023 | 3.599870 | 0.021528 | 1.872979 |

Variance inflation factors for the interaction model predictors are reported in Table 11 (Methods, Section 2.3). The VIF for `gini` was 1.37, whereas very large VIF values were reported for `is_nonmetro` (370.77) and `gini_x_nonmetro` (369.58).

**Table 11.** Variance inflation factors (VIF) for predictors in the PM2.5~Gini urban–rural interaction model (2019).

| variable | VIF |
|---|---:|
| gini | 1.374994 |
| is_nonmetro | 370.773293 |
| gini_x_nonmetro | 369.583898 |

#### Spatial autocorrelation diagnostics

Global Moran’s $I$ statistics (Methods, Section 2.3) are provided in Table 6. County PM2.5 exhibited positive spatial autocorrelation (Moran’s $I = 0.237$, $z = 2.37$, p = 0.013; n = 44, queen contiguity with fallback k-nearest neighbors for islands). Residuals from the OLS model likewise showed positive spatial autocorrelation (Moran’s $I = 0.243$, $z = 2.42$, p = 0.008; n = 44), indicating that spatial clustering remained in the residual surface under the fitted linear specification.

**Table 6.** Global Moran’s I for county PM2.5 exposure and OLS residuals (2019), testing spatial clustering and residual spatial autocorrelation.

| variable | morans_I | expected_I | z_sim | p_sim | n | weights |
|---|---:|---:|---:|---:|---:|---|
| pm25_mean | 0.237357 | -0.023256 | 2.365418 | 0.013 | 44 | Queen (fallback KNN k=5 if islands), row-standardized |
| ols_residuals | 0.242962 | -0.023256 | 2.424667 | 0.008 | 44 | Queen (fallback KNN k=5 if islands), row-standardized |