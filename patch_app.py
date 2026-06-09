import sys

with open("FYP Again/app.py", "r") as f:
    content = f.read()

new_route = """
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
"""

content = content.replace(
    '@app.route("/api/vaccines/administer", methods=["POST"])',
    new_route + '\n@app.route("/api/vaccines/administer", methods=["POST"])'
)

with open("FYP Again/app.py", "w") as f:
    f.write(content)
