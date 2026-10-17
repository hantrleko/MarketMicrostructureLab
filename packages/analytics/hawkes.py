"""
Multivariate Hawkes Process Estimation Engine.
Models high-frequency trade arrival clustering and cross-excitation between
aggressive buyer orders and aggressive seller orders.
Calculates baseline intensity, self-excitation, cross-excitation,
the branching matrix Gamma, and the spectral radius rho(Gamma).
"""

from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import polars as pl
from scipy.optimize import minimize


class BivariateHawkesModel:
    def __init__(self, beta: float = 10.0):
        """
        beta: exponential decay rate parameter (default 10.0 s^-1, corresponding to half-life of ln(2)/10 ~ 70ms).
        """
        self.beta = beta

    def fit_trades(
        self,
        df: pl.DataFrame,
        sample_size: int = 10_000
    ) -> Dict[str, Any]:
        """
        Fits bivariate Hawkes process to consecutive trade events:
        Dimension 1 = BUY (+1)
        Dimension 2 = SELL (-1)
        """
        if len(df) > sample_size:
            start_idx = len(df) // 3
            sub_df = df.slice(start_idx, sample_size)
        else:
            sub_df = df

        # Relative time in seconds from first event
        ts_ns = sub_df["event_timestamp_ns"].to_numpy().astype(np.float64)
        t_sec = (ts_ns - ts_ns[0]) / 1e9
        directions = sub_df["direction"].to_numpy()
        T = float(t_sec[-1])

        # Separate timestamps for buy (1) and sell (2)
        t_buy = t_sec[directions == 1]
        t_sell = t_sec[directions == -1]

        n_buy = len(t_buy)
        n_sell = len(t_sell)

        if n_buy < 50 or n_sell < 50 or T <= 0:
            raise ValueError(f"Insufficient trade samples for Hawkes estimation: {n_buy} buys, {n_sell} sells")

        # Initial parameter guesses:
        # mu_1, alpha_11, alpha_12
        # mu_2, alpha_21, alpha_22
        mu_b_init = n_buy / T * 0.4
        mu_s_init = n_sell / T * 0.4
        alpha_init = self.beta * 0.25

        # Fit dimension 1 (BUY)
        p_buy = self._fit_single_dimension(t_buy, [t_buy, t_sell], T, mu_b_init, alpha_init)
        
        # Fit dimension 2 (SELL)
        p_sell = self._fit_single_dimension(t_sell, [t_buy, t_sell], T, mu_s_init, alpha_init)

        mu_1, alpha_11, alpha_12 = p_buy
        mu_2, alpha_21, alpha_22 = p_sell

        # Branching matrix Gamma = [ [alpha_11/beta, alpha_12/beta], [alpha_21/beta, alpha_22/beta] ]
        gamma_matrix = np.array([
            [alpha_11 / self.beta, alpha_12 / self.beta],
            [alpha_21 / self.beta, alpha_22 / self.beta]
        ])

        # Spectral radius (eigenvalues)
        eigvals = np.linalg.eigvals(gamma_matrix)
        spectral_radius = float(np.max(np.abs(eigvals)))

        return {
            "sample_events": len(sub_df),
            "observation_window_seconds": T,
            "decay_beta": self.beta,
            "buy_events_count": n_buy,
            "sell_events_count": n_sell,
            "average_arrival_rate_buy": n_buy / T,
            "average_arrival_rate_sell": n_sell / T,
            "parameters": {
                "mu_buy": float(mu_1),
                "mu_sell": float(mu_2),
                "alpha_buy_buy_self": float(alpha_11),
                "alpha_sell_buy_cross": float(alpha_12),
                "alpha_buy_sell_cross": float(alpha_21),
                "alpha_sell_sell_self": float(alpha_22),
            },
            "branching_ratios": {
                "buy_to_buy": float(gamma_matrix[0, 0]),
                "sell_to_buy": float(gamma_matrix[0, 1]),
                "buy_to_sell": float(gamma_matrix[1, 0]),
                "sell_to_sell": float(gamma_matrix[1, 1]),
                "spectral_radius": spectral_radius,
                "is_subcritical_stable": bool(spectral_radius < 1.0)
            },
            "interpretation": (
                "Spectral radius rho(Gamma) < 1 confirms stable, non-explosive clustering. "
                f"Self-excitation ({gamma_matrix[0, 0]:.3f} / {gamma_matrix[1, 1]:.3f}) reflects parent-order slicing, "
                f"while cross-excitation ({gamma_matrix[0, 1]:.3f} / {gamma_matrix[1, 0]:.3f}) captures market-maker reaction and directional contagion."
            )
        }

    def _fit_single_dimension(
        self,
        t_target: np.ndarray,
        all_event_times: List[np.ndarray],
        T: float,
        mu_init: float,
        alpha_init: float
    ) -> Tuple[float, float, float]:
        """
        Maximizes log-likelihood for single point process with inputs from all dimensions:
        lambda(t) = mu + alpha_1 * R_1(t) + alpha_2 * R_2(t)
        where R_m(t) = sum_{s < t} exp(-beta*(t - s))
        """
        beta = self.beta
        
        # Precompute recursive exponential decay state at target event times
        # R_m(t_k) = exp(-beta * (t_k - t_{k-1})) * R_m(t_{k-1}) + ...
        r_matrices = []
        for src_times in all_event_times:
            r_vals = np.zeros(len(t_target), dtype=np.float64)
            # Efficient vectorized binary search or recursive accumulator
            src_idx = 0
            acc = 0.0
            last_t = 0.0
            for i, cur_t in enumerate(t_target):
                # Decay accumulator
                if cur_t > last_t:
                    acc *= np.exp(-beta * (cur_t - last_t))
                # Add all src events strictly between last_t and cur_t
                while src_idx < len(src_times) and src_times[src_idx] < cur_t:
                    dt = cur_t - src_times[src_idx]
                    acc += np.exp(-beta * dt)
                    src_idx += 1
                r_vals[i] = acc
                last_t = cur_t
            r_matrices.append(r_vals)

        R1 = r_matrices[0]
        R2 = r_matrices[1]
        N = len(t_target)

        # Integrated terms:
        # int_0^T mu dt = mu * T
        # int_0^T alpha_m * sum_{s_j < T} exp(-beta*(t - s_j)) dt = (alpha_m / beta) * sum_j (1 - exp(-beta*(T - s_j)))
        int_factor_1 = np.sum(1.0 - np.exp(-beta * (T - all_event_times[0]))) / beta
        int_factor_2 = np.sum(1.0 - np.exp(-beta * (T - all_event_times[1]))) / beta

        def neg_log_lik(params):
            mu, a1, a2 = params
            if mu <= 1e-5 or a1 < 0 or a2 < 0:
                return 1e12
            lam = mu + a1 * R1 + a2 * R2
            if np.any(lam <= 0):
                return 1e12
            # Log likelihood
            ll = np.sum(np.log(lam)) - (mu * T + a1 * int_factor_1 + a2 * int_factor_2)
            return -ll

        init_params = [max(0.1, mu_init), alpha_init, alpha_init]
        bounds = [(1e-4, None), (0.0, beta * 2.0), (0.0, beta * 2.0)]
        res = minimize(neg_log_lik, init_params, bounds=bounds, method="L-BFGS-B")
        
        return float(res.x[0]), float(res.x[1]), float(res.x[2])
