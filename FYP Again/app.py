"""
Smart Poultry Feed Management System
Flask backend with user authentication + Random Forest predictions
"""

import os, json, pickle, sqlite3
from datetime import datetime
from functools import wraps
import numpy as np
import pandas as pd
import google.generativeai as genai
from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_PATH  = os.path.join(BASE_DIR, "data", "poultry_dataset.csv")
DB_PATH    = os.path.join(BASE_DIR, "poultry.db")

app = Flask(__name__, static_folder="frontend", static_url_path="")
app.secret_key = "poultry_secret_key_2025_covenant_university"

# ── CORS ──────────────────────────────────────────────────────────────────
@app.after_request
def add_cors(r):
    r.headers["Access-Control-Allow-Origin"]      = "*"
    r.headers["Access-Control-Allow-Headers"]     = "Content-Type"
    r.headers["Access-Control-Allow-Methods"]     = "GET,POST,OPTIONS"
    r.headers["Access-Control-Allow-Credentials"] = "true"
    return r

@app.route("/api/<path:p>", methods=["OPTIONS"])
def options(p): return jsonify({}), 200

# ── DATABASE ──────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name    TEXT NOT NULL,
            email        TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            farm_name    TEXT,
            created_at   TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feed_records (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            pen_name   TEXT,
            breed      TEXT,
            age_days   INTEGER,
            flock_size INTEGER,
            temp       REAL,
            season     TEXT,
            health     TEXT,
            feed_per_bird REAL,
            total_feed_kg REAL,
            predicted_weight REAL,
            mortality_risk TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS performance_logs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL,
            pen_name     TEXT NOT NULL,
            log_date     TEXT NOT NULL,
            feed_kg      REAL NOT NULL,
            water_l      REAL NOT NULL,
            avg_weight_g REAL NOT NULL,
            deaths       INTEGER NOT NULL,
            temp_c       REAL NOT NULL,
            humidity_pct REAL NOT NULL,
            notes        TEXT,
            created_at   TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS vaccine_schedule (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL,
            pen_name      TEXT NOT NULL,
            vaccine_name  TEXT NOT NULL,
            target_age    INTEGER NOT NULL,
            status        TEXT NOT NULL DEFAULT 'Pending',
            administered_date TEXT,
            created_at    TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    """)
    user = conn.execute("SELECT id FROM users WHERE id=1").fetchone()
    if not user:
        conn.execute("INSERT INTO users (id, full_name, email, password_hash, farm_name, created_at) VALUES (1, 'Prest Manager', 'prest@farm.com', 'scrypt:32768:8:1$u7F5GgI0UqZcQ2nZ$87841e1df5c4b1ea406fb50c76b92a34bb99623f95b54659b87b7a14e9f908e2', 'Ikorodu Farm', '2026-06-02T12:00:00')")
    count = conn.execute("SELECT COUNT(*) FROM performance_logs").fetchone()[0]
    if count == 0:
        from datetime import timedelta
        import random
        logs = []
        base_date = datetime.now()
        for i in range(14):
            log_date = (base_date - timedelta(days=14 - i)).strftime("%Y-%m-%d")
            weight_a = 400 + (1120 - 400) * (i / 13) + random.uniform(-10, 10)
            feed_a = (50 + (110 - 50) * (i / 13)) * 600 / 1000
            water_a = feed_a * (2.0 + random.uniform(0.1, 0.4))
            deaths_a = 1 if i in [3, 9] else 0
            temp_a = 32.0 - (i * 0.15) + random.uniform(-0.5, 0.5)
            humidity_a = 75.0 + random.uniform(-5.0, 5.0)
            logs.append((1, "Pen A", log_date, round(feed_a, 2), round(water_a, 2), round(weight_a, 1), deaths_a, round(temp_a, 1), round(humidity_a, 1), "Seeded grow-out log", datetime.now().isoformat()))
            weight_b = 380 + (1080 - 380) * (i / 13) + random.uniform(-10, 10)
            feed_b = (48 + (105 - 48) * (i / 13)) * 620 / 1000
            water_b = feed_b * (2.1 + random.uniform(0.1, 0.3))
            deaths_b = 1 if i in [2, 8, 12] else 0
            temp_b = 31.5 - (i * 0.1) + random.uniform(-0.5, 0.5)
            humidity_b = 78.0 + random.uniform(-4.0, 4.0)
            logs.append((1, "Pen B", log_date, round(feed_b, 2), round(water_b, 2), round(weight_b, 1), deaths_b, round(temp_b, 1), round(humidity_b, 1), "Seeded grow-out log", datetime.now().isoformat()))
        conn.executemany("INSERT INTO performance_logs (user_id, pen_name, log_date, feed_kg, water_l, avg_weight_g, deaths, temp_c, humidity_pct, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", logs)

    v_count = conn.execute("SELECT COUNT(*) FROM vaccine_schedule").fetchone()[0]
    if v_count == 0:
        now_str = datetime.now().isoformat()
        vaccines = [
            (1, "Pen A", "Gumboro (1st Dose)", 7, "Administered", "2026-05-18", now_str),
            (1, "Pen A", "Newcastle (Lasota 1st)", 10, "Administered", "2026-05-21", now_str),
            (1, "Pen A", "Gumboro (2nd Dose)", 14, "Administered", "2026-05-25", now_str),
            (1, "Pen A", "Newcastle Booster (Lasota)", 21, "Administered", "2026-06-01", now_str),
            (1, "Pen A", "Fowl Pox Vaccine", 35, "Pending", None, now_str),
            (1, "Pen A", "Newcastle Booster (Killed)", 42, "Pending", None, now_str),

            (1, "Pen B", "Gumboro (1st Dose)", 7, "Administered", "2026-05-18", now_str),
            (1, "Pen B", "Newcastle (Lasota 1st)", 10, "Administered", "2026-05-21", now_str),
            (1, "Pen B", "Gumboro (2nd Dose)", 14, "Administered", "2026-05-25", now_str),
            (1, "Pen B", "Newcastle Booster (Lasota)", 21, "Pending", None, now_str),
            (1, "Pen B", "Fowl Pox Vaccine", 35, "Pending", None, now_str),

            (1, "Pen C", "Gumboro (1st Dose)", 7, "Administered", "2026-05-11", now_str),
            (1, "Pen C", "Newcastle Booster (Lasota)", 21, "Administered", "2026-05-25", now_str),
            (1, "Pen C", "Fowl Pox Vaccine", 35, "Pending", None, now_str),
            (1, "Pen C", "Newcastle Booster (Killed)", 42, "Pending", None, now_str),

            (1, "Pen D", "Gumboro (1st Dose)", 7, "Administered", "2026-05-04", now_str),
            (1, "Pen D", "Newcastle Booster (Lasota)", 21, "Administered", "2026-05-18", now_str),
            (1, "Pen D", "Fowl Pox Vaccine", 35, "Administered", "2026-06-01", now_str),
            (1, "Pen D", "Newcastle Booster (Killed)", 42, "Pending", None, now_str)
        ]
        conn.executemany("INSERT INTO vaccine_schedule (user_id, pen_name, vaccine_name, target_age, status, administered_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", vaccines)

    conn.commit()
    conn.close()

# ── AUTH DECORATOR ────────────────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("X-User-Id") or request.json.get("user_id") if request.json else None
        if not token:
            return jsonify({"error": "Not authenticated"}), 401
        return f(*args, **kwargs)
    return decorated

# ── MODEL LOADING ─────────────────────────────────────────────────────────
def load_models():
    try:
        with open(os.path.join(MODELS_DIR, "weight_model.pkl"),    "rb") as f: wm  = pickle.load(f)
        with open(os.path.join(MODELS_DIR, "mortality_model.pkl"), "rb") as f: mm  = pickle.load(f)
        with open(os.path.join(MODELS_DIR, "encoders.pkl"),        "rb") as f: enc = pickle.load(f)
        with open(os.path.join(MODELS_DIR, "metrics.json"),        "r")  as f: met = json.load(f)
        return wm, mm, enc, met, None
    except Exception as e:
        return None, None, None, None, str(e)

weight_model, mortality_model, encoders, model_metrics, load_error = load_models()

# ── HELPERS ───────────────────────────────────────────────────────────────
def get_phase(age):
    if age <= 14:   return "Starter"
    elif age <= 28: return "Grower"
    else:           return "Finisher"

def base_feed(age):
    if age <= 7:    return 15
    elif age <= 14: return 35
    elif age <= 21: return 65
    elif age <= 28: return 95
    elif age <= 35: return 120
    elif age <= 42: return 145
    else:           return 160

def encode(value, col):
    if not encoders: return 0
    le = encoders.get(col)
    if not le: return 0
    try:    return int(le.transform([value])[0])
    except: return 0

WEIGHT_FEATURES = ["day","breed_enc","phase_enc","season_enc","health_status_enc",
                   "flock_size","temperature_c","humidity_pct","feed_intake_g",
                   "water_intake_ml","cumulative_feed_g"]
MORT_FEATURES   = ["day","breed_enc","phase_enc","season_enc","health_status_enc",
                   "temperature_c","humidity_pct","feed_intake_g","body_weight_g","fcr"]

# ── RATION TEMPLATES ──────────────────────────────────────────────────────
RATIONS = {
    "Starter": [
        {"ingredient":"Maize (whole grain)", "percent":52,"note":"Main energy source"},
        {"ingredient":"Soybean meal",         "percent":30,"note":"High protein for early growth"},
        {"ingredient":"Fish meal",            "percent":8, "note":"Animal protein boost"},
        {"ingredient":"Wheat offal/bran",     "percent":5, "note":"Fibre and B vitamins"},
        {"ingredient":"Vitamin premix",       "percent":3, "note":"Essential micronutrients"},
        {"ingredient":"Limestone/Calcium",    "percent":2, "note":"Bone development"},
    ],
    "Grower": [
        {"ingredient":"Maize (whole grain)", "percent":56,"note":"Primary energy source"},
        {"ingredient":"Soybean meal",         "percent":26,"note":"Protein for muscle growth"},
        {"ingredient":"Fish meal",            "percent":6, "note":"Amino acid supplement"},
        {"ingredient":"Wheat offal/bran",     "percent":6, "note":"Fibre and B vitamins"},
        {"ingredient":"Groundnut cake",       "percent":4, "note":"Affordable protein top-up"},
        {"ingredient":"Vitamin premix",       "percent":2, "note":"Micronutrients"},
    ],
    "Finisher": [
        {"ingredient":"Maize (whole grain)", "percent":62,"note":"High energy for weight gain"},
        {"ingredient":"Soybean meal",         "percent":22,"note":"Maintain protein level"},
        {"ingredient":"Palm kernel cake",     "percent":6, "note":"Cheap energy and fibre"},
        {"ingredient":"Wheat offal/bran",     "percent":5, "note":"Digestive health"},
        {"ingredient":"Vitamin premix",       "percent":3, "note":"Finish phase micronutrients"},
        {"ingredient":"Limestone/Calcium",    "percent":2, "note":"Bone density"},
    ],
}

# ── RECOMMENDATION ENGINE (RF-powered) ───────────────────────────────────
def build_recommendation(d):
    age        = int(d.get("age_days", 28))
    temp       = float(d.get("temperature_c", 30))
    humidity   = float(d.get("humidity_pct", 65))
    season     = d.get("season", "Dry/Harmattan")
    health     = d.get("health_status", "Healthy")
    breed      = d.get("breed", "Cobb 500")
    flock_size = int(d.get("flock_size", 500))
    phase      = get_phase(age)
    tips, alerts = [], []

    # Temperature rules
    if temp > 37:
        feed_factor = 0.78
        tips.append({"icon":"danger","text":f"Severe heat ({temp}°C). Reduce feed 22%. Feed ONLY at 6 AM and 7 PM. Run all ventilation."})
        alerts.append("HEAT STRESS: Add electrolytes + vitamin C to water immediately.")
        schedule = [
            {"time":"6:00 AM", "action":"Give 50% of daily ration. Check all drinkers."},
            {"time":"10:00 AM","action":"Water check only. Do NOT feed — birds won't eat."},
            {"time":"3:00 PM", "action":"Replenish water. Add electrolytes if available."},
            {"time":"7:00 PM", "action":"Give remaining 50% of ration. Cool evening feeding."},
        ]
    elif temp > 34:
        feed_factor = 0.88
        tips.append({"icon":"warn","text":f"High temperature ({temp}°C). Reduce feed 12%. Avoid midday feeding."})
        schedule = [
            {"time":"6:30 AM", "action":"Give 40% of daily ration. Top up drinkers."},
            {"time":"11:00 AM","action":"Water check only. Skip midday feed."},
            {"time":"6:30 PM", "action":"Give remaining 60% of feed. Birds eat well in the evening."},
        ]
    else:
        feed_factor = 1.00
        tips.append({"icon":"ok","text":f"Temperature is comfortable ({temp}°C). Normal 3-meal schedule."})
        schedule = [
            {"time":"7:00 AM", "action":"Give 30% of daily ration. Inspect feeders and drinkers."},
            {"time":"12:00 PM","action":"Give 40% of daily ration. Observe flock behaviour."},
            {"time":"6:00 PM", "action":"Give remaining 30% of ration. Final health check."},
        ]

    if humidity > 80:
        feed_factor *= 0.95
        tips.append({"icon":"warn","text":f"High humidity ({humidity}%). Inspect stored feed for mould daily."})
    if humidity > 85:
        alerts.append("Humidity >85% raises disease risk sharply. Improve ventilation urgently.")

    if season == "Dry/Harmattan":
        tips.append({"icon":"info","text":"Harmattan: add vitamin C + electrolytes to water. Dust irritates respiratory system."})
    elif "Rainy" in season:
        tips.append({"icon":"info","text":"Rainy season: check stored grain for mycotoxins. Supplement vitamin E + selenium."})

    if health == "Recovering":
        feed_factor *= 0.80
        tips.append({"icon":"warn","text":"Recovering flock: reduce ration 20%. Prioritise digestible feed and clean water."})
        alerts.append("Recovering birds need daily monitoring. Contact a vet if no improvement in 48h.")
    elif health == "Post-Vaccination":
        feed_factor *= 0.90
        tips.append({"icon":"info","text":"Post-vaccination: appetite may drop 1-2 days. Add vitamins to drinking water."})
    elif health == "Mild Stress":
        feed_factor *= 0.92
        tips.append({"icon":"warn","text":"Mild stress detected. Monitor closely and ensure adequate space and ventilation."})

    # Quantities
    base_fi       = base_feed(age)
    feed_per_bird = round(base_fi * feed_factor, 1)
    total_feed_kg = round(feed_per_bird * flock_size / 1000, 2)
    water_per_bird = round(feed_per_bird * (2.0 + max(0, (temp - 25) * 0.05)))
    total_water_l  = round(water_per_bird * flock_size / 1000, 1)

    ration = [dict(r) for r in RATIONS[phase]]
    for r in ration:
        r["gPerBird"] = round(feed_per_bird * r["percent"] / 100, 1)

    # RF weight prediction
    ml_weight, confidence_low, confidence_high = None, None, None
    if weight_model:
        feats = pd.DataFrame([{
            "day": age, "breed_enc": encode(breed,"breed"),
            "phase_enc": encode(phase,"phase"), "season_enc": encode(season,"season"),
            "health_status_enc": encode(health,"health_status"),
            "flock_size": flock_size, "temperature_c": temp, "humidity_pct": humidity,
            "feed_intake_g": feed_per_bird,
            "water_intake_ml": water_per_bird,
            "cumulative_feed_g": feed_per_bird * age,
        }])
        ml_weight = round(float(weight_model.predict(feats)[0]), 1)
        trees = np.array([t.predict(feats.values)[0] for t in weight_model.estimators_])
        confidence_low  = round(float(np.percentile(trees, 10)), 1)
        confidence_high = round(float(np.percentile(trees, 90)), 1)

    # RF mortality prediction
    mort_risk, mort_pct, mort_level = None, None, "Unknown"
    if mortality_model:
        mfeats = pd.DataFrame([{
            "day": age, "breed_enc": encode(breed,"breed"),
            "phase_enc": encode(phase,"phase"), "season_enc": encode(season,"season"),
            "health_status_enc": encode(health,"health_status"),
            "temperature_c": temp, "humidity_pct": humidity,
            "feed_intake_g": feed_per_bird,
            "body_weight_g": ml_weight or 1000,
            "fcr": round(feed_per_bird * age / max((ml_weight or 1000) - 40, 1), 3),
        }])
        prob      = mortality_model.predict_proba(mfeats)[0]
        mort_risk = int(mortality_model.predict(mfeats)[0])
        mort_pct  = round(float(prob[1]) * 100, 1)
        mort_level = "Low" if mort_pct < 10 else "Medium" if mort_pct < 25 else "High"

    return {
        "phase": phase, "breed": breed, "age_days": age,
        "feed_per_bird_g":   feed_per_bird,
        "total_feed_kg":     total_feed_kg,
        "water_per_bird_ml": int(water_per_bird),
        "total_water_l":     total_water_l,
        "ration":            ration,
        "schedule":          schedule,
        "tips":              tips,
        "alerts":            alerts or None,
        "ml_predicted_weight_g": ml_weight,
        "confidence_low_g":  confidence_low,
        "confidence_high_g": confidence_high,
        "mortality_risk":    mort_risk,
        "mortality_pct":     mort_pct,
        "mortality_level":   mort_level,
    }

# ══════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════

@app.route("/api/auth/register", methods=["POST"])
def register():
    d = request.json or {}
    name  = d.get("full_name","").strip()
    email = d.get("email","").strip().lower()
    pw    = d.get("password","")
    farm  = d.get("farm_name","").strip()

    if not name or not email or not pw:
        return jsonify({"error": "Full name, email and password are required."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO users (full_name,email,password_hash,farm_name,created_at) VALUES (?,?,?,?,?)",
            (name, email, generate_password_hash(pw), farm, datetime.now().isoformat())
        )
        conn.commit()
        user = conn.execute("SELECT id,full_name,email,farm_name FROM users WHERE email=?", (email,)).fetchone()
        conn.close()
        return jsonify({"message":"Account created successfully","user":{"id":user["id"],"full_name":user["full_name"],"email":user["email"],"farm_name":user["farm_name"]}}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error":"An account with this email already exists."}), 409

@app.route("/api/auth/login", methods=["POST"])
def login():
    d = request.json or {}
    email = d.get("email","").strip().lower()
    pw    = d.get("password","")

    if not email or not pw:
        return jsonify({"error":"Email and password are required."}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], pw):
        return jsonify({"error":"Incorrect email or password."}), 401

    return jsonify({"message":"Login successful","user":{"id":user["id"],"full_name":user["full_name"],"email":user["email"],"farm_name":user["farm_name"]}})

# ══════════════════════════════════════════════════════════════════════════
# PREDICTION ROUTES
# ══════════════════════════════════════════════════════════════════════════

@app.route("/api/recommend/feed", methods=["POST"])
def recommend_feed():
    d = request.json or {}
    try:
        rec = build_recommendation(d)
        # Save to records if user_id provided
        uid = d.get("user_id")
        if uid:
            conn = get_db()
            conn.execute("""INSERT INTO feed_records
                (user_id,pen_name,breed,age_days,flock_size,temp,season,health,
                 feed_per_bird,total_feed_kg,predicted_weight,mortality_risk,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (uid, d.get("pen_name",""), d.get("breed",""), d.get("age_days",0),
                 d.get("flock_size",0), d.get("temperature_c",0), d.get("season",""),
                 d.get("health_status",""), rec["feed_per_bird_g"], rec["total_feed_kg"],
                 rec.get("ml_predicted_weight_g"), rec.get("mortality_level",""),
                 datetime.now().isoformat()))
            conn.commit()
            conn.close()
        return jsonify(rec)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/predict/weight", methods=["POST"])
def predict_weight():
    if not weight_model:
        return jsonify({"error": load_error}), 503
    d = request.json or {}
    try:
        age   = int(d.get("age_days", 28))
        phase = get_phase(age)
        feats = pd.DataFrame([{
            "day": age, "breed_enc": encode(d.get("breed","Cobb 500"),"breed"),
            "phase_enc": encode(phase,"phase"), "season_enc": encode(d.get("season","Dry/Harmattan"),"season"),
            "health_status_enc": encode(d.get("health_status","Healthy"),"health_status"),
            "flock_size": int(d.get("flock_size",500)),
            "temperature_c": float(d.get("temperature_c",30)),
            "humidity_pct": float(d.get("humidity_pct",65)),
            "feed_intake_g": float(d.get("feed_intake_g", base_feed(age))),
            "water_intake_ml": float(d.get("water_intake_ml", base_feed(age)*2)),
            "cumulative_feed_g": float(d.get("cumulative_feed_g", base_feed(age)*age)),
        }])
        pred  = float(weight_model.predict(feats)[0])
        trees = np.array([t.predict(feats.values)[0] for t in weight_model.estimators_])
        return jsonify({"predicted_weight_g": round(pred,1),
                        "confidence_low_g":   round(float(np.percentile(trees,10)),1),
                        "confidence_high_g":  round(float(np.percentile(trees,90)),1),
                        "phase": phase})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/predict/flock", methods=["POST"])
def predict_flock():
    if not weight_model or not mortality_model:
        return jsonify({"error": "ML models not loaded."}), 503
    d = request.json or {}
    try:
        age = int(d.get("age_days", 28))
        breed = d.get("breed", "Cobb 500")
        flock_size = int(d.get("flock_size", 500))
        temp = float(d.get("temperature_c", 30))
        humidity = float(d.get("humidity_pct", 65))
        feed_per_bird = float(d.get("feed_intake_g", base_feed(age)))
        water_per_bird = float(d.get("water_intake_ml", feed_per_bird * 2))
        health = d.get("health_status", "Healthy")
        season = d.get("season", "Dry/Harmattan")

        phase = get_phase(age)

        # Predict Weight
        feats = pd.DataFrame([{
            "day": age, "breed_enc": encode(breed, "breed"), "phase_enc": encode(phase, "phase"),
            "season_enc": encode(season, "season"), "health_status_enc": encode(health, "health_status"),
            "flock_size": flock_size, "temperature_c": temp, "humidity_pct": humidity,
            "feed_intake_g": feed_per_bird, "water_intake_ml": water_per_bird, "cumulative_feed_g": feed_per_bird * age
        }])
        ml_weight = round(float(weight_model.predict(feats)[0]), 1)
        trees = np.array([t.predict(feats.values)[0] for t in weight_model.estimators_])
        confidence_low = round(float(np.percentile(trees, 10)), 1)
        confidence_high = round(float(np.percentile(trees, 90)), 1)

        # Calculate FCR
        estimated_fcr = round(feed_per_bird * age / max((ml_weight) - 40, 1), 3)
        fcr_level = "Efficient" if estimated_fcr < 1.7 else "Watch" if estimated_fcr < 2.1 else "Poor"

        # Predict Mortality
        mfeats = pd.DataFrame([{
            "day": age, "breed_enc": encode(breed, "breed"), "phase_enc": encode(phase, "phase"),
            "season_enc": encode(season, "season"), "health_status_enc": encode(health, "health_status"),
            "temperature_c": temp, "humidity_pct": humidity, "feed_intake_g": feed_per_bird,
            "body_weight_g": ml_weight, "fcr": estimated_fcr
        }])
        prob = mortality_model.predict_proba(mfeats)[0]
        mort_pct = round(float(prob[1]) * 100, 1)
        mort_level = "Low" if mort_pct < 10 else "Medium" if mort_pct < 25 else "High"

        return jsonify({
            "predicted_weight_g": ml_weight, "confidence_low_g": confidence_low, "confidence_high_g": confidence_high,
            "estimated_fcr": estimated_fcr, "fcr_level": fcr_level, "mortality_pct": mort_pct,
            "mortality_level": mort_level, "phase": phase
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/predict/illness", methods=["POST"])
def predict_illness():
    d = request.json or {}
    droppings = d.get("droppings", "Normal")
    respiratory = d.get("respiratory", "Normal")
    behavior = d.get("behavior", "Normal")
    appearance = d.get("appearance", "Normal")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured on server."}), 500

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')

        prompt = f'''
You are an expert poultry veterinarian. A farmer has reported the following symptoms in their flock:
- Droppings/Feces: {droppings}
- Respiratory Signs: {respiratory}
- Behavior: {behavior}
- Physical Appearance: {appearance}

Based on these symptoms, please provide:
1. The most likely illness or condition.
2. A brief explanation of why this is the likely cause.
3. Immediate recommended actions the farmer should take.
4. When to call a professional vet.

Keep the response concise, practical, and formatted clearly. If the symptoms are all "Normal", inform them that the birds appear healthy but to continue monitoring.
'''

        response = model.generate_content(prompt)
        return jsonify({"prediction": response.text}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/model/metrics", methods=["GET"])
def get_metrics():
    if not model_metrics:
        return jsonify({"error": "Train the model first."}), 503
    return jsonify(model_metrics)

@app.route("/api/dataset/summary", methods=["GET"])
def dataset_summary():
    if not os.path.exists(DATA_PATH):
        return jsonify({"error":"Dataset not found."}), 404
    df = pd.read_csv(DATA_PATH)
    return jsonify({
        "total_records":       len(df),
        "total_flocks":        int(df["flock_id"].nunique()),
        "breed_distribution":  df["breed"].value_counts().to_dict(),
        "season_distribution": df["season"].value_counts().to_dict(),
        "avg_body_weight_g":   round(df["body_weight_g"].mean(),1),
        "avg_feed_intake_g":   round(df["feed_intake_g"].mean(),1),
        "avg_fcr":             round(df["fcr"].mean(),3),
        "mortality_rate_pct":  round(df["mortality_risk"].mean()*100,2),
    })

@app.route("/api/records/<int:user_id>", methods=["GET"])
def get_records(user_id):
    conn = get_db()
    rows = conn.execute("SELECT * FROM feed_records WHERE user_id=? ORDER BY created_at DESC LIMIT 50",(user_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/logs", methods=["POST"])
def save_performance_log():
    d = request.json or {}
    uid = d.get("user_id")
    pen = d.get("pen_name")
    log_date = d.get("log_date")
    feed = d.get("feed_kg")
    water = d.get("water_l")
    weight = d.get("avg_weight_g")
    deaths = d.get("deaths")
    temp = d.get("temp_c")
    humidity = d.get("humidity_pct")
    notes = d.get("notes", "")

    if not uid or not pen or not log_date:
        return jsonify({"error": "User ID, Pen Name, and Log Date are required."}), 400

    try:
        feed = float(feed)
        water = float(water)
        weight = float(weight)
        deaths = int(deaths)
        temp = float(temp)
        humidity = float(humidity)
    except (TypeError, ValueError):
        return jsonify({"error": "Numeric inputs must be valid decimal values."}), 400

    if feed < 0 or water < 0 or weight < 0 or deaths < 0:
        return jsonify({"error": "Feed, water, weight, and deaths cannot be negative values."}), 400
    if not (10 <= temp <= 50):
        return jsonify({"error": "Temperature must be between 10C and 50C."}), 400
    if not (10 <= humidity <= 100):
        return jsonify({"error": "Humidity must be between 10% and 100%."}), 400

    conn = get_db()
    conn.execute("""
        INSERT INTO performance_logs
        (user_id, pen_name, log_date, feed_kg, water_l, avg_weight_g, deaths, temp_c, humidity_pct, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (uid, pen, log_date, feed, water, weight, deaths, temp, humidity, notes, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({"message": "Daily performance record logged successfully."}), 201

@app.route("/api/logs/<int:user_id>", methods=["GET"])
def get_performance_logs(user_id):
    conn = get_db()
    rows = conn.execute("SELECT * FROM performance_logs WHERE user_id=? ORDER BY log_date DESC LIMIT 100", (user_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/vaccines/<int:user_id>", methods=["GET"])
def get_vaccine_schedule(user_id):
    conn = get_db()
    rows = conn.execute("SELECT * FROM vaccine_schedule WHERE user_id=? ORDER BY target_age ASC", (user_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/vaccines/add", methods=["POST"])
def add_vaccine():
    d = request.json or {}
    user_id = d.get("user_id")
    pen_name = d.get("pen_name")
    vaccine_name = d.get("vaccine_name")
    target_age = d.get("target_age")

    if not user_id or not pen_name or not vaccine_name or not target_age:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        target_age = int(target_age)
    except ValueError:
        return jsonify({"error": "Target age must be a number"}), 400

    conn = get_db()
    conn.execute(
        "INSERT INTO vaccine_schedule (user_id, pen_name, vaccine_name, target_age, status, created_at) VALUES (?, ?, ?, ?, 'Pending', ?)",
        (user_id, pen_name, vaccine_name, target_age, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Vaccine scheduled successfully"}), 201

@app.route("/api/vaccines/administer", methods=["POST"])
def administer_vaccine():
    d = request.json or {}
    vaccine_id = d.get("id")
    user_id = d.get("user_id")
    if not vaccine_id or not user_id:
        return jsonify({"error": "Vaccine ID and User ID are required."}), 400

    conn = get_db()
    v = conn.execute("SELECT * FROM vaccine_schedule WHERE id=? AND user_id=?", (vaccine_id, user_id)).fetchone()
    if not v:
        conn.close()
        return jsonify({"error": "Vaccine schedule item not found."}), 404

    admin_date = datetime.now().strftime("%Y-%m-%d")
    conn.execute("UPDATE vaccine_schedule SET status='Administered', administered_date=? WHERE id=? AND user_id=?", (admin_date, vaccine_id, user_id))

    # Also log a note in performance_logs so that the farmer has a record of it!
    log_note = f"VACCINE ADMINISTERED: {v['vaccine_name']} (Target Age: {v['target_age']} days)"
    conn.execute("""
        INSERT INTO performance_logs
        (user_id, pen_name, log_date, feed_kg, water_l, avg_weight_g, deaths, temp_c, humidity_pct, notes, created_at)
        VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?)
    """, (user_id, v["pen_name"], admin_date, log_note, datetime.now().isoformat()))

    conn.commit()
    conn.close()
    return jsonify({"message": "Vaccine marked as administered.", "administered_date": admin_date}), 200

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status":"ok","models_loaded": weight_model is not None,"load_error":load_error})

# ── SERVE FRONTEND ────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("frontend", "index.html")

@app.route("/<path:path>")
def serve_file(path):
    return send_from_directory("frontend", path)

if __name__ == "__main__":
    init_db()
    print("="*55)
    print("  Smart Poultry Feed Management System")
    print("="*55)
    if load_error:
        print(f"WARNING: Models not loaded: {load_error}")
    else:
        print("OK: Random Forest models loaded")
        print(f"OK: Weight model R2 = {model_metrics['weight_model']['r2']}")
        print(f"OK: Mortality model accuracy = {model_metrics['mortality_model']['accuracy']}")
    print(f"   Open: http://localhost:5000")
    print("="*55)
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
