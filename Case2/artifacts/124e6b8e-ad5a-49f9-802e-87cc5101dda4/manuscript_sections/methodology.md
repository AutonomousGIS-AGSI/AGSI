## 2. Methodology

### 2.1 Study Area
The study was conducted in the U.S. state of South Carolina, operationalized at the county level for all 46 counties. This county-scale framing aligned with the research objective of relating area-level socioeconomic conditions to population mental-health burden while incorporating geographically structured behavioral indicators derived from aggregated place-visitation data. South Carolina is a policy-relevant setting for spatial health research because its counties span a marked rural–urban gradient and heterogeneous demographic composition, creating plausible geographic variation in both (i) socioeconomic constraints and (ii) the accessibility and use of destination types that shape everyday routines. Consistent with spatial-health perspectives emphasizing that contextual exposures and outcomes are inherently geographic and may cluster across administrative units (Coman et al., 2021) [REF_21], we treated counties as the analysis units for regression modeling and as mapping units for GIS outputs.

### 2.2 Data
We integrated four county-referenced datasets, all keyed by a common geographic identifier `GEOID` (string), and constructed a county-level analytical file used in subsequent modeling.

**American Community Survey (ACS) county indicators (`SC_ACS_data.csv`).** Socioeconomic and demographic covariates were provided as a CSV file with shape **[46, 15]**. The variables used in this study were `Med_income`, `percent_Poverty`, `percent_Unemployed`, `percent_Uninsured`, `percent_>=HighSch`, `percent_Black`, `percent_Hispanic`, and `percent_>=18`, together with the join key `GEOID`.

**CDC PLACES depression prevalence (`SC_PLACES_depression.csv`).** County-level depression prevalence was incorporated via the variable `Depression_prev` (joined into the validated analytical table described below). The merged, validated file containing `Depression_prev` had shape **[46, 10]** (see preprocessing), confirming complete county coverage after key harmonization and joining.

**County boundaries (`SC_counties.gpkg`).** County geometries were provided as a GeoPackage with shape **[46, 2]** and columns `GEOID` and `geometry`. The final joined GIS layer (below) reported CRS **EPSG:4269** and contained **[46, 12]** attributes including `Depression_prev` and the constructed `SES_index`.

**Aggregated POI visitation counts (`SC_Visitor_POI.csv`).** County-level visitation intensity was incorporated through ten POI-category count fields, visible in the derived analytical outputs: `Full_Service_Restaurant`, `Sport_facilities`, `Parks`, `Fastfood_Restaurant`, `Convenience`, `Supermarket`, `Warehouse`, `Fruit`, `TobaccoStore`, and `DrinkingPlaces`. These counts were joined to the SES–depression table and transformed into compositional shares and mobility summary indicators.

#### Preprocessing and variable construction
All tabular preprocessing was performed through deterministic joins and transformations keyed on `GEOID`, with explicit audits of missingness and join completeness.

First, we validated join keys and required fields by coercing `GEOID` to string in both the ACS and depression tables, retaining only the required fields (`GEOID`, the five SES components, and demographic covariates, plus `Depression_prev`) to create `acs_places_validated.csv` (shape **[46, 10]**). No rows were dropped due to missing `GEOID` in either source table (**0 dropped; 46 kept** in each). After key validation, missing-value checks indicated **0 missing values** in `Depression_prev` and in each retained ACS field (`Med_income`, `percent_>=18`, `percent_>=HighSch`, `percent_Black`, `percent_Hispanic`, `percent_Poverty`, `percent_Unemployed`, `percent_Uninsured`). No rows were dropped during final validation (**0 dropped; 46 kept**).

Second, we constructed the core county analytical table by left-joining depression prevalence onto the ACS attributes using `GEOID`, producing `county_ses_depression.csv`. We then created a composite socioeconomic status index `SES_index` via z-score standardization of five SES-related variables and averaging them with sign conventions chosen so that larger values reflect higher socioeconomic advantage. For county \(i\), we computed z-scores as
$$
z(x_i) = \frac{x_i - \bar{x}}{s_x},
$$
where \(\bar{x}\) and \(s_x\) are the mean and standard deviation of \(x\) across the 46 counties. We then defined
$$
SES\_index_i = \frac{ z(\texttt{Med\_income}_i) + z(\texttt{percent\_>=HighSch}_i) - z(\texttt{percent\_Poverty}_i) - z(\texttt{percent\_Unemployed}_i) - z(\texttt{percent\_Uninsured}_i) }{5}.
$$
This index was appended to produce `county_ses_depression_with_index.csv`.

Third, we joined county visitation counts to the SES–depression table (left join on `GEOID`) to create `county_ses_depression_visits.csv` and then derived total visits and compositional shares in `county_visitation_shares.csv`. We computed
$$
\texttt{total\_visits}_i = \sum_{c=1}^{10} v_{ic},
$$
where \(v_{ic}\) is the visitation count for category \(c\) in county \(i\). For counties with \(\texttt{total\_visits}_i > 0\), we computed shares
$$
\texttt{share}_{ic} = \frac{v_{ic}}{\texttt{total\_visits}_i},
$$
for each of the ten POI categories, producing the fields `share_Full_Service_Restaurant`, `share_Sport_facilities`, `share_Parks`, `share_Fastfood_Restaurant`, `share_Convenience`, `share_Supermarket`, `share_Warehouse`, `share_Fruit`, `share_TobaccoStore`, and `share_DrinkingPlaces`. For the zero-total edge case, all `share_*` variables were set to 0 when \(\texttt{total\_visits}_i = 0\), implementing the “zero-safe” rule recorded in the execution trace.

Fourth, we summarized mobility composition evenness as `mobility_diversity` by computing Shannon entropy across the ten share variables in `county_mobility_diversity.csv` (shape **[46, 32]**). For county \(i\), with shares \(p_{ic}\) over categories \(c=1,\dots,10\), we calculated
$$
\texttt{mobility\_diversity}_i = -\sum_{c=1}^{10} p_{ic}\,\log(p_{ic}),
$$
using the convention \(0\cdot \log(0)=0\) as explicitly specified in the workflow.

Fifth, we reduced the 10-dimensional compositional profile to two principal-component scores using PCA after standardizing the ten `share_*` variables to zero mean and unit variance. This produced `county_mobility_pca.csv` (shape **[46, 34]**) with appended fields `mobility_PC1` and `mobility_PC2`, representing the first and second principal component scores for each county.

Finally, for GIS-ready mapping and spatial inspection, we performed an attribute join of the analytical table with index to county polygons by `GEOID`, producing `counties_ses_depression.gpkg` (shape **[46, 12]**, CRS **EPSG:4269**). A join audit confirmed complete matching: **46** county polygons on the left and **46/46 (100.0%)** non-null `Depression_prev` after the join (0 unmatched), ensuring the spatial layer was fully populated for choropleth mapping and any subsequent spatial diagnostics.

### 2.3 Methods

#### Analytical framework
We implemented a two-part analytical workflow aligned with the study objectives described in the Introduction: (i) estimate the county-level association between a composite SES index and depression prevalence while adjusting for demographic composition, and (ii) quantify how SES relates to county mobility composition using both an entropy-based diversity summary and PCA-based gradients of visitation shares. Throughout, we used heteroskedasticity-robust inference in linear models to reduce sensitivity to non-constant variance common in cross-sectional areal data (Coman et al., 2021) [REF_21], and we produced GIS-ready joined outputs to support spatial interpretation of estimated variables in map form.

#### Objective 1: SES–depression association (robust OLS)
To estimate the adjusted county-level association between socioeconomic status and depression prevalence, we fit an ordinary least squares regression with heteroskedasticity-robust (HC1) standard errors. For county \(i\), the fitted model was
$$
y_i = \beta_0 + \beta_1 SES\_index_i + \beta_2 A_i + \beta_3 B_i + \beta_4 H_i + \varepsilon_i,
$$
where \(y_i\) is `Depression_prev`, \(SES\_index_i\) is the composite index defined above, \(A_i\) is `percent_>=18`, \(B_i\) is `percent_Black`, \(H_i\) is `percent_Hispanic`, \(\beta_0\) is the intercept, \(\beta_1,\dots,\beta_4\) are global regression coefficients, and \(\varepsilon_i\) is an idiosyncratic error term. The point estimates were obtained by OLS, while inference used HC1 robust covariance estimation to relax homoskedasticity assumptions.

Model fitting and inference were executed in Python using `statsmodels`, with robust covariance specified as HC1. The workflow saved (i) coefficient tables (`ols_ses_to_depression_results.csv` and `ols_ses_to_depression_coefficients_hc1.csv`) and (ii) residual diagnostics artifacts (`ols_ses_to_depression_residual_diagnostics.csv`, plus `ols_residuals_qqplot.png` and `ols_residuals_vs_fitted.png`). These diagnostics supported visual checks of residual distributional shape and potential mean–variance relationships (QQ plot and residuals vs. fitted). No spatial weights matrix or explicit spatial-autocorrelation diagnostic (e.g., Moran’s \(I\)) was recorded in the executed steps; consequently, the regression was interpreted as a non-spatial global model, and any remaining spatial dependence in residuals was not formally tested within the executed pipeline.

#### Objective 2: Constructing mobility composition summaries and modeling their SES gradients
To characterize county mobility environments as compositional profiles rather than raw counts, we transformed the ten POI-category visit counts into normalized shares (`share_*`) by dividing each category by `total_visits` (with the zero-total rule described above). We then created two complementary summary representations:

1) **Mobility diversity (entropy).** We computed `mobility_diversity` as Shannon entropy over the ten shares, treating the county’s visitation mix as a discrete probability distribution over POI types and applying the explicit convention \(0\log 0=0\). This yielded a single-number measure of compositional evenness intended to capture whether visitation was concentrated in a small subset of categories versus spread more evenly across categories.

2) **Mobility gradients (PCA scores).** To capture dominant multivariate gradients in visitation composition, we standardized the ten shares to mean 0 and variance 1 and performed PCA, retaining the first two component scores as `mobility_PC1` and `mobility_PC2`. These scores provided low-dimensional continuous summaries of the multivariate composition, suitable for linear modeling.

We then estimated robust OLS models relating mobility composition summaries to SES and covariates. For county \(i\), the first model used `mobility_PC1` as the dependent variable:
$$
m^{(PC1)}_i = \alpha_0 + \alpha_1 I_i + \alpha_2 P_i + \alpha_3 U_i + \alpha_4 N_i + \alpha_5 E_i + \alpha_6 A_i + \alpha_7 B_i + \alpha_8 H_i + \eta_i,
$$
and the second model used `mobility_diversity` as the dependent variable:
$$
m^{(div)}_i = \gamma_0 + \gamma_1 I_i + \gamma_2 P_i + \gamma_3 U_i + \gamma_4 N_i + \gamma_5 E_i + \gamma_6 A_i + \gamma_7 B_i + \gamma_8 H_i + \nu_i,
$$
where \(I_i=\texttt{Med\_income}\), \(P_i=\texttt{percent\_Poverty}\), \(U_i=\texttt{percent\_Unemployed}\), \(N_i=\texttt{percent\_Uninsured}\), \(E_i=\texttt{percent\_>=HighSch}\), and \(A_i\), \(B_i\), \(H_i\) are the demographic covariates (`percent_>=18`, `percent_Black`, `percent_Hispanic`). As in Objective 1, coefficients were estimated by OLS and inference used HC1 robust standard errors.

These models were fit in Python using `statsmodels`, and results were written to `ols_ses_to_mobility_results.csv`. The executed workflow did not record additional regression diagnostics (e.g., multicollinearity checks) beyond saving the results table, and it did not incorporate spatial regression terms or spatial error/lag specifications. Accordingly, the Objective 2 inferential models were treated as global, non-spatial associations between SES/demographic predictors and mobility composition summaries.

### 2.4 Computational Environment
All analyses were conducted in **Python 3.13.12** on **Linux 6.8.0-107-generic**, with an analysis date of **2026-04-22 (UTC)**. Spatial data handling relied on `geopandas=1.1.2`, `fiona=1.10.1`, `shapely=2.1.2`, and `pyproj=3.7.2`; spatial-analysis libraries available in the environment included `libpysal=4.14.1`, `esda=2.9.0`, and `spreg=1.9.0`, while statistical modeling used `statsmodels=0.14.6` and multivariate methods used `scikit-learn=1.8.0`. Random seeds were **not recorded**, which limited exact bitwise reproducibility for any steps with potential nondeterminism (notably PCA implementations), although the executed pipeline was otherwise fully specified through explicit joins and closed-form transformations.