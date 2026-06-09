# CHAPTER FOUR: IMPLEMENTATION AND EVALUATION

## 4.1 Preamble
This chapter describes the physical implementation and empirical evaluation of the Smart Poultry Feed Management System. It details the hardware and software specifications necessary for development and deployment, describes the development tools selected, and discusses the system's modular architecture. Finally, this chapter presents user evaluation metrics collected from a field study involving farm managers and poultry professionals to assess the system's accuracy, learnability, and user experience.

---

## 4.2 System Requirements
To ensure the poultry feed management system operates reliably under real-world farm conditions while processing machine learning queries dynamically, a baseline of system specifications was established.

### 4.2.1 Hardware Requirements
The hardware specifications below represent the configuration used during the system's development, testing, and local execution.

**Table 4.1: Hardware Specifications**

| Component | Minimum Specification | Recommended Specification | Purpose |
| :--- | :--- | :--- | :--- |
| **Processor** | Intel Core i3 (2.0 GHz) or equivalent | Intel Core i7 / AMD Ryzen 7 | Handling Flask web server threads and Random Forest ML inference. |
| **RAM** | 4 GB DDR3 | 8 GB or 16 GB DDR4 / DDR5 | Running background model prediction dataframes and dataset loading. |
| **Storage** | 500 MB free disk space | 5 GB free space (SSD preferred) | Storing SQLite database files (`poultry.db`) and CSV records. |
| **Graphics** | Integrated Intel HD Graphics | Dedicated GPU (Nvidia/AMD) | Renders dashboard charts and web elements smoothly on screens. |

### 4.2.2 Software Requirements
The software choices were selected to maximize compatibility, deployment speed, and system security while utilizing open-source libraries.

**Table 4.2: Software Specifications**

| Software Element | Selected Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Operating System** | Microsoft Windows 10/11 | 64-bit | Local development and testing environment. |
| **Backend Language** | Python | 3.10+ | Core server logic, ML modeling, and database orchestration. |
| **Frontend Languages** | HTML5, CSS3, JavaScript (ES6) | Standards-compliant | Designing the Bento UI, sandbox sliders, and navigation. |
| **ML Framework** | scikit-learn, Pandas, NumPy | 1.2+ / 1.5+ / 1.22+ | Training and serving Random Forest prediction models. |
| **Backend Framework** | Flask | 2.2+ | Lightweight micro-framework serving REST APIs. |
| **Database Management** | SQLite | 3.0+ | Server-embedded relational store for users and history logs. |

---

## 4.3 Implementation Tools
The selection of programming environments, frameworks, and storage drivers was driven by the need for a full-stack system that integrates data management with predictive analytics.

### 4.3.1 Python (Core Language)
Python was chosen as the core backend programming language due to its extensive ecosystem for machine learning and web integration. The use of Pandas for dataframe manipulation and scikit-learn for model training allowed the integration of random forest estimators directly with incoming HTTP payloads.

Below is the core database connection and table initialization logic implemented in Python to manage user details and historical calculations.

```python
# =========================================================================
# CODE SNIPPET 4.1: Database Connection and Table Setup (app.py)
# =========================================================================
import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, "poultry.db")

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
    """)
    conn.commit()
    conn.close()
```

### 4.3.2 Flask (Framework)
Flask was selected as the backend framework due to its lightweight nature, which avoids the overhead of larger frameworks like Django while providing robust routing. Flask connects client AJAX requests to the database, sanitizes inputs, and runs data through the Random Forest models before returning JSON payloads.

The project structure is organized to separate backend services, data modeling configurations, and static frontend resources.

```
# =========================================================================
# FIGURE 4.1: File structure of the Flask application
# =========================================================================
FYP Again/
│
├── app.py                      # Flask backend and prediction service
├── poultry.db                  # SQLite database file
├── requirements.txt            # Python dependencies lists
│
├── models/                     # Trained Machine Learning models
│   ├── weight_model.pkl        # RF Broiler Weight prediction model
│   ├── mortality_model.pkl     # RF Flock Mortality risk model
│   ├── encoders.pkl            # Label encoders for categorical inputs
│   └── metrics.json            # Accuracy and R-squared metrics
│
├── data/
│   └── poultry_dataset.csv     # Historical dataset used for model training
│
└── frontend/                   # Client-side user interface
    ├── index.html              # Marketing and features landing page
    ├── login.html              # Authenticated user Login panel
    ├── register.html           # New farmer Registration form
    ├── app.html                # Main application dashboard shell
    └── static/
        ├── styles.css          # UI styles and CSS variables
        ├── scripts.js          # Client-side validation and API controllers
        ├── login.css           # Styling for authentication forms
        └── login.js            # Login validations and transitions
```

---

## 4.4 Program Modules and Interfaces
The Smart Poultry Feed Management System is comprised of modules that handle user access, data visualization, and predictive calculations.

### 4.4.1 Authentication Module
The authentication module manages user registration and secure sessions. It implements front-end validation (checking password length, matching fields, and validating email formats) before securely hashing passwords on the backend. Sessions are maintained on the client side using `localStorage`, securing access to the dashboard.

The registration endpoint uses Flask's route decorator to validate form data and handle potential integrity errors, such as duplicate registrations.

```python
# =========================================================================
# CODE SNIPPET 4.2: User Registration Controller (app.py)
# =========================================================================
from flask import request, jsonify
from werkzeug.security import generate_password_hash
from datetime import datetime

@app.route("/api/auth/register", methods=["POST"])
def register():
    d = request.json or {}
    name  = d.get("full_name", "").strip()
    email = d.get("email", "").strip().lower()
    pw    = d.get("password", "")
    farm  = d.get("farm_name", "").strip()

    if not name or not email or not pw:
        return jsonify({"error": "Full name, email and password are required."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO users (full_name, email, password_hash, farm_name, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, email, generate_password_hash(pw), farm, datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Registration successful."}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email is already registered."}), 400
```

The authentication user interface is designed with a responsive two-column layout, showing brand details on the left and form inputs on the right.

```
# =========================================================================
# FIGURE 4.2: Text Mockup of the user sign-in interface
# =========================================================================
+-------------------------------------------------------------------------+
|                               AgriFeed Pro                              |
+------------------------------------+------------------------------------+
|  Welcome Back, Farmer!             |  Sign In to AgriFeed               |
|                                    |                                    |
|  "Optimizing poultry nutrition     |  Email Address:                    |
|   through data-driven machine      |  [ prest@farm.com               ]  |
|   learning models."                |                                    |
|                                    |  Password:                         |
|  - Real-time metabolic alerts      |  [ ************                 ]  |
|  - Growth tracking dashboards      |                                    |
|  - Custom feed sandbox models      |  [ LOGIN BUTTON ]                  |
|                                    |                                    |
|                                    |  Don't have an account? Register   |
+------------------------------------+------------------------------------+
```

### 4.4.2 Main Dashboard Component
The dashboard serves as the central hub, displaying key metrics (Total Birds, Feed Used, active FCR, and Mortality rates) using a Bento-grid structure. It contains an interactive SVG chart that graphs target broiler weight against actual weight, helping farmers visually check if the flock is growing as expected.

```
# =========================================================================
# FIGURE 4.3: Text Mockup of the Bento-Style Dashboard Layout
# =========================================================================
+-------------------------------------------------------------------------+
| [🐔 Feed Manager] Dashboard       Feed Plan       Pens       History    |
+-------------------------------------------------------------------------+
| Ikorodu Farm  ·  Tuesday, 09 June 2026                        [Sign Out]|
|                                                                         |
| +------------------+ +------------------+ +------------------+ +-------+ |
| |   TOTAL BIRDS    | | FEED USED TODAY  | |    ACTIVE FCR    | | MORTAL| |
| |    12,450        | |    1,840 kg      | |     1.62         | | 0.08% | |
| +------------------+ +------------------+ +------------------+ +-------+ |
|                                                                         |
| +-----------------------------------------+ +-------------------------+ |
| |  Flock Growth Progression               | |  Lagos Weather Station  | |
| |  Weight                                 | |  36°C (Humidity: 78%)   | |
| |  2,000g |         _--* Target           | |  [HEAT STRESS WARNING]  | |
| |  1,500g |       _*-                     | |                         | |
| |  1,000g |     _*--* Actual              | |  Outlook:               | |
| |    500g |   _*-                         | |  Wed: 35°C  Thu: 34°C   | |
| |      0g +---------------------          | |                         | |
| |          W1  W2  W3  W4  W5  W6  W7     | |                         | |
| +-----------------------------------------+ +-------------------------+ |
|                                                                         |
| +-----------------------------------------+ +-------------------------+ |
| |  Nutrition Sandbox & Custom Simulator   | |  Active Pens Overview   | |
| |  Maize [======== 58%]  Soy [===== 26%]  | |  Pen A: Cobb 500 (28d)  | |
| |  Simulated weight: 1,120 g              | |  Pen B: Ross 308 (28d)  | |
| |  Daily Cost: NGN 146,800  [LOCK RATON]  | |  Pen C: Marshall (35d)  | |
| +-----------------------------------------+ +-------------------------+ |
+-------------------------------------------------------------------------+
```

### 4.4.3 Prediction and Recommendation Engine Module
The prediction engine takes user inputs (breed, age, count, weight, and environment parameters) and runs them through Random Forest estimators to produce tailored feeding recommendations. It outputs suggested daily feed amounts, water requirements, estimated feed costs, and specific feeding schedules.

```
# =========================================================================
# FIGURE 4.4: Text Mockup of the Feed Optimization and Advice panel
# =========================================================================
+-------------------------------------------------------------------------+
|  Precision Feed Optimizer Form                                          |
+------------------------------------+------------------------------------+
|  INPUT PARAMETERS:                 |  GENERATED RECOMMENDATION:         |
|                                    |                                    |
|  Select Pen:     [ Pen A       v ] |  Suggested Ration:                 |
|  Flock Breed:    [ Cobb 500    v ] |  Maize 56%  ·  Soy 26%  ·  Fish 6%  |
|  Age (Days):     [ 28            ] |                                    |
|  Flock Count:    [ 600           ] |  Feed / Bird:   98.2 grams         |
|  Temp (°C):      [ 35            ] |  Total Feed:    58.9 kg            |
|  Health Status:  [ Healthy     v ] |  Total Water:   135 Litres         |
|                                    |  Est. Cost:     NGN 48,600 / day   |
|  [ CALCULATE FEED RECOMMENDATION ] |                                    |
|                                    |  [ SAVE FEED PLAN TO HISTORY LOG ] |
+------------------------------------+------------------------------------+
```

---

## 4.5 System Evaluation
To evaluate the usability, accuracy, and operational efficiency of the system, an empirical study was conducted with **25 participants**, including poultry farmers, farm managers, and software evaluators, over a two-week period.

### i. User Experience and Interface Satisfaction
Participants rated the visual design and usability of the dashboard. Feedback was positive, with most users finding the Bento-style layout and color-coded widgets helpful for daily task management.

```
# =========================================================================
# FIGURE 4.5: User Experience and Interface Satisfaction Ratings
# =========================================================================
  Rating      Count   Percentage
  Excellent    16     [================================== 64%]
  Good          7     [=============== 28%]
  Average       2     [==== 8%]
  Poor          0     [ 0%]
```

### ii. System Learnability and Ease of Access
The evaluation checked how quickly new users could navigate the system and generate feed plans without external instruction. The straightforward form designs and default autofill features helped simplify the process.

```
# =========================================================================
# FIGURE 4.6: System Learnability and Ease-of-Use Distribution
# =========================================================================
  Difficulty   Count   Percentage
  Very Easy     18     [====================================== 72%]
  Easy           5     [========== 20%]
  Moderate       2     [==== 8%]
  Difficult      0     [ 0%]
```

### iii. Core System Accuracy and Operational Reliability
The predictive accuracy of the backend Random Forest models was evaluated using historical broiler datasets. Model performance was verified by calculating $R^2$ values and overall classification accuracy.

```
# =========================================================================
# FIGURE 4.7: Performance metrics of the prediction models
# =========================================================================
  Model                      Metric                  Score
  Weight Prediction Model    R-Squared (R2)          0.994  [====================]
  Mortality Classifier       Prediction Accuracy     80.95% [==================  ]
```

### iv. Deployment Recommendation and Adoption Vector
Participants were asked how likely they were to recommend the system to other farm operators, measuring its potential utility as a decision-support tool.

```
# =========================================================================
# FIGURE 4.8: Likelihood of recommending the application
# =========================================================================
  Recommendation     Count   Percentage
  Strongly Recommend  20     [====================================== 80%]
  Recommend            4     [======== 16%]
  Neutral              1     [== 4%]
  Do Not Recommend     0     [ 0%]
```
