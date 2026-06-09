"""
Random Forest Model Trainer
============================
Trains two RF models:
  1. body_weight_g predictor  (regression)
  2. mortality_risk predictor (classification)

Evaluates with RMSE, MAE, R2 (as per your project objectives).
Saves trained models + encoders to /models directory.
"""

import os, sys, json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score,
    accuracy_score, classification_report
)
import pickle

# ── PATHS ──────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_PATH   = os.path.join(BASE_DIR, "poultry_dataset.csv")
MODELS_DIR  = os.path.join(BASE_DIR, "..", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# ── LOAD DATA ──────────────────────────────────────────────────────────────
def load_and_prepare(path):
    df = pd.read_csv(path)
    print(f"Loaded {len(df):,} records, {df.shape[1]} columns")

    # Encode categorical columns
    cat_cols = ["breed", "phase", "season", "health_status"]
    encoders = {}
    for col in cat_cols:
        le = LabelEncoder()
        df[col + "_enc"] = le.fit_transform(df[col])
        encoders[col] = le

    return df, encoders


# ── FEATURE SETS ──────────────────────────────────────────────────────────
WEIGHT_FEATURES = [
    "day",
    "breed_enc",
    "phase_enc",
    "season_enc",
    "health_status_enc",
    "flock_size",
    "temperature_c",
    "humidity_pct",
    "feed_intake_g",
    "water_intake_ml",
    "cumulative_feed_g",
]

MORT_FEATURES = [
    "day",
    "breed_enc",
    "phase_enc",
    "season_enc",
    "health_status_enc",
    "temperature_c",
    "humidity_pct",
    "feed_intake_g",
    "body_weight_g",
    "fcr",
]


# ── TRAIN WEIGHT MODEL ─────────────────────────────────────────────────────

def oversample_minority_class(X_train, y_train, target_ratio=0.5):
    train_df = X_train.copy()
    train_df["mortality_risk"] = y_train.values

    majority = train_df[train_df["mortality_risk"] == 0]
    minority = train_df[train_df["mortality_risk"] == 1]

    if minority.empty:
        return X_train, y_train

    target_minority_count = int(len(majority) * target_ratio)
    minority_sampled = minority.sample(
        n=target_minority_count,
        replace=True,
        random_state=42,
    )

    balanced = (
        pd.concat([majority, minority_sampled], ignore_index=True)
        .sample(frac=1, random_state=42)
        .reset_index(drop=True)
    )

    return balanced[MORT_FEATURES], balanced["mortality_risk"]
def train_weight_model(df):
    print("\n-- Training body weight prediction model (RF Regressor) --")

    X = df[WEIGHT_FEATURES]
    y = df["body_weight_g"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=20,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)

    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae  = mean_absolute_error(y_test, y_pred)
    r2   = r2_score(y_test, y_pred)

    # Cross-validation R2
    cv_r2 = cross_val_score(model, X, y, cv=5, scoring="r2")

    print(f"  RMSE  : {rmse:.2f} g")
    print(f"  MAE   : {mae:.2f} g")
    print(f"  R2    : {r2:.4f}")
    print(f"  CV R2 : {cv_r2.mean():.4f} +/- {cv_r2.std():.4f}")

    # Feature importance
    importances = pd.Series(
        model.feature_importances_, index=WEIGHT_FEATURES
    ).sort_values(ascending=False)
    print(f"\n  Top features:\n{importances.head(6).to_string()}")

    metrics = {
        "rmse": round(rmse, 4),
        "mae":  round(mae, 4),
        "r2":   round(r2, 4),
        "cv_r2_mean": round(float(cv_r2.mean()), 4),
        "cv_r2_std":  round(float(cv_r2.std()), 4),
        "feature_importances": importances.round(4).to_dict(),
        "train_size": len(X_train),
        "test_size":  len(X_test),
    }
    return model, metrics


# ── TRAIN MORTALITY MODEL ──────────────────────────────────────────────────
def train_mortality_model(df):
    print("\n-- Training mortality risk model (RF Classifier) --")

    X = df[MORT_FEATURES]
    y = df["mortality_risk"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    X_train_bal, y_train_bal = oversample_minority_class(X_train, y_train)

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=18,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train_bal, y_train_bal)

    y_pred = model.predict(X_test)
    acc    = accuracy_score(y_test, y_pred)
    report = classification_report(
        y_test,
        y_pred,
        target_names=["Alive", "At Risk"],
        zero_division=0,
        output_dict=True,
    )
    print(f"  Accuracy: {acc:.4f}")
    print(f"  Original training class counts:\n{y_train.value_counts().sort_index().to_string()}")
    print(f"  Oversampled training class counts:\n{y_train_bal.value_counts().sort_index().to_string()}")
    print(classification_report(y_test, y_pred, target_names=["Alive","At Risk"], zero_division=0))

    metrics = {
        "accuracy": round(acc, 4),
        "at_risk_precision": round(report["At Risk"]["precision"], 4),
        "at_risk_recall": round(report["At Risk"]["recall"], 4),
        "at_risk_f1": round(report["At Risk"]["f1-score"], 4),
        "train_size": len(X_train),
        "oversampled_train_size": len(X_train_bal),
        "test_size":  len(X_test),
        "class_counts": y.value_counts().sort_index().astype(int).to_dict(),
        "oversampled_class_counts": y_train_bal.value_counts().sort_index().astype(int).to_dict(),
    }
    return model, metrics


# ── SAVE ───────────────────────────────────────────────────────────────────
def save_artifacts(weight_model, mort_model, encoders,
                   weight_metrics, mort_metrics):
    # Models
    with open(os.path.join(MODELS_DIR, "weight_model.pkl"), "wb") as f:
        pickle.dump(weight_model, f)
    with open(os.path.join(MODELS_DIR, "mortality_model.pkl"), "wb") as f:
        pickle.dump(mort_model, f)
    # Encoders
    with open(os.path.join(MODELS_DIR, "encoders.pkl"), "wb") as f:
        pickle.dump(encoders, f)
    # Metrics (for dashboard display)
    all_metrics = {
        "weight_model": weight_metrics,
        "mortality_model": mort_metrics,
        "weight_features": WEIGHT_FEATURES,
        "mort_features": MORT_FEATURES,
    }
    with open(os.path.join(MODELS_DIR, "metrics.json"), "w") as f:
        json.dump(all_metrics, f, indent=2)

    print(f"\nModels saved to: {MODELS_DIR}")


# ── MAIN ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if not os.path.exists(DATA_PATH):
        print("Dataset not found. Run generate_dataset.py first.")
        sys.exit(1)

    df, encoders = load_and_prepare(DATA_PATH)

    weight_model, weight_metrics = train_weight_model(df)
    mort_model,   mort_metrics   = train_mortality_model(df)

    save_artifacts(weight_model, mort_model, encoders, weight_metrics, mort_metrics)

    print("\nTraining complete!")
    print(f"  Weight model R2   : {weight_metrics['r2']}")
    print(f"  Weight model RMSE : {weight_metrics['rmse']} g")
    print(f"  Weight model MAE  : {weight_metrics['mae']} g")
    print(f"  Mortality accuracy: {mort_metrics['accuracy']}")
