"""Rothermel (1972) surface fire rate of spread — SI units, vectorized.

Fuel parameters live in fuel_models.csv (Scott & Burgan 40 subset).
Exports per-cell base ROS (no wind/slope) plus the wind amplification
coefficients the propagator needs for the anisotropic ellipse.

Unit conventions: loads t/ac -> kg/m2, SAV 1/ft -> 1/m, depth ft -> m,
heat Btu/lb -> kJ/kg, result in m/min.
"""
import csv
from pathlib import Path

import numpy as np

FUEL_CSV = Path(__file__).parent / "fuel_models.csv"
WORLDCOVER_CSV = Path(__file__).parent / "worldcover_to_fuel.csv"

# conversions
T_AC_TO_KG_M2 = 0.224170
FT1_TO_M1 = 3.28084
FT_TO_M = 0.3048
MS_TO_FTMIN = 196.8504
H_KJ_KG = 18608.0          # ~8000 Btu/lb
RHO_P = 513.0              # ovendry particle density kg/m3
ST = 0.0555                # effective silica content
MODEL_CODES = {}           # filled at import: model name -> row index


class FuelTable:
    """Precomputed per-model Rothermel intermediates, indexable by a grid."""

    def __init__(self):
        rows = [r for r in csv.DictReader(
            open(FUEL_CSV, encoding="utf-8")) if not r["model"].startswith("#")]
        self.models = [r["model"] for r in rows]
        self.w1h = np.array([float(r["w1h"]) for r in rows]) * T_AC_TO_KG_M2
        self.w10h = np.array([float(r["w10h"]) for r in rows]) * T_AC_TO_KG_M2
        self.w100h = np.array([float(r["w100h"]) for r in rows]) * T_AC_TO_KG_M2
        self.wherb = np.array([float(r["wherb"]) for r in rows]) * T_AC_TO_KG_M2
        self.wwoody = np.array([float(r["wwoody"]) for r in rows]) * T_AC_TO_KG_M2
        self.sav1h = np.array([float(r["sav1h"]) for r in rows]) * FT1_TO_M1
        self.savherb = np.array([float(r["savherb"]) for r in rows]) * FT1_TO_M1
        self.savwoody = np.array([float(r["savwoody"]) for r in rows]) * FT1_TO_M1
        self.depth = np.array([float(r["depth_ft"]) for r in rows]) * FT_TO_M
        self.mx_dead = np.array([float(r["mx_dead"]) for r in rows]) / 100.0
        self.burnable = self.w1h + self.w10h + self.w100h + self.wherb + self.wwoody > 0

        # per-model constants used by wind factor (Scott & Burgan formulation)
        with np.errstate(divide="ignore", invalid="ignore"):
            # surface-area weighting -> characteristic SAV sigma_bar
            A_dead = (self.w1h * self.sav1h + self.w10h * self.sav1h
                      + self.w100h * self.sav1h) / RHO_P
            A_live = (self.wherb * np.where(self.savherb > 0, self.savherb, 1)
                      + self.wwoody * np.where(self.savwoody > 0, self.savwoody, 1)) / RHO_P
            A_tot = A_dead + A_live
            f_dead = np.divide(A_dead, A_tot, out=np.zeros_like(A_tot), where=A_tot > 0)
            sig_dead = np.where(A_dead > 0, A_dead * self.sav1h, 0)
            sig_live = np.where(A_live > 0,
                                self.wherb * self.savherb + self.wwoody * self.savwoody,
                                0)
            self.sigma_bar = np.divide(
                sig_dead + sig_live, A_tot,
                out=np.ones_like(A_tot), where=A_tot > 0) / 1.0
            # simpler characteristic: load-weighted SAV over all particles
            total_w = self.w1h + self.w10h + self.w100h + self.wherb + self.wwoody
            sav_num = (self.w1h * self.sav1h + self.w10h * self.sav1h
                       + self.w100h * self.sav1h
                       + self.wherb * self.savherb + self.wwoody * self.savwoody)
            self.sigma_bar = np.divide(
                sav_num, total_w, out=np.zeros_like(total_w), where=total_w > 0)

            self.rho_b = np.divide(total_w, self.depth,
                                   out=np.zeros_like(total_w), where=self.depth > 0)
            self.beta = self.rho_b / RHO_P
            self.beta_op = 3.348 * np.power(np.maximum(self.sigma_bar, 1), -0.8189)

            gmax = np.power(self.sigma_bar, 1.5) / (495.0 + 0.0594 * np.power(self.sigma_bar, 1.5))
            Astar = 133.0 * np.power(np.maximum(self.sigma_bar, 1), -0.7913)
            rel = np.divide(self.beta, self.beta_op,
                            out=np.zeros_like(self.beta), where=self.beta_op > 0)
            self.gamma_prime = gmax * np.power(rel, Astar) * np.exp(Astar * (1.0 - rel))
            self.gamma_prime = np.nan_to_num(self.gamma_prime)

            self.wn_dead = (self.w1h + self.w10h + self.w100h) * (1 - ST)
            self.wn_live = (self.wherb + self.wwoody) * (1 - ST)
            self.f_dead = f_dead

            # propagating flux & wind-factor coefficients
            self.xi = np.power(192.0 + 0.2595 * self.sigma_bar, -1) * np.exp(
                (0.792 + 0.681 * np.sqrt(np.maximum(self.sigma_bar, 1)))
                * (self.beta + 0.1))
            self.C_wind = 7.47 * np.exp(-0.133 * np.power(np.maximum(self.sigma_bar, 1), 0.55))
            self.B_wind = 0.02526 * np.power(np.maximum(self.sigma_bar, 1), 0.54)
            self.E_wind = 0.715 * np.exp(-0.000359 * np.maximum(self.sigma_bar, 1))
            self.epsilon = np.exp(-138.0 / np.maximum(self.sigma_bar, 1))

    def idx(self, model: str) -> int:
        return self.models.index(model)


def load_worldcover_map() -> dict[int, int]:
    """WorldCover class code -> fuel table row index."""
    ft = FUEL_TABLE
    mapping = {}
    for r in csv.DictReader(open(WORLDCOVER_CSV, encoding="utf-8")):
        if r["worldcover_code"].startswith("#"):
            continue
        mapping[int(r["worldcover_code"])] = ft.idx(r["fuel_model"])
    return mapping


def fuel_moisture_from_weather(rh_pct: float, temp_c: float) -> float:
    """Dead fine-fuel moisture fraction from RH/temp (simple estimate).

    RH 12% -> ~3.5%, RH 40% -> ~8%, RH 80% -> ~14%.
    """
    mf = 1.0 + 0.14 * rh_pct - 0.06 * max(0.0, temp_c - 20.0)
    return float(np.clip(mf, 2.0, 30.0)) / 100.0


def ros_components(fuel_idx: np.ndarray, mf_dead: float):
    """Return dict of per-cell arrays needed for base ROS + wind factor."""
    ft = FUEL_TABLE
    g = np.asarray(fuel_idx)
    out = {
        "burnable": ft.burnable[g],
        "rho_b": ft.rho_b[g],
        "beta": ft.beta[g],
        "beta_op": ft.beta_op[g],
        "gamma": ft.gamma_prime[g],
        "wn_dead": ft.wn_dead[g],
        "wn_live": ft.wn_live[g],
        "f_dead": ft.f_dead[g],
        "xi": ft.xi[g],
        "eps": ft.epsilon[g],
        "mx": ft.mx_dead[g],
        "C": ft.C_wind[g],
        "B": ft.B_wind[g],
        "E": ft.E_wind[g],
    }
    # dead-fuel moisture damping
    x = np.divide(mf_dead, out["mx"], out=np.ones_like(out["mx"]),
                  where=out["mx"] > 0)
    eta_d = np.clip(1 - 2.59 * x + 5.11 * x * x - 3.52 * x * x * x, 0, 1)
    out["eta_d"] = eta_d
    # live fuel moisture: approximate 1.5x dead, extinction 1.2x dead Mx
    ml = np.minimum(mf_dead * 1.5, 0.6)
    xl = np.divide(ml, out["mx"] * 1.2, out=np.ones_like(out["mx"]),
                   where=out["mx"] > 0)
    out["eta_l"] = np.clip(1 - 2.59 * xl + 5.11 * xl * xl - 3.52 * xl * xl * xl, 0, 1)
    out["mf"] = mf_dead
    return out


def base_ros(comp: dict) -> np.ndarray:
    """No-wind/no-slope ROS in m/min. Non-burnable cells -> 0."""
    i_r = comp["gamma"] * (
        comp["wn_dead"] * comp["eta_d"] * H_KJ_KG
        + comp["wn_live"] * comp["eta_l"] * H_KJ_KG)
    q_ig = 250.0 + 1116.0 * comp["mf"]
    denom = comp["rho_b"] * comp["eps"] * q_ig
    r = np.divide(i_r * comp["xi"], denom,
                  out=np.zeros_like(denom), where=denom > 0)
    return np.where(comp["burnable"], np.clip(r, 0, 60.0), 0.0)


def wind_factor(comp: dict, u_midflame_ms: np.ndarray) -> np.ndarray:
    """Rothermel wind amplification (1 + phi_w) at given midflame wind m/s."""
    u_ftmin = np.asarray(u_midflame_ms) * MS_TO_FTMIN
    rel = np.divide(comp["beta"], comp["beta_op"],
                    out=np.zeros_like(comp["beta"]), where=comp["beta_op"] > 0)
    phi = comp["C"] * np.power(u_ftmin, comp["B"]) * np.power(rel, -comp["E"])
    return 1.0 + np.nan_to_num(phi)


FUEL_TABLE = FuelTable()
