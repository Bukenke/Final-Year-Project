with open("FYP Again/frontend/app.html", "r") as f:
    content = f.read()

# Replace vaccine card header to add button
old_header = """<div class="card data-card" id="vaccine-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="card-title" style="margin-bottom:0;border-bottom:none">Vaccine Countdown</div>
        <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px">vaccines</span>
      </div>"""

new_header = """<div class="card data-card" id="vaccine-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="card-title" style="margin-bottom:0;border-bottom:none;display:flex;align-items:center;gap:8px">
          Vaccine Countdown <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px">vaccines</span>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" onclick="showAddVaccineModal()" style="padding:2px 8px;font-size:11px;">+ Add Vaccine</button>
      </div>"""

content = content.replace(old_header, new_header)

with open("FYP Again/frontend/app.html", "w") as f:
    f.write(content)
