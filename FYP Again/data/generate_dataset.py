"""
Synthetic Poultry Dataset Generator
====================================
Generates realistic poultry growth + feeding data based on
published West African / Nigerian broiler performance standards.

Variables:
  - bird_id, day, breed, production_type, phase
  - age_days, temperature_c, humidity_pct, season
  - feed_intake_g (per bird per day)
  - water_intake_ml
  - body_weight_g  ← TARGET variable for Random Forest
  - fcr (feed conversion ratio)
  - mortality_risk (0/1)
  - health_status
"""

import numpy as np
import pandas as pd
import os

np.random.seed(42)

# ── CONSTANTS ──────────────────────────────────────────────────────────────
BREEDS = {
    "Ross 308":        {"growth_rate": 1.05, "feed_efficiency": 1.02},
    "Cobb 500":        {"growth_rate": 1.08, "feed_efficiency": 1.05},
    "Marshall":        {"growth_rate": 1.03, "feed_efficiency": 1.00},
    "Noiler":          {"growth_rate": 0.88, "feed_efficiency": 0.92},
    "Nigerian Local":  {"growth_rate": 0.78, "feed_efficiency": 0.85},
}

SEASONS = ["Dry/Harmattan", "Early Rainy", "Peak Rainy", "Late Rainy"]

HEALTH_STATES = ["Healthy", "Mild Stress", "Recovering", "Post-Vaccination"]

PROBLEM_TYPES = [
    "High deaths",
    "Heat stress",
    "Low appetite",
    "Disease symptoms",
    "Poor ventilation",
    "Dirty/wet litter",
    "Mouldy feed",
    "Very high humidity",
    "Vaccination stress",
    "Very poor weight gain",
]

# Base daily feed intake (g/bird) by age group — based on published broiler standards
def base_feed_intake(age_days):
    if age_days <= 7:    return 15
    elif age_days <= 14: return 35
    elif age_days <= 21: return 65
    elif age_days <= 28: return 95
    elif age_days <= 35: return 120
    elif age_days <= 42: return 145
    else:                return 160

# Expected body weight (g) by age — Cobb 500 standard curve
def expected_weight(age_days, breed_multiplier=1.0):
    # Logistic growth curve fitted to broiler standards
    w_max = 2800 * breed_multiplier
    k = 0.11
    t0 = 20
    weight = w_max / (1 + np.exp(-k * (age_days - t0)))
    return max(40, weight)


# ── MAIN GENERATOR ─────────────────────────────────────────────────────────
def generate_dataset(n_flocks=40, days_per_flock=42):
    records = []

    for flock_id in range(n_flocks):
        breed_name = np.random.choice(list(BREEDS.keys()))
        breed      = BREEDS[breed_name]
        season     = np.random.choice(SEASONS)
        flock_size = np.random.randint(300, 1000)
        pen_id     = f"Pen_{chr(65 + flock_id % 8)}"

        # Assign seasonal base temperature
        if season == "Dry/Harmattan":
            base_temp = np.random.uniform(28, 38)
        elif season == "Peak Rainy":
            base_temp = np.random.uniform(24, 32)
        else:
            base_temp = np.random.uniform(26, 35)

        cumulative_feed = 0
        prev_weight     = 40  # Day 1 chick weight (g)

        for day in range(1, days_per_flock + 1):
            # Some days are deliberately difficult so the mortality model
            # learns realistic at-risk examples instead of only healthy cases.
            problem_type = "None"
            if np.random.random() < 0.32:
                problem_type = np.random.choice(PROBLEM_TYPES)

            # Temperature varies day-to-day
            temp    = np.clip(base_temp + np.random.normal(0, 1.5), 18, 42)
            humidity = np.clip(
                (80 if "Rainy" in season else 55) + np.random.normal(0, 5), 30, 98
            )

            if problem_type == "Heat stress":
                temp = np.random.uniform(36.5, 42.0)
            elif problem_type == "Very high humidity":
                humidity = np.random.uniform(86.0, 98.0)
            elif problem_type in ["Poor ventilation", "Dirty/wet litter", "Mouldy feed"]:
                humidity = max(humidity, np.random.uniform(82.0, 96.0))
                temp = max(temp, np.random.uniform(32.0, 38.5))

            # Production phase
            if day <= 14:   phase = "Starter"
            elif day <= 28: phase = "Grower"
            else:           phase = "Finisher"

            # Health status (weighted random)
            health = np.random.choice(
                HEALTH_STATES, p=[0.75, 0.12, 0.08, 0.05]
            )
            if problem_type in ["Disease symptoms", "High deaths", "Mouldy feed"]:
                health = "Recovering"
            elif problem_type in ["Low appetite", "Poor ventilation", "Dirty/wet litter", "Very poor weight gain"]:
                health = "Mild Stress"
            elif problem_type == "Vaccination stress":
                health = "Post-Vaccination"

            # ── FEED INTAKE ──────────────────────────────────────────────
            base_fi = base_feed_intake(day) * breed["feed_efficiency"]

            # Temperature penalty (heat stress reduces appetite)
            if temp > 37:
                temp_factor = 0.78
            elif temp > 34:
                temp_factor = 0.88
            elif temp < 22:
                temp_factor = 1.08   # cool weather = more appetite
            else:
                temp_factor = 1.00

            # Humidity penalty
            humidity_factor = 1.0 - max(0, (humidity - 70) * 0.003)

            # Health penalty
            health_factor = {
                "Healthy":          1.00,
                "Mild Stress":      0.90,
                "Recovering":       0.78,
                "Post-Vaccination": 0.85,
            }[health]

            # Season factor (harmattan dust affects respiratory intake)
            season_factor = 0.95 if season == "Dry/Harmattan" else 1.00

            feed_intake = (
                base_fi
                * temp_factor
                * humidity_factor
                * health_factor
                * season_factor
                + np.random.normal(0, 2)  # biological noise
            )
            if problem_type in ["Low appetite", "Disease symptoms", "Mouldy feed", "High deaths"]:
                feed_intake *= np.random.uniform(0.45, 0.70)
            elif problem_type in ["Very poor weight gain", "Vaccination stress"]:
                feed_intake *= np.random.uniform(0.60, 0.82)
            feed_intake = max(5, feed_intake)

            # ── BODY WEIGHT ──────────────────────────────────────────────
            expected = expected_weight(day, breed["growth_rate"])

            # Weight is influenced by cumulative feed and today's conditions
            cumulative_feed += feed_intake
            weight_noise     = np.random.normal(0, expected * 0.025)

            # Stress reduces weight gain
            stress_penalty = 1 - (1 - health_factor) * 0.6
            if problem_type in ["Very poor weight gain", "Disease symptoms", "Mouldy feed", "High deaths"]:
                stress_penalty *= np.random.uniform(0.72, 0.86)
            elif problem_type in ["Poor ventilation", "Dirty/wet litter", "Low appetite"]:
                stress_penalty *= np.random.uniform(0.82, 0.93)
            body_weight    = (
                expected
                * stress_penalty
                * (0.85 + 0.15 * (cumulative_feed / (base_feed_intake(day) * day + 1)))
                + weight_noise
            )
            body_weight = max(prev_weight, body_weight)  # weight never decreases
            prev_weight = body_weight

            # ── FCR ──────────────────────────────────────────────────────
            if body_weight > 40:
                fcr = cumulative_feed / max(body_weight - 40, 1)
            else:
                fcr = 2.0
            fcr = np.clip(fcr + np.random.normal(0, 0.05), 1.2, 3.5)
            if problem_type in ["Very poor weight gain", "Low appetite", "Disease symptoms", "Mouldy feed"]:
                fcr = np.clip(fcr + np.random.uniform(0.35, 1.10), 1.2, 4.5)

            # ── WATER INTAKE ─────────────────────────────────────────────
            # ~2x feed intake; higher in heat
            water_ml = feed_intake * (2.0 + max(0, (temp - 25) * 0.06)) + np.random.normal(0, 5)
            water_ml = max(20, water_ml)

            # ── MORTALITY RISK ───────────────────────────────────────────
            expected_today = expected_weight(day, breed["growth_rate"])
            poor_weight_gain = body_weight < expected_today * 0.82
            low_feed_intake = feed_intake < base_fi * 0.72

            mort_prob = 0.01
            if temp > 36: mort_prob += 0.08
            if temp > 38: mort_prob += 0.08
            if humidity > 85: mort_prob += 0.06
            if humidity > 92: mort_prob += 0.04
            if health == "Recovering": mort_prob += 0.12
            if health == "Mild Stress": mort_prob += 0.07
            if health == "Post-Vaccination": mort_prob += 0.05
            if low_feed_intake: mort_prob += 0.10
            if fcr > 2.2: mort_prob += 0.08
            if poor_weight_gain: mort_prob += 0.12
            if problem_type != "None": mort_prob += 0.16
            if problem_type in ["High deaths", "Disease symptoms", "Mouldy feed"]:
                mort_prob += 0.18
            mort_prob = min(mort_prob, 0.85)
            mortality_risk = int(np.random.random() < mort_prob)

            records.append({
                "flock_id":       flock_id,
                "pen_id":         pen_id,
                "day":            day,
                "breed":          breed_name,
                "phase":          phase,
                "season":         season,
                "health_status":  health,
                "flock_size":     flock_size,
                "temperature_c":  round(temp, 1),
                "humidity_pct":   round(humidity, 1),
                "feed_intake_g":  round(feed_intake, 2),
                "water_intake_ml":round(water_ml, 2),
                "cumulative_feed_g": round(cumulative_feed, 2),
                "body_weight_g":  round(body_weight, 2),
                "fcr":            round(fcr, 3),
                "problem_type":   problem_type,
                "mortality_risk": mortality_risk,
            })

    df = pd.DataFrame(records)
    return df


if __name__ == "__main__":
    print("Generating synthetic poultry dataset...")
    df = generate_dataset(n_flocks=50, days_per_flock=42)

    os.makedirs("data", exist_ok=True)
    out = os.path.join(os.path.dirname(__file__), "poultry_dataset.csv")
    df.to_csv(out, index=False)

    risk_rate = df["mortality_risk"].mean() * 100
    print(f"Dataset generated: {len(df):,} records")
    print(f"Saved to: {out}")
    print(f"At-risk rows: {df['mortality_risk'].sum():,} ({risk_rate:.1f}%)")
    print(f"\nColumn summary:\n{df.describe().round(2)}")
    print(f"\nBreed distribution:\n{df['breed'].value_counts()}")
    print(f"\nSeason distribution:\n{df['season'].value_counts()}")
    print(f"\nProblem type distribution:\n{df['problem_type'].value_counts()}")
