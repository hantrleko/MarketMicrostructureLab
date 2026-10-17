# Econometric & Quantitative Methods

## 1. Cumulative Volume Delta (CVD)
The Cumulative Volume Delta accumulates the net signed order flow over discrete time buckets or events:
$$\text{CVD}_t = \sum_{i=1}^t \epsilon_i \cdot q_i$$
where $\epsilon_i \in \{+1, -1\}$ denotes the aggressor side ($+1$ for aggressive buy, $-1$ for aggressive sell), and $q_i$ is the base quantity.

## 2. Event-Time Price Response Function
The price response function measures the expected log price change $k$ events after a trade of direction $\epsilon_i$:
$$R(k) = \mathbb{E}[\epsilon_i \cdot (\ln P_{i+k} - \ln P_i)]$$

### Econometric Inference & Serial Correlation Adjustment:
Because returns across overlapping event horizons $k$ are serially correlated (exhibiting an MA($k-1$) structure), standard OLS standard errors severely underestimate uncertainty.
MML implements the Newey-West Heteroskedasticity and Autocorrelation Consistent (HAC) variance estimator:
$$\hat{\Omega}_{\text{HAC}} = \hat{\Gamma}_0 + \sum_{j=1}^L \left(1 - \frac{j}{L + 1}\right) (\hat{\Gamma}_j + \hat{\Gamma}_j^\top)$$
with Bartlett kernel bandwidth $L \ge k$.

## 3. Nonlinear Market Impact Models
We estimate the functional relationship between trade volume $Q$ and immediate price change at horizon $k$:
1. **Linear Model**:
   $$R_i = \alpha + \beta Q_i + \varepsilon_i$$
2. **Logarithmic Model**:
   $$R_i = \alpha + \beta \ln(Q_i) + \varepsilon_i$$
3. **Power-Law / Square-Root Law**:
   $$R_i = \alpha \cdot Q_i^\gamma + \varepsilon_i$$
We explicitly test the null hypothesis:
$$H_0: \gamma = 0.5 \quad \text{vs.} \quad H_1: \gamma \neq 0.5$$
using a Wald $t$-statistic $t = (\hat{\gamma} - 0.5) / \text{SE}(\hat{\gamma})$.
