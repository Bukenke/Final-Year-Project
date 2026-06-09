with open("FYP Again/frontend/app.html", "r") as f:
    content = f.read()

modal_html = """
  <!-- Float Modal: Add Vaccine -->
  <div id="add-vaccine-modal" class="card hidden" style="border: 2px solid var(--primary); background: var(--surface); position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; width: 90%; max-width: 400px; box-shadow: var(--shadow);">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-soft); padding-bottom: 8px; margin-bottom: 16px;">
      <h3 style="font-weight: 800; color: var(--primary-strong);">Schedule Vaccine</h3>
      <button type="button" onclick="closeAddVaccineModal()" class="icon-btn" style="border: none; background: transparent; cursor: pointer;"><span class="material-symbols-outlined">close</span></button>
    </div>

    <div class="field mb-md"><label>Pen Name</label>
      <select id="new-vac-pen">
        <option value="Pen A">Pen A</option>
        <option value="Pen B">Pen B</option>
        <option value="Pen C">Pen C</option>
        <option value="Pen D">Pen D</option>
      </select>
    </div>
    <div class="field mb-md"><label>Vaccine Name</label><input type="text" id="new-vac-name" placeholder="e.g. Fowl Pox Vaccine"></div>
    <div class="field mb-md"><label>Target Age (days)</label><input type="number" id="new-vac-age" placeholder="e.g. 35"></div>

    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:16px">
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeAddVaccineModal()">Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="submitAddVaccine()">Schedule</button>
    </div>
  </div>
"""

# Insert modal before the edit-pen-modal
content = content.replace(
    '<!-- Float Modal: Edit Pen Details -->',
    modal_html + '\n  <!-- Float Modal: Edit Pen Details -->'
)

with open("FYP Again/frontend/app.html", "w") as f:
    f.write(content)
