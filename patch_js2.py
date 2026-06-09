with open("FYP Again/frontend/static/scripts.js", "r") as f:
    content = f.read()

new_functions = """
function showAddVaccineModal() {
  document.getElementById('new-vac-name').value = '';
  document.getElementById('new-vac-age').value = '';
  document.getElementById('add-vaccine-modal').classList.remove('hidden');
}

function closeAddVaccineModal() {
  document.getElementById('add-vaccine-modal').classList.add('hidden');
}

async function submitAddVaccine() {
  const pen = document.getElementById('new-vac-pen').value;
  const name = document.getElementById('new-vac-name').value.trim();
  const age = document.getElementById('new-vac-age').value;

  if (!name || !age) {
    alert('Please provide vaccine name and target age.');
    return;
  }

  try {
    const res = await fetch('/api/vaccines/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        pen_name: pen,
        vaccine_name: name,
        target_age: parseInt(age)
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to schedule vaccine.');
    }

    closeAddVaccineModal();
    alert('Vaccine scheduled successfully!');
    await fetchVaccineSchedule();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}
"""

content = content + '\n' + new_functions

with open("FYP Again/frontend/static/scripts.js", "w") as f:
    f.write(content)
