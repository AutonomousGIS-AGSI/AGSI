# Spatial Inequalities in PM2.5 Exposure and Income Inequality in California Counties (2019)

## Research Question
How do spatial inequalities in PM2.5 exposure across California counties vary with income inequality (Gini) in 2019, and does the spatial relationship vary by urban–rural classification?

## Objectives

1. **Assess how PM2.5 exposure varies across California counties in 2019 and whether county-level PM2.5 is spatially clustered**
   - Hypothesis: County-level annual PM2.5 exposure in 2019 is spatially clustered (positive global Moran’s I) rather than randomly distributed across California.
   - Steps:
     a. Filter `PM2.5_Annual_California_2019` to rows where `year == 2019` and `pollutant_standard == 'PM25 Annual 2006'`, keeping only `state_code`, `county_code`, `site_number`, and `arithmetic_mean`.
     b. Create county `GEOID` as a 5-character string by concatenating zero-padded `state_code` (2 digits) and zero-padded `county_code` (3 digits).
     c. Group by `GEOID` and compute `pm25_mean_2019 = mean(arithmetic_mean)` and `pm25_site_count_2019 = count(site_number)`.
     d. Left-join `pm25_county_2019.csv` to `california_counties_2019` on `GEOID` to attach `pm25_mean_2019` and `pm25_site_count_2019` to county polygons.
     e. Create `pm25_missing_2019` as a boolean indicator where `pm25_mean_2019` is null to identify counties with no monitor-derived PM2.5 summary in 2019.
     f. Construct Queen contiguity spatial weights from county `geometry`, keyed by `GEOID`.
     g. Compute global Moran’s I for `pm25_mean_2019` using the Queen contiguity weights.

2. **Estimate the county-level association between PM2.5 exposure and income inequality (Gini) in 2019 and test whether residual spatial autocorrelation remains**
   - Hypothesis: Higher county income inequality (`B19083_001E:Gini Index`) is associated with higher county mean PM2.5 (`pm25_mean_2019`) in 2019, and OLS residuals exhibit spatial autocorrelation indicating the need for a spatial regression specification.
   - Steps:
     a. Filter `California_Counties_Gini_2019` to rows where `year == 2019`, keeping only `state_fips`, `county_fips`, and `B19083_001E:Gini Index`.
     b. Create county `GEOID` as a 5-character string by concatenating zero-padded `state_fips` (2 digits) and zero-padded `county_fips` (3 digits), and retain `GEOID` and `B19083_001E:Gini Index`.
     c. Left-join `gini_2019_with_geoid.csv` to `counties_pm25_2019_qc.gpkg` on `GEOID` to attach `B19083_001E:Gini Index` to each county.
     d. Fit an OLS model with dependent variable `pm25_mean_2019` and predictor `B19083_001E:Gini Index`, and append model outputs to features as `ols_fitted_pm25` and `ols_residual_pm25` keyed by `GEOID`.
     e. Compute global Moran’s I for `ols_residual_pm25` using the Queen contiguity weights keyed by `GEOID`.
     f. Fit a maximum-likelihood spatial lag (SAR) model with dependent variable `pm25_mean_2019` and predictor `B19083_001E:Gini Index` using the Queen contiguity weights keyed by `GEOID`.
     g. Construct K-nearest-neighbors (KNN) spatial weights with k=5 from county `geometry` centroids, keyed by `GEOID`.
     h. Fit a maximum-likelihood spatial error (SEM) model with dependent variable `pm25_mean_2019` and predictor `B19083_001E:Gini Index` using KNN weights (k=5) keyed by `GEOID`.

3. **Test whether the 2019 PM2.5–income inequality association differs by metro status at the county level**
   - Hypothesis: The association between `B19083_001E:Gini Index` and `pm25_mean_2019` differs by `Metro2013` status (effect modification).
   - Steps:
     a. Create county `GEOID` as a 5-character string from `FIPSTXT` using zero-padding, and keep `GEOID`, `Metro2013`, `Nonmetro2013`, and `RuralUrbanContinuumCode2013`.
     b. Left-join `urban_rural_with_geoid.csv` to `counties_pm25_gini_2019.gpkg` on `GEOID` to attach `Metro2013` to each county.
     c. Create interaction term `gini_x_metro = (B19083_001E:Gini Index) * Metro2013`.
     d. Fit an OLS model with dependent variable `pm25_mean_2019` and predictors `B19083_001E:Gini Index`, `Metro2013`, and `gini_x_metro`, and report coefficient estimates, standard errors, and p-values.
     e. Fit a maximum-likelihood spatial lag (SAR) model with dependent variable `pm25_mean_2019` and predictors `B19083_001E:Gini Index`, `Metro2013`, and `gini_x_metro` using Queen contiguity weights keyed by `GEOID`.
     f. Compute Spearman rank correlation between `pm25_mean_2019` and `B19083_001E:Gini Index` separately for counties where `Metro2013 == 1` and where `Metro2013 == 0`, reporting correlation and group sample size.
