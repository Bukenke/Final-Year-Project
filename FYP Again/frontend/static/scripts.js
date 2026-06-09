// AgriFeed Pro Dashboard Core Logic & Backend Integration

const PAGE_TITLES = {
  dashboard: { title: 'AgriFeed Pro', sub: 'My Farm' },
  predict: { title: 'AgriFeed Pro', sub: 'Feed Optimization Plan' },
  flock: { title: 'AgriFeed Pro', sub: 'My Pens' },
  records: { title: 'AgriFeed Pro', sub: 'Logs & History' },
  mlpredict: { title: 'AgriFeed Pro', sub: 'Growth Predictor' },
  analytics: { title: 'AgriFeed Pro', sub: 'Analytics & Risk Insights' },
};

// Global authentication check and profile loader
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Session verification
  const userData = localStorage.getItem('user');
  if (!userData) {
    // Not authenticated, redirect to login page
    window.location.href = 'login.html';
    return;
  }
  
  currentUser = JSON.parse(userData);

  // 2. Apply user profile details to page elements
  const topbarSub = document.getElementById('topbar-sub');
  const sidebarSub = document.querySelector('.sidebar p');
  const heroFarmTitle = document.querySelector('.dashboard-hero h1');
  
  if (topbarSub) topbarSub.textContent = currentUser.farm_name || 'My Farm';
  if (sidebarSub) sidebarSub.textContent = currentUser.full_name || 'Manager';
  if (heroFarmTitle) heroFarmTitle.textContent = currentUser.farm_name || 'My Farm';

  // 3. Render date line
  const line = document.getElementById('farm-date-line');
  if (line) {
    const d = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    line.textContent = `${d} · ${currentUser.farm_name || 'Lagos'}`;
  }

  // 4. Fetch and render actual history records from database
  fetchSavedRecords();
  fetchDailyLogs();
  fetchVaccineSchedule();
});

// ── AUTHENTICATION MANAGEMENT ─────────────────────────────────────────────

function handleLogout() {
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// ── NAVIGATION MANAGEMENT ──────────────────────────────────────────────────

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-' + id)?.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  const page = id;
  document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach((b) => {
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
  });

  if (btn && btn.classList?.contains('nav-btn')) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }

  const meta = PAGE_TITLES[id];
  if (meta) {
    const t = document.getElementById('topbar-title');
    const s = document.getElementById('topbar-sub');
    if (t) t.textContent = meta.title;
    if (s && id !== 'dashboard') {
      s.textContent = meta.sub;
    } else if (s && id === 'dashboard') {
      s.textContent = currentUser ? currentUser.farm_name : 'My Farm';
    }
  }

  if (id === 'analytics') {
    renderAnalyticsCharts();
  } else if (id === 'records' || id === 'logging') {
    onLogPenChange();
  } else if (id === 'mlpredict') {
    // Defaults initialized on page switch
  }

  if (window.innerWidth < 900) {
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goFeedPlan() {
  const btn = document.querySelector('.nav-btn[data-page="predict"]');
  showPage('predict', btn);
}

function goRecords() {
  const btn = document.querySelector('.nav-btn[data-page="records"]');
  showPage('records', btn);
}

function toggleHidden(id) {
  document.getElementById(id)?.classList.toggle('hidden');
}

function showEl(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    el.style.display = '';
  }
}

function hideEl(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
    el.style.display = 'none';
  }
}

// ── RATION CALCULATION & API INTEGRATION ──────────────────────────────────

function collectFormData() {
  return {
    breed: document.getElementById('p-breed').value,
    type: document.getElementById('p-type').value,
    age_days: Number(document.getElementById('p-age').value),
    bird_count: Number(document.getElementById('p-count').value),
    weight_g: Number(document.getElementById('p-weight').value),
    current_feed_g: Number(document.getElementById('p-current-feed')?.value || 0),
    health: document.getElementById('p-health').value,
    phase: document.getElementById('p-phase').value,
    temperature: Number(document.getElementById('p-temp').value),
    humidity: Number(document.getElementById('p-humidity').value),
    season: document.getElementById('p-season').value,
    observation: document.getElementById('p-obs').value,
    feeds: [...document.getElementById('p-feeds').selectedOptions].map((o) => o.value),
  };
}

function renderPlan(plan, count, temp) {
  const iconMap = { warn: '!', ok: '✓', info: 'i', danger: '!' };

  document.getElementById('res-tips').innerHTML = (plan.tips || []).map((t) => {
    const kind =
      t.icon === 'danger' ? 'danger' : t.icon === 'warn' ? 'warn' : t.icon === 'ok' ? 'success' : 'info';
    const text = typeof t === 'string' ? t : t.text;
    const icon = typeof t === 'string' ? 'i' : iconMap[t.icon] || 'i';
    return `
      <div class="alert alert-${kind}">
        <div class="alert-icon">${icon}</div>
        <div>${text}</div>
      </div>`;
  }).join('');

  const ration = plan.ration || [];
  document.getElementById('res-ration').innerHTML = ration.length
    ? ration.map((r) => `
      <div class="result-row" style="display:flex;justify-content:between;margin-bottom:8px">
        <div><div class="result-label" style="font-weight:700">${r.ingredient}</div><div class="result-sub" style="font-size:12px;color:var(--text-muted)">${r.note || ''} · ${r.percent || 0}%</div></div>
        <div class="result-val" style="margin-left:auto;font-weight:700">${parseFloat(r.gPerBird || 0).toFixed(1)} g</div>
      </div>`).join('')
    : `<div class="result-row" style="display:flex;justify-content:between"><div class="result-label">Suggested amount</div><div class="result-val" style="margin-left:auto;font-weight:700">${plan.ration_g_per_bird || plan.grams_per_bird || '—'} g</div></div>`;

  const totalKg = plan.totalFeedKg ?? plan.total_feed_kg ?? 0;
  const water = plan.waterMlPerBird ?? 0;
  const money = (value) => Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const metricRows = [
    plan.recommendedFeedType ? ['Feed type', plan.recommendedFeedType] : null,
    plan.rationCostPerKgNgn ? ['Ration cost', `NGN ${money(plan.rationCostPerKgNgn)} / kg`] : null,
    plan.dailyFeedCostNgn ? ['Est. daily feed cost', `NGN ${money(plan.dailyFeedCostNgn)}`] : null,
    plan.mlPredictedWeightG ? ['Predicted weight', `${Number(plan.mlPredictedWeightG).toFixed(0)} g`] : null,
    plan.expectedGainG !== null && plan.expectedGainG !== undefined ? ['Expected gain', `${Number(plan.expectedGainG).toFixed(0)} g`] : null,
    plan.estimatedFcr ? ['Estimated FCR', `${Number(plan.estimatedFcr).toFixed(2)} (${plan.fcrLevel || 'Watch'})`] : null,
    plan.mortalityPct !== null && plan.mortalityPct !== undefined ? ['Mortality risk', `${plan.mortalityLevel || 'Unknown'} (${Number(plan.mortalityPct).toFixed(1)}%)`] : null,
  ].filter(Boolean);
  document.getElementById('res-herd').innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;margin-top:16px;border-top:1px solid var(--border-soft);padding-top:12px">TOTAL FOR ${count} BIRDS</div>
    <div class="result-row" style="display:flex;justify-content:between;margin-bottom:4px"><div class="result-label">Total feed</div><div class="result-val" style="margin-left:auto;font-weight:700">${parseFloat(totalKg).toFixed(1)} kg</div></div>
    ${water ? `<div class="result-row" style="display:flex;justify-content:between;margin-bottom:4px"><div class="result-label">Water</div><div class="result-val" style="margin-left:auto;font-weight:700">${(water * count / 1000).toFixed(0)} L</div></div>` : ''}
    ${metricRows.map(([label, value]) => `<div class="result-row" style="display:flex;justify-content:between;margin-bottom:4px"><div class="result-label">${label}</div><div class="result-val" style="margin-left:auto;font-weight:700;text-align:right">${value}</div></div>`).join('')}`;

  const schedule = plan.schedule || [];
  document.getElementById('res-schedule').innerHTML = schedule.map((s) => {
    if (typeof s === 'string') {
      return `<div class="schedule-block" style="margin-bottom:12px"><div class="schedule-time" style="font-weight:700;color:var(--primary)">${s}</div></div>`;
    }
    return `<div class="schedule-block" style="margin-bottom:12px"><div class="schedule-time" style="font-weight:700;color:var(--primary)">${s.time}</div><div style="font-size:13px;color:var(--text-sec)">${s.action}</div></div>`;
  }).join('');

  const alertCard = document.getElementById('res-alert-card');
  const vet = plan.vetAlert || plan.alert;
  if (vet) {
    alertCard.classList.remove('hidden');
    alertCard.style.display = 'block';
    document.getElementById('res-alert').innerHTML = `<div class="alert alert-danger"><div class="alert-icon">!</div><div>${vet}</div></div>`;
  } else {
    alertCard.classList.add('hidden');
    alertCard.style.display = 'none';
  }

  document.getElementById('pred-result').style.display = 'block';
}

async function getAdviceFromBackend(payload) {
  const backendPayload = {
    user_id: currentUser ? currentUser.id : null,
    breed: payload.breed.split(' (')[0],
    age_days: payload.age_days,
    flock_size: payload.bird_count,
    temperature_c: payload.temperature,
    humidity_pct: payload.humidity,
    current_weight_g: payload.weight_g,
    current_feed_g: payload.current_feed_g,
    observation: payload.observation,
    season: mapSeason(payload.season),
    health_status: mapHealthStatus(payload.health),
  };

  const res = await fetch('/api/recommend/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backendPayload),
  });
  if (!res.ok) throw new Error('Server could not build a plan. Try again.');
  const data = await res.json();
  const tips = (data.tips || []).map((tip) => (
    typeof tip === 'string' ? { icon: 'info', text: tip } : tip
  ));
  const alert = Array.isArray(data.alerts) ? data.alerts.join(' ') : data.alerts;
  return {
    tips: tips.length ? tips : [{ icon: 'ok', text: data.advice || 'Follow the ration below.' }],
    ration: data.ration || [],
    ration_g_per_bird: data.feed_per_bird_g,
    totalFeedKg: data.total_feed_kg,
    waterMlPerBird: data.water_per_bird_ml,
    recommendedFeedType: data.recommended_feed_type,
    estimatedFcr: data.estimated_fcr,
    fcrLevel: data.fcr_level,
    expectedGainG: data.expected_gain_g,
    rationCostPerKgNgn: data.ration_cost_per_kg_ngn,
    dailyFeedCostNgn: data.daily_feed_cost_ngn,
    mlPredictedWeightG: data.ml_predicted_weight_g,
    mortalityPct: data.mortality_pct,
    mortalityLevel: data.mortality_level,
    schedule: data.schedule || [],
    vetAlert: alert,
  };
}

function mapHealthStatus(health) {
  if (health === 'Recovering from illness') return 'Recovering';
  if (health === 'After vaccination') return 'Post-Vaccination';
  if (health === 'Low appetite') return 'Mild Stress';
  return 'Healthy';
}

function mapSeason(season) {
  if (season === 'Dry / Harmattan') return 'Dry/Harmattan';
  if (season === 'Early rainy season') return 'Early Rainy';
  if (season === 'Peak rainy season') return 'Peak Rainy';
  if (season === 'Late rainy season') return 'Late Rainy';
  return season;
}

async function getAdvice() {
  const payload = collectFormData();

  document.getElementById('pred-result').style.display = 'none';
  document.getElementById('pred-loading').style.display = 'block';

  try {
    const plan = await getAdviceFromBackend(payload);
    renderPlan(plan, payload.bird_count, payload.temperature);
    window._lastPlan = { plan, count: payload.bird_count, temp: payload.temperature };
    
    // Automatically refresh history in background
    setTimeout(fetchSavedRecords, 500);
  } catch (e) {
    document.getElementById('res-tips').innerHTML = `
      <div class="alert alert-danger">
        <div class="alert-icon">!</div>
        <div><strong>Could not get a plan:</strong> ${e.message}</div>
      </div>`;
    document.getElementById('pred-result').style.display = 'block';
  }

  document.getElementById('pred-loading').style.display = 'none';
}

// ── SAVE & FETCH RECORDS ──────────────────────────────────────────────────

function saveRecord() {
  if (!window._lastPlan) return;
  alert('Your feed calculation is saved automatically to the cloud under your profile!');
}

async function fetchSavedRecords() {
  if (!currentUser || !currentUser.id) return;
  
  try {
    const response = await fetch(`/api/records/${currentUser.id}`);
    if (!response.ok) return;
    const records = await response.json();
    renderRecords(records);
  } catch (err) {
    console.error('Error fetching history:', err);
  }
}

function renderRecords(records) {
  window.SAVED_RECORDS = records;
  const tbody = document.getElementById('records-tbody');
  if (!tbody) return;
  
  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No feed history found. Run a new feed plan to start logging!</td></tr>`;
    return;
  }
  
  tbody.innerHTML = records.map((r, index) => {
    const date = new Date(r.created_at);
    const fmtDate = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    
    const isManual = r.is_manual || !r.feed_per_bird;
    const planText = isManual ? (r.breed || 'Grower mash') : `${r.breed || 'Flock'} Plan`;
    const feedText = isManual ? planText : `${planText} (${r.feed_per_bird}g per bird)`;
    const badgeHtml = isManual 
      ? `<span class="badge badge-gray">Note</span>`
      : `<span class="badge badge-info">Plan</span>`;
    
    return `
      <tr data-type="${isManual ? 'manual' : 'ai'}" onclick="showRecordDetail(${index})" style="cursor: pointer;" class="hover:bg-primary-soft/30 transition-colors">
        <td>${fmtDate}</td>
        <td>${r.pen_name || 'Pen A'}</td>
        <td>${r.flock_size || '—'}</td>
        <td>${feedText}</td>
        <td>${r.total_feed_kg || '—'} kg</td>
        <td>${r.temp || '—'}°C</td>
        <td>${badgeHtml}</td>
      </tr>
    `;
  }).join('');
}

// ── MY PENS MANAGEMENT ─────────────────────────────────────────────────────

function showAddPen() {
  const f = document.getElementById('add-pen-form');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    document.getElementById('new-pen-date').valueAsDate = new Date();
  }
}

function addPen() {
  const name = document.getElementById('new-pen-name').value || 'New Pen';
  const count = document.getElementById('new-pen-count').value || '—';
  const breed = document.getElementById('new-pen-breed').value || '—';
  const age = document.getElementById('new-pen-age').value || '1';
  const target = document.getElementById('new-pen-target').value || '2200';
  const tbody = document.getElementById('pen-tbody');
  
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${name}</td><td>${count}</td><td>${breed}</td><td>${age} d</td>
    <td>—</td><td>—</td><td>0%</td><td>${target} g</td>
    <td><span class="badge badge-gray">New</span></td>`;
  tbody.appendChild(row);
  document.getElementById('add-pen-form').classList.add('hidden');
}

// ── MANUAL LOGS AND FILTERING ──────────────────────────────────────────────

function filterRecords(type, btn) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#records-tbody tr').forEach((r) => {
    r.style.display = type === 'all' || r.dataset.type === type ? '' : 'none';
  });
}

function addManualRecord() {
  const f = document.getElementById('manual-form');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    document.getElementById('m-date').valueAsDate = new Date();
  }
}

function saveManual() {
  const date = document.getElementById('m-date').value || new Date().toISOString();
  const pen = document.getElementById('m-pen').value;
  const birds = document.getElementById('m-birds').value || '—';
  const feed = document.getElementById('m-feed').value || '—';
  const kg = document.getElementById('m-kg').value || '—';
  const temp = document.getElementById('m-temp').value || '—';
  const notes = document.getElementById('m-notes').value || '—';
  
  const manualRecord = {
    created_at: new Date(date).toISOString(),
    pen_name: pen,
    breed: feed,
    flock_size: birds,
    total_feed_kg: kg,
    temp: temp,
    notes: notes,
    is_manual: true
  };
  
  if (!window.SAVED_RECORDS) window.SAVED_RECORDS = [];
  window.SAVED_RECORDS.unshift(manualRecord);
  renderRecords(window.SAVED_RECORDS);
  
  document.getElementById('manual-form').classList.add('hidden');
}

// ── RECORD INTERACTIVE DETAILS VIEWER ──────────────────────────────────────

let _currentDetailRecordIndex = null;

function showRecordDetail(index) {
  const r = window.SAVED_RECORDS && window.SAVED_RECORDS[index];
  if (!r) return;
  
  _currentDetailRecordIndex = index;
  
  const date = new Date(r.created_at);
  const fmtDate = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  document.getElementById('det-date').textContent = fmtDate;
  document.getElementById('det-pen-title').textContent = `${r.pen_name || 'Pen Details'} - Feed Plan`;
  document.getElementById('det-pen-name').textContent = r.pen_name || 'Pen A';
  document.getElementById('det-breed').textContent = r.breed || 'Cobb 500';
  document.getElementById('det-flock-size').textContent = r.flock_size ? `${Number(r.flock_size).toLocaleString()} birds` : '—';
  document.getElementById('det-age').textContent = r.age_days ? `${r.age_days} days` : '—';
  document.getElementById('det-temp').textContent = r.temp ? `${r.temp}°C` : '—';
  document.getElementById('det-season').textContent = r.season || 'Dry / Harmattan';
  document.getElementById('det-health').textContent = r.health_status || r.health || 'Healthy';
  
  // Mortality Risk Badge
  const mortEl = document.getElementById('det-mortality');
  const risk = (r.mortality_risk || 'Low').trim().toLowerCase();
  if (risk === 'high') {
    mortEl.innerHTML = `<span class="badge badge-danger" style="background:var(--danger-soft);color:var(--danger);font-weight:700">High Risk</span>`;
  } else if (risk === 'medium' || risk === 'watch') {
    mortEl.innerHTML = `<span class="badge badge-warn" style="background:var(--warn-soft);color:var(--warn);font-weight:700">Medium Risk</span>`;
  } else {
    mortEl.innerHTML = `<span class="badge badge-green" style="background:var(--success-soft);color:var(--success);font-weight:700">Low Risk</span>`;
  }
  
  // Feeding Profile
  const isManual = r.is_manual || !r.feed_per_bird;
  const feedPerBirdVal = isManual ? '—' : `${r.feed_per_bird} g`;
  document.getElementById('det-feed-per-bird').textContent = feedPerBirdVal;
  document.getElementById('det-total-feed').textContent = `${r.total_feed_kg} kg`;
  
  // Ration mix or Notes
  const extraRationBox = document.getElementById('det-extra-ration');
  if (isManual) {
    extraRationBox.innerHTML = `
      <strong>Farmer Notes & Actions:</strong><br>
      <span id="det-ration-mix">${r.notes || 'No notes recorded.'}</span>
    `;
    document.getElementById('btn-reapply').style.display = 'none';
  } else {
    // Standard feed recommendation ration calculation representation
    let feedRationText = r.notes || '';
    if (!feedRationText) {
      // Generate dynamically based on age phase for premium presentation
      const age = r.age_days || 28;
      if (age < 14) {
        feedRationText = "Maize 55% + Soymeal 30% + Fish meal 10% + Bone meal 3.5% + Premix 1.5% (Starter Ration)";
      } else if (age < 28) {
        feedRationText = "Maize 60% + Soymeal 25% + Fish meal 8% + Bone meal 4% + Premix 3% (Grower Ration)";
      } else {
        feedRationText = "Maize 65% + Soymeal 20% + Fish meal 6% + Bone meal 5% + Premix 4% (Finisher Ration)";
      }
    }
    extraRationBox.innerHTML = `
      <strong>Recommended Ration Mix:</strong><br>
      <span id="det-ration-mix">${feedRationText}</span>
    `;
    document.getElementById('btn-reapply').style.display = 'inline-flex';
  }
  
  // Show modal overlay
  document.getElementById('record-detail-overlay').classList.add('active');
}

function closeRecordDetailModal(event) {
  // If event is provided and clicked outside the modal-card, close it
  if (event && event.target !== document.getElementById('record-detail-overlay')) return;
  document.getElementById('record-detail-overlay').classList.remove('active');
}

function reapplyFeedPlan() {
  if (_currentDetailRecordIndex === null) return;
  const r = window.SAVED_RECORDS[_currentDetailRecordIndex];
  if (!r) return;
  
  // Close modal
  closeRecordDetailModal();
  
  // Fill prediction form fields
  const breedSelect = document.getElementById('breed');
  if (breedSelect) breedSelect.value = r.breed || 'Cobb 500';
  
  const ageInput = document.getElementById('age');
  if (ageInput) ageInput.value = r.age_days || 28;
  
  const birdsInput = document.getElementById('birds');
  if (birdsInput) birdsInput.value = r.flock_size || 600;
  
  const tempInput = document.getElementById('temp');
  if (tempInput) tempInput.value = r.temp || 30;
  
  // Season map back
  const seasonSelect = document.getElementById('season');
  if (seasonSelect) {
    const s = r.season || 'Dry/Harmattan';
    if (s.includes('Dry')) seasonSelect.value = 'Dry / Harmattan';
    else if (s.includes('Early')) seasonSelect.value = 'Early rainy season';
    else if (s.includes('Peak')) seasonSelect.value = 'Peak rainy season';
    else if (s.includes('Late')) seasonSelect.value = 'Late rainy season';
    else seasonSelect.value = s;
  }
  
  // Health map back
  const healthSelect = document.getElementById('health');
  if (healthSelect) {
    const h = r.health || 'Healthy';
    if (h === 'Recovering') healthSelect.value = 'Recovering from illness';
    else if (h === 'Post-Vaccination') healthSelect.value = 'After vaccination';
    else if (h === 'Low appetite') healthSelect.value = 'Low appetite';
    else healthSelect.value = 'Healthy';
  }
  
  // Navigate to Feed page
  const feedNavBtn = document.querySelector('[data-page="predict"]');
  if (feedNavBtn) {
    showPage('predict', feedNavBtn);
  }
  
  // Auto trigger the calculation
  setTimeout(() => {
    getAdvice();
  }, 300);
}


// ── NUTRITION SANDBOX INTERACTIVE SIMULATOR ────────────────────────────────

function updateOverrideSim() {
  const mRange = document.getElementById('maizeRange');
  const sRange = document.getElementById('soyRange');
  const fRange = document.getElementById('fishRange');
  
  if (!mRange || !sRange || !fRange) return;
  
  const m = Number(mRange.value);
  const s = Number(sRange.value);
  const f = Number(fRange.value);
  
  // Update slider text labels
  document.getElementById('maizeVal').textContent = `${m}%`;
  document.getElementById('soyVal').textContent = `${s}%`;
  document.getElementById('fishVal').textContent = `${f}%`;
  
  // Calculate simulated weight based on crude protein (soy + fish) and energy (maize)
  // Base weight at day 28 is 1120g
  // Higher protein (ideal 20-22%) increases weight gain, too low or too high decreases it.
  const totalProteinRatio = (s * 0.44 + f * 0.65) / 100; // rough crude protein estimation
  const proteinFactor = 1.0 + (totalProteinRatio - 0.15) * 1.2;
  const energyFactor = 0.95 + (m / 100) * 0.1;
  
  const simulatedWeight = Math.round(1120 * proteinFactor * energyFactor);
  
  // Cost estimation: Maize is ₦600/kg, Soy is ₦1200/kg, Fish is ₦2500/kg
  const costPerKg = (m * 600 + s * 1200 + f * 2500) / 100;
  const flockSize = 12450;
  const feedPerBirdKg = 0.11; // 110g per bird
  const totalFeedNeededKg = flockSize * feedPerBirdKg;
  const dailyCost = Math.round(totalFeedNeededKg * costPerKg);
  
  document.getElementById('simWeight').textContent = `${simulatedWeight.toLocaleString()} g`;
  document.getElementById('simCost').textContent = `₦${dailyCost.toLocaleString()}`;
}

async function lockNutritionDecision() {
  const m = document.getElementById('maizeRange').value;
  const s = document.getElementById('soyRange').value;
  const f = document.getElementById('fishRange').value;
  const weight = document.getElementById('simWeight').textContent;
  const cost = document.getElementById('simCost').textContent;
  
  if (!currentUser || !currentUser.id) return;
  
  const customRationDesc = `Override: Maize ${m}% + Soybean ${s}% + Fish ${f}% (${weight})`;
  
  // Save custom override to database records via API
  const backendPayload = {
    user_id: currentUser.id,
    pen_name: 'Pen A',
    breed: 'Custom Sim',
    age_days: 28,
    flock_size: 12450,
    temperature_c: 36,
    humidity_pct: 78,
    season: 'Dry/Harmattan',
    health_status: 'Healthy',
    feed_per_bird_g: 110,
    total_feed_kg: 1369.5,
  };
  
  try {
    const response = await fetch('/api/recommend/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendPayload),
    });
    
    if (response.ok) {
      alert(`Nutrition decision locked! Your custom formula (${customRationDesc}) has been recorded in your dashboard feed history.`);
      fetchSavedRecords();
    } else {
      throw new Error();
    }
  } catch (err) {
    // Local fallback if server isn't responsive
    const tbody = document.getElementById('records-tbody');
    if (tbody) {
      const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const row = document.createElement('tr');
      row.setAttribute('data-type', 'ai');
      row.innerHTML = `
        <td>${today}</td>
        <td>Pen A</td>
        <td>12,450</td>
        <td>${customRationDesc}</td>
        <td>1,369.5 kg</td>
        <td>36°C</td>
        <td><span class="badge badge-info" style="background:#fef3c7;color:#b45309">Override</span></td>
      `;
      tbody.prepend(row);
      alert(`Decision locked! Recorded in your dashboard feed history.`);
    }
  }
}

// ── PEN EDITING & CUSTOM PEN FEEDING PLAN INTERACTIVE TRIGGERS ─────────────

// Keep track of active pens in memory to dynamically link feed profiles
const PENS_DATABASE = {
  'Pen A': { birds: 600, breed: 'Cobb 500', age: 28, target: 2200, weight: 1120, fcr: '1.72', deaths: '1.2%' },
  'Pen B': { birds: 620, breed: 'Ross 308', age: 28, target: 2200, weight: 1080, fcr: '1.88', deaths: '1.5%' },
  'Pen C': { birds: 580, breed: 'Marshall', age: 35, target: 2200, weight: 1140, fcr: '1.70', deaths: '0.9%' },
  'Pen D': { birds: 600, breed: 'Noiler', age: 42, target: 2000, weight: 1010, fcr: '2.04', deaths: '2.1%' }
};

function openEditPenModal(name, count, breed, age, target, weight = 1120, fcr = '1.72', deaths = '1.2%') {
  const modal = document.getElementById('edit-pen-modal');
  if (!modal) return;
  
  // Update form inputs
  document.getElementById('edit-pen-title').textContent = `Edit Details: ${name}`;
  document.getElementById('edit-pen-original-name').value = name;
  document.getElementById('edit-pen-name').value = name;
  document.getElementById('edit-pen-count').value = count;
  document.getElementById('edit-pen-breed').value = breed;
  document.getElementById('edit-pen-age').value = age;
  document.getElementById('edit-pen-weight').value = weight;
  document.getElementById('edit-pen-target').value = target;
  
  modal.classList.remove('hidden');
  modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeEditPenModal() {
  const modal = document.getElementById('edit-pen-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function savePenEdits() {
  const originalName = document.getElementById('edit-pen-original-name').value;
  const name = document.getElementById('edit-pen-name').value || originalName;
  const count = Number(document.getElementById('edit-pen-count').value) || 0;
  const breed = document.getElementById('edit-pen-breed').value || 'Unknown';
  const age = Number(document.getElementById('edit-pen-age').value) || 1;
  const weight = Number(document.getElementById('edit-pen-weight').value) || 100;
  const target = Number(document.getElementById('edit-pen-target').value) || 2000;
  
  // Calculate simulated FCR dynamically
  const simulatedFcr = (1.75 + (age * 0.005) - (weight / target * 0.1)).toFixed(2);
  const statusBadge = weight >= (target * (age/45)) ? '<span class="badge badge-green">On track</span>' : '<span class="badge badge-danger">Behind</span>';
  
  // Save changes to local database
  PENS_DATABASE[name] = {
    birds: count,
    breed: breed,
    age: age,
    target: target,
    weight: weight,
    fcr: simulatedFcr,
    deaths: PENS_DATABASE[originalName] ? PENS_DATABASE[originalName].deaths : '1.0%'
  };
  
  if (originalName !== name) {
    delete PENS_DATABASE[originalName];
  }

  // Update HTML active table row dynamically
  const tbody = document.getElementById('pen-tbody');
  if (tbody) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const matchedRow = rows.find(r => r.cells[0].textContent.trim() === originalName);
    
    if (matchedRow) {
      matchedRow.setAttribute('onclick', `openEditPenModal('${name}', ${count}, '${breed}', ${age}, ${target}, ${weight}, '${simulatedFcr}', '1.0%')`);
      matchedRow.innerHTML = `
        <td>Pen ${name.replace('Pen ', '')}</td>
        <td>${count}</td>
        <td>${breed}</td>
        <td>${age} d</td>
        <td>${weight.toLocaleString()} g</td>
        <td>${simulatedFcr}</td>
        <td>1.0%</td>
        <td>${target.toLocaleString()} g</td>
        <td>${statusBadge}</td>
      `;
    }
  }
  
  // Update options inside prediction selector dropdown
  updatePenDropdownOptions();
  
  closeEditPenModal();
  alert(`${name} details updated successfully!`);
}

function updatePenDropdownOptions() {
  const dropdown = document.getElementById('p-pen-select');
  if (!dropdown) return;
  
  dropdown.innerHTML = '<option value="">-- Select Pen to Autofill Profile --</option>' + 
    Object.keys(PENS_DATABASE).map(key => {
      const pen = PENS_DATABASE[key];
      return `<option value="${key}">${key} (${pen.birds} ${pen.breed}, ${pen.age} days)</option>`;
    }).join('');
}

// Redirects farmer from the Pen Details modal directly to the Feed Plan form
function calculateFeedForActivePen() {
  const name = document.getElementById('edit-pen-name').value;
  if (!name) return;
  
  closeEditPenModal();
  
  // Redirect to Predict Tab
  goFeedPlan();
  
  // Pre-select Pen inside selector dropdown and trigger pre-fill
  const select = document.getElementById('p-pen-select');
  if (select) {
    select.value = name;
    loadPenIntoFeedPlan(name);
  }
}

// Pre-populates the Feed Optimization form with clicked Pen properties
function loadPenIntoFeedPlan(penName) {
  if (!penName) return;
  
  const pen = PENS_DATABASE[penName];
  if (!pen) return;
  
  // Pre-fill Feed Plan form fields
  const breedField = document.getElementById('p-breed');
  const countField = document.getElementById('p-count');
  const ageField = document.getElementById('p-age');
  const weightField = document.getElementById('p-weight');
  const phaseField = document.getElementById('p-phase');
  
  if (countField) countField.value = pen.birds;
  if (ageField) ageField.value = pen.age;
  if (weightField) weightField.value = pen.weight;
  
  // Map breed values
  if (breedField) {
    const options = Array.from(breedField.options);
    const matchedOption = options.find(o => o.value.toLowerCase().includes(pen.breed.split(' ')[0].toLowerCase()));
    if (matchedOption) breedField.value = matchedOption.value;
  }
  
  // Calculate and map growth phase based on age
  if (phaseField) {
    if (pen.age <= 14) {
      phaseField.value = 'Starter (0-14 days)';
    } else if (pen.age <= 28) {
      phaseField.value = 'Grower (15-28 days)';
    } else {
      phaseField.value = 'Finisher (29-42 days)';
    }
  }
  
  // Save selected Pen name globally so when saved, it associates with this pen in history
  window._activeFeedPlanPenName = penName;
}

// ── DAILY LOGGING & ANALYTICS ORCHESTRATION ────────────────────────────────

let DAILY_LOGS_DATABASE = [];

async function fetchDailyLogs() {
  if (!currentUser || !currentUser.id) return;
  try {
    const res = await fetch(`/api/logs/${currentUser.id}`);
    if (!res.ok) return;
    DAILY_LOGS_DATABASE = await res.json();
    renderDailyLogsTable();
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-analytics') {
      renderAnalyticsCharts();
    }
  } catch (err) {
    console.error('Error fetching performance logs:', err);
  }
}

function renderDailyLogsTable() {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;
  
  if (DAILY_LOGS_DATABASE.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px">No daily performance records found. Complete the entry form above to log your first record!</td></tr>`;
    return;
  }
  
  tbody.innerHTML = DAILY_LOGS_DATABASE.map(log => {
    const fmtDate = new Date(log.log_date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    return `
      <tr>
        <td><strong>${fmtDate}</strong></td>
        <td><span style="font-weight:700;color:var(--primary)">${log.pen_name}</span></td>
        <td>${log.feed_kg} kg</td>
        <td>${log.water_l} L</td>
        <td>${log.avg_weight_g} g</td>
        <td>${log.deaths > 0 ? `<span style="color:var(--danger);font-weight:800">${log.deaths}</span>` : '0'}</td>
        <td>${log.temp_c}°C / ${log.humidity_pct}%</td>
      </tr>
    `;
  }).join('');
}

function onLogPenChange() {
  const penName = document.getElementById('log-pen-select').value;
  document.getElementById('log-date').valueAsDate = new Date();
  validateLogInputs();
}

function validateLogInputs() {
  const selectPen = document.getElementById('log-pen-select').value;
  const feedVal = Number(document.getElementById('log-feed-kg').value) || 0;
  const waterVal = Number(document.getElementById('log-water-l').value) || 0;
  const weightVal = Number(document.getElementById('log-weight').value) || 0;
  const deathsVal = Number(document.getElementById('log-deaths').value) || 0;
  const tempVal = Number(document.getElementById('log-temp').value) || 0;
  const humVal = Number(document.getElementById('log-humidity').value) || 0;

  const alertBox = document.getElementById('log-validation-alert');
  const alertMsg = document.getElementById('log-validation-msg');
  
  if (!alertBox || !alertMsg) return true;
  
  alertBox.classList.add('hidden');
  const warnings = [];
  const penInfo = PENS_DATABASE[selectPen];
  
  if (penInfo && deathsVal > penInfo.birds) {
    warnings.push(`CRITICAL: Deaths entered (${deathsVal}) exceeds current flock size of ${selectPen} (${penInfo.birds} birds).`);
  }

  if (feedVal > 0 && weightVal > 0) {
    const penSize = penInfo ? penInfo.birds : 500;
    const feedPerBirdG = (feedVal * 1000) / penSize;
    const estDailyFcr = (feedPerBirdG / (weightVal * 0.08 || 1)).toFixed(2);
    document.getElementById('live-fcr').textContent = estDailyFcr;
    
    if (estDailyFcr < 1.4) {
      document.getElementById('live-fcr-status').innerHTML = `<span class="badge badge-green">Highly Efficient</span>`;
    } else if (estDailyFcr < 2.0) {
      document.getElementById('live-fcr-status').innerHTML = `<span class="badge badge-green">Optimal</span>`;
    } else {
      document.getElementById('live-fcr-status').innerHTML = `<span class="badge badge-danger">Poor Efficiency</span>`;
      warnings.push(`Warning: High Daily FCR (${estDailyFcr}) indicates feed waste or growth lag.`);
    }
  } else {
    document.getElementById('live-fcr').textContent = '—';
    document.getElementById('live-fcr-status').textContent = 'Enter weight & feed values.';
  }

  if (feedVal > 0 && waterVal > 0) {
    const waterFeedRatio = (waterVal / feedVal).toFixed(2);
    document.getElementById('live-water-feed').textContent = waterFeedRatio;
    
    if (waterFeedRatio >= 1.8 && waterFeedRatio <= 2.6) {
      document.getElementById('live-water-status').innerHTML = `<span class="badge badge-green">Normal (Ideal)</span>`;
    } else if (waterFeedRatio > 2.6) {
      document.getElementById('live-water-status').innerHTML = `<span class="badge badge-warn">High Intake</span>`;
      if (waterFeedRatio > 3.0) {
        warnings.push(`BIOMETRIC DANGER: High water/feed ratio (${waterFeedRatio}). Severe heat stress or diarrhea outbreak risk.`);
      }
    } else {
      document.getElementById('live-water-status').innerHTML = `<span class="badge badge-danger">Dehydration</span>`;
      warnings.push(`BIOMETRIC RISK: Low water/feed ratio (${waterFeedRatio}). Dehydration or feed line obstruction.`);
    }
  } else {
    document.getElementById('live-water-feed').textContent = '—';
    document.getElementById('live-water-status').textContent = 'Ideal range is 2.0 - 2.5';
  }

  if (weightVal > 0 && penInfo) {
    const age = penInfo.age || 28;
    let targetWeight = 1200;
    if (age <= 7) targetWeight = 180;
    else if (age <= 14) targetWeight = 450;
    else if (age <= 21) targetWeight = 900;
    else if (age <= 28) targetWeight = 1400;
    else if (age <= 35) targetWeight = 1900;
    else targetWeight = 2400;

    const devPct = ((weightVal - targetWeight) / targetWeight) * 100;
    if (devPct < -20) {
      warnings.push(`GROWTH DEVIATION: Weight is ${Math.abs(devPct).toFixed(1)}% below benchmark (${targetWeight}g at age ${age}d). Possible stunt risk.`);
    } else if (devPct > 25) {
      warnings.push(`GROWTH EXCEEDED: Weight is ${devPct.toFixed(1)}% above target profile (${targetWeight}g). Monitor fat deposits.`);
    }
  }

  if (deathsVal > 0 && penInfo) {
    const dailyMortRisk = ((deathsVal / penInfo.birds) * 100).toFixed(2);
    document.getElementById('live-mort-pct').textContent = `${dailyMortRisk}%`;
    
    if (dailyMortRisk > 0.1) {
      document.getElementById('live-mort-status').innerHTML = `<span class="badge badge-danger">OUTBREAK RISK</span>`;
      warnings.push(`CRITICAL: Daily mortality rate is extremely high (${dailyMortRisk}%). Quarantine pen immediately.`);
    } else {
      document.getElementById('live-mort-status').innerHTML = `<span class="badge badge-warn">Moderate</span>`;
    }
  } else {
    document.getElementById('live-mort-pct').textContent = '0.00%';
    document.getElementById('live-mort-status').innerHTML = `<span class="badge badge-green">Healthy</span>`;
  }

  if (warnings.length > 0) {
    alertBox.classList.remove('hidden');
    alertMsg.innerHTML = warnings.map(w => `• ${w}`).join('<br>');
    return false;
  }
  
  return true;
}

async function submitDailyLog() {
  if (!validateLogInputs()) return;

  const payload = {
    user_id: currentUser.id,
    pen_name: document.getElementById('log-pen-select').value,
    log_date: document.getElementById('log-date').value,
    feed_kg: Number(document.getElementById('log-feed-kg').value),
    water_l: Number(document.getElementById('log-water-l').value),
    avg_weight_g: Number(document.getElementById('log-weight').value),
    deaths: Number(document.getElementById('log-deaths').value),
    temp_c: Number(document.getElementById('log-temp').value),
    humidity_pct: Number(document.getElementById('log-humidity').value),
    notes: document.getElementById('log-notes').value || ''
  };

  try {
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server rejected daily log entry.');
    }
    
    alert('Daily performance log recorded successfully!');
    resetLoggingForm();
    await fetchDailyLogs();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function resetLoggingForm() {
  document.getElementById('daily-log-form').reset();
  onLogPenChange();
}

function renderAnalyticsCharts() {
  const penSelectVal = document.getElementById('log-pen-select')?.value || 'Pen A';
  const logs = DAILY_LOGS_DATABASE.filter(l => l.pen_name === penSelectVal).reverse();
  
  const growthFeedEl = document.getElementById('chart-growth-feed');
  const profitEl = document.getElementById('chart-profitability');
  const fcrEl = document.getElementById('chart-fcr');
  
  if (!growthFeedEl || !profitEl || !fcrEl) return;
  
  if (logs.length === 0) {
    growthFeedEl.innerHTML = `<text x="250" y="100" text-anchor="middle" fill="var(--text-muted)" font-size="10">No logging records found for ${penSelectVal}. Add data to plot trends.</text>`;
    profitEl.innerHTML = `<text x="250" y="100" text-anchor="middle" fill="var(--text-muted)" font-size="10">No logs found. Add logs to view profitability.</text>`;
    fcrEl.innerHTML = `<text x="250" y="100" text-anchor="middle" fill="var(--text-muted)" font-size="10">No FCR data plotted.</text>`;
    return;
  }

  const maxWeight = Math.max(...logs.map(l => l.avg_weight_g), 1200);
  const maxFeed = Math.max(...logs.map(l => l.feed_kg), 100);
  
  const pointsWeight = logs.map((l, idx) => {
    const x = 50 + (420 * (idx / Math.max(logs.length - 1, 1)));
    const y = 170 - (130 * (l.avg_weight_g / maxWeight));
    return {x, y, val: l.avg_weight_g};
  });
  
  const pointsFeed = logs.map((l, idx) => {
    const x = 50 + (420 * (idx / Math.max(logs.length - 1, 1)));
    const y = 170 - (130 * (l.feed_kg / maxFeed));
    return {x, y, val: l.feed_kg};
  });

  const pathWeight = `M ${pointsWeight.map(p => `${p.x} ${p.y}`).join(' L ')}`;
  const pathFeed = `M ${pointsFeed.map(p => `${p.x} ${p.y}`).join(' L ')}`;

  const datesLabel = logs.map((l, idx) => {
    const x = 50 + (420 * (idx / Math.max(logs.length - 1, 1)));
    const dateObj = new Date(l.log_date);
    const dayFmt = dateObj.getDate() + '/' + (dateObj.getMonth() + 1);
    return `<text x="${x}" y="188" font-size="7" fill="var(--text-muted)" text-anchor="middle">${dayFmt}</text>`;
  }).join('');

  growthFeedEl.innerHTML = `
    <!-- Grid Lines -->
    <line x1="50" y1="40" x2="470" y2="40" stroke="var(--border-soft)" stroke-dasharray="4,4"/>
    <line x1="50" y1="105" x2="470" y2="105" stroke="var(--border-soft)" stroke-dasharray="4,4"/>
    <line x1="50" y1="170" x2="470" y2="170" stroke="var(--border)" stroke-width="1.5"/>
    
    <!-- Y-Axis labels -->
    <text x="40" y="44" font-size="7" font-weight="700" fill="var(--primary)" text-anchor="end">${Math.round(maxWeight)}g</text>
    <text x="40" y="109" font-size="7" font-weight="700" fill="var(--primary)" text-anchor="end">${Math.round(maxWeight/2)}g</text>
    <text x="40" y="174" font-size="7" font-weight="700" fill="var(--primary)" text-anchor="end">0g</text>

    <text x="480" y="44" font-size="7" font-weight="700" fill="var(--accent)" text-anchor="start">${Math.round(maxFeed)}kg</text>
    <text x="480" y="109" font-size="7" font-weight="700" fill="var(--accent)" text-anchor="start">${Math.round(maxFeed/2)}kg</text>
    
    <!-- Paths -->
    <path d="${pathWeight}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>
    <path d="${pathFeed}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="3,3" stroke-linecap="round"/>
    
    <!-- Dots for Weight -->
    ${pointsWeight.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--primary)" stroke="#fff" stroke-width="1"/>`).join('')}
    
    <!-- Dates -->
    ${datesLabel}
  `;

  const penCapacity = PENS_DATABASE[penSelectVal]?.birds || 600;
  let cumulativeFeedKg = 0;
  let cumulativeCostNgn = 0;

  const profitabilityLogs = logs.map((l) => {
    cumulativeFeedKg += l.feed_kg;
    cumulativeCostNgn += l.feed_kg * 750;
    const weightKg = l.avg_weight_g / 1000;
    const flockValueNgn = penCapacity * weightKg * 1800;
    return {
      date: l.log_date,
      cost: cumulativeCostNgn,
      value: flockValueNgn
    };
  });

  const maxValue = Math.max(...profitabilityLogs.map(p => Math.max(p.value, p.cost)), 100000);

  const pointsCost = profitabilityLogs.map((p, idx) => {
    const x = 50 + (420 * (idx / Math.max(profitabilityLogs.length - 1, 1)));
    const y = 170 - (130 * (p.cost / maxValue));
    return {x, y};
  });

  const pointsVal = profitabilityLogs.map((p, idx) => {
    const x = 50 + (420 * (idx / Math.max(profitabilityLogs.length - 1, 1)));
    const y = 170 - (130 * (p.value / maxValue));
    return {x, y};
  });

  const pathCost = `M 50 170 L ${pointsCost.map(p => `${p.x} ${p.y}`).join(' L ')} L ${pointsCost[pointsCost.length-1].x} 170 Z`;
  const pathVal = `M 50 170 L ${pointsVal.map(p => `${p.x} ${p.y}`).join(' L ')} L ${pointsVal[pointsVal.length-1].x} 170 Z`;

  const formatNgn = (val) => 'N' + (val / 1000).toFixed(0) + 'k';

  profitEl.innerHTML = `
    <!-- Grid Lines -->
    <line x1="50" y1="40" x2="470" y2="40" stroke="var(--border-soft)" stroke-dasharray="4,4"/>
    <line x1="50" y1="105" x2="470" y2="105" stroke="var(--border-soft)" stroke-dasharray="4,4"/>
    <line x1="50" y1="170" x2="470" y2="170" stroke="var(--border)" stroke-width="1.5"/>

    <!-- Y-Axis labels -->
    <text x="42" y="44" font-size="7" font-weight="700" fill="var(--text-muted)" text-anchor="end">${formatNgn(maxValue)}</text>
    <text x="42" y="109" font-size="7" font-weight="700" fill="var(--text-muted)" text-anchor="end">${formatNgn(maxValue/2)}</text>
    <text x="42" y="174" font-size="7" font-weight="700" fill="var(--text-muted)" text-anchor="end">N0</text>

    <!-- Area paths -->
    <path d="${pathVal}" fill="rgba(21,128,61,0.2)" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="${pathCost}" fill="rgba(194,65,12,0.15)" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"/>

    <!-- Dates -->
    ${datesLabel}
  `;

  let cumFeedG = 0;
  const pointsFcr = logs.map((l, idx) => {
    const penSize = PENS_DATABASE[l.pen_name]?.birds || 600;
    const dailyFeedPerBirdG = (l.feed_kg * 1000) / penSize;
    cumFeedG += dailyFeedPerBirdG;
    const fcr = (cumFeedG / Math.max(l.avg_weight_g - 40, 1)).toFixed(3);
    const x = 50 + (420 * (idx / Math.max(logs.length - 1, 1)));
    const y = 170 - (130 * (fcr / 3.0));
    return {x, y, fcr};
  });

  const pathFcr = `M ${pointsFcr.map(p => `${p.x} ${p.y}`).join(' L ')}`;
  const yTarget = 170 - (130 * (1.55 / 3.0));

  fcrEl.innerHTML = `
    <!-- Grid Lines -->
    <line x1="50" y1="40" x2="470" y2="40" stroke="var(--border-soft)" stroke-dasharray="4,4"/>
    <line x1="50" y1="105" x2="470" y2="105" stroke="var(--border-soft)" stroke-dasharray="4,4"/>
    <line x1="50" y1="170" x2="470" y2="170" stroke="var(--border)" stroke-width="1.5"/>

    <!-- Target Benchmark line -->
    <line x1="50" y1="${yTarget}" x2="470" y2="${yTarget}" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="6,4"/>
    <text x="460" y="${yTarget - 6}" font-size="7" font-weight="700" fill="var(--accent)" text-anchor="end">Target: 1.55</text>

    <!-- Y-Axis labels -->
    <text x="42" y="44" font-size="7" font-weight="700" fill="var(--text-muted)" text-anchor="end">3.00</text>
    <text x="42" y="105" font-size="7" font-weight="700" fill="var(--text-muted)" text-anchor="end">1.50</text>
    <text x="42" y="174" font-size="7" font-weight="700" fill="var(--text-muted)" text-anchor="end">0.00</text>

    <!-- FCR line path -->
    <path d="${pathFcr}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>
    
    <!-- Dots for FCR -->
    ${pointsFcr.map(p => `
      <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--primary)" stroke="#fff" stroke-width="1"/>
      <text x="${p.x}" y="${p.y - 8}" font-size="6" font-weight="700" fill="var(--primary)" text-anchor="middle">${p.fcr}</text>
    `).join('')}

    <!-- Dates -->
    ${datesLabel}
  `;

  renderRiskAlertsRoom(logs);
}

function renderRiskAlertsRoom(logs) {
  const container = document.getElementById('analytics-alerts-container');
  if (!container) return;

  const alerts = [];
  const latest = logs[0];
  
  if (latest) {
    const penSize = PENS_DATABASE[latest.pen_name]?.birds || 600;
    const dailyIntakePerBirdG = (latest.feed_kg * 1000) / penSize;
    const ageEst = latest.avg_weight_g < 400 ? 10 : latest.avg_weight_g < 800 ? 20 : 28;
    const baseTarget = base_feed(ageEst);

    if (dailyIntakePerBirdG > baseTarget * 1.25) {
      alerts.push({
        type: 'danger',
        msg: `OVERFEEDING HAZARD: Pen ${latest.pen_name} is consuming ${dailyIntakePerBirdG.toFixed(0)}g/bird, higher than standard benchmark (${baseTarget.toFixed(0)}g).`
      });
    } else if (dailyIntakePerBirdG < baseTarget * 0.75) {
      alerts.push({
        type: 'danger',
        msg: `UNDERFEEDING DANGER: Pen ${latest.pen_name} intake dropped to ${dailyIntakePerBirdG.toFixed(0)}g/bird (target: ${baseTarget}g).`
      });
    }

    if (latest.temp_c >= 35) {
      alerts.push({
        type: 'warn',
        msg: `SEVERE HEAT STRESS Alert: Ambient temperature is ${latest.temp_c}C in Pen ${latest.pen_name}. Stop midday feeding.`
      });
    }

    if (latest.deaths > 1) {
      alerts.push({
        type: 'danger',
        msg: `HEALTH ANOMALY: ${latest.deaths} deaths reported today in Pen ${latest.pen_name}. Quarantine listless birds.`
      });
    }
    
    if (latest.humidity_pct > 82) {
      alerts.push({
        type: 'warn',
        msg: `MYCOTOXIN RISK: Humidity level is ${latest.humidity_pct}%. Inspect feed troughs for moisture.`
      });
    }
  }

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="alert alert-success" style="padding: 10px; border-radius: 8px;">
        <div class="alert-icon">✓</div>
        <div>All active pens operational. No anomalies reported.</div>
      </div>
    `;
  } else {
    container.innerHTML = alerts.map(a => {
      const icon = a.type === 'danger' ? '!' : 'w';
      const cssClass = a.type === 'danger' ? 'alert-danger' : 'alert-warn';
      return `
        <div class="alert ${cssClass}" style="padding: 10px; border-radius: 8px;">
          <div class="alert-icon">${icon}</div>
          <div style="font-size: 11px; line-height: 1.4;">${a.msg}</div>
        </div>
      `;
    }).join('');
  }
}

async function runMlPrediction() {
  const payload = {
    breed: document.getElementById('ml-breed').value,
    age_days: Number(document.getElementById('ml-age').value),
    flock_size: Number(document.getElementById('ml-flock-size').value),
    temperature_c: Number(document.getElementById('ml-temp').value),
    humidity_pct: Number(document.getElementById('ml-humidity').value),
    feed_intake_g: Number(document.getElementById('ml-feed').value),
    water_intake_ml: Number(document.getElementById('ml-water').value),
    season: document.getElementById('ml-season').value,
    health_status: document.getElementById('ml-health').value
  };

  try {
    const res = await fetch('/api/predict/flock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Prediction calculation failed.');
    }
    const data = await res.json();
    
    document.getElementById('ml-res-weight').textContent = `${data.predicted_weight_g.toFixed(1)} g`;
    document.getElementById('ml-res-weight-range').textContent = `[${data.confidence_low_g.toFixed(1)} g - ${data.confidence_high_g.toFixed(1)} g]`;
    document.getElementById('ml-res-mort-pct').textContent = `${data.mortality_pct.toFixed(1)}%`;
    
    const mortLevelEl = document.getElementById('ml-res-mort-level');
    if (!mortLevelEl) return;
    
    if (data.mortality_level === 'High') {
      mortLevelEl.className = 'badge badge-danger';
      mortLevelEl.textContent = 'High Risk';
      mortLevelEl.style.background = 'var(--danger-soft)';
      mortLevelEl.style.color = 'var(--danger)';
    } else if (data.mortality_level === 'Medium') {
      mortLevelEl.className = 'badge badge-warn';
      mortLevelEl.textContent = 'Medium Risk';
      mortLevelEl.style.background = 'var(--warn-soft)';
      mortLevelEl.style.color = 'var(--warn)';
    } else {
      mortLevelEl.className = 'badge badge-green';
      mortLevelEl.textContent = 'Low Risk';
      mortLevelEl.style.background = 'var(--success-soft)';
      mortLevelEl.style.color = 'var(--success)';
    }

    document.getElementById('ml-res-fcr').textContent = data.estimated_fcr.toFixed(3);
    
    const fcrStatusEl = document.getElementById('ml-res-fcr-status');
    if (fcrStatusEl) {
      if (data.fcr_level === 'Efficient') {
        fcrStatusEl.innerHTML = `<span class="badge badge-green">Efficient</span>`;
      } else if (data.fcr_level === 'Watch') {
        fcrStatusEl.innerHTML = `<span class="badge badge-warn">Watch</span>`;
      } else {
        fcrStatusEl.innerHTML = `<span class="badge badge-danger">Poor</span>`;
      }
    }

    document.getElementById('ml-res-phase').textContent = `${data.phase} Phase`;

  } catch (err) {
    alert(`Prediction Error: ${err.message}`);
  }
}

// ── SIDEBAR NAV DRAWER TOGGLER ─────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (!sidebar) return;
  if (window.innerWidth < 900) {
    sidebar.classList.toggle('open');
    overlay?.classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

// ── VACCINATION COUNTDOWN SCHEDULER ─────────────────────────────────────────
let VACCINES_DATABASE = [];

async function fetchVaccineSchedule() {
  if (!currentUser || !currentUser.id) return;
  try {
    const res = await fetch(`/api/vaccines/${currentUser.id}`);
    if (!res.ok) return;
    VACCINES_DATABASE = await res.json();
    renderVaccineCountdown();
  } catch (err) {
    console.error('Error fetching vaccine schedule:', err);
  }
}

function renderVaccineCountdown() {
  const container = document.getElementById('vaccine-list-container');
  if (!container) return;

  const pendingVaccines = VACCINES_DATABASE.filter(v => v.status === 'Pending');

  if (pendingVaccines.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px;">
        <span class="material-symbols-outlined" style="font-size:32px;color:var(--success);margin-bottom:8px;">check_circle</span>
        <p>All vaccines administered!</p>
      </div>
    `;
    return;
  }

  pendingVaccines.sort((a, b) => {
    const ageA = PENS_DATABASE[a.pen_name]?.age || 0;
    const ageB = PENS_DATABASE[b.pen_name]?.age || 0;
    const daysLeftA = a.target_age - ageA;
    const daysLeftB = b.target_age - ageB;
    return daysLeftA - daysLeftB;
  });

  container.innerHTML = pendingVaccines.map(v => {
    const penAge = PENS_DATABASE[v.pen_name]?.age || 0;
    const daysLeft = v.target_age - penAge;
    
    let badgeClass = 'badge-green';
    let countdownText = '';
    
    if (daysLeft < 0) {
      badgeClass = 'badge-danger';
      countdownText = `Overdue ${Math.abs(daysLeft)}d`;
    } else if (daysLeft === 0) {
      badgeClass = 'badge-warn';
      countdownText = 'Due Today';
    } else {
      badgeClass = 'badge-info';
      countdownText = `in ${daysLeft}d`;
    }

    return `
      <div class="vaccine-item">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-sec);">${v.vaccine_name}</div>
          <div style="font-size:11px;color:var(--text-muted);">
            <span style="font-weight:700;color:var(--primary);">${v.pen_name}</span> · Target: ${v.target_age}d
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge ${badgeClass}" style="font-size:10px;font-weight:700;padding:2px 6px;">${countdownText}</span>
          <button type="button" class="btn btn-primary btn-xs" onclick="administerVaccine(${v.id})">
            Administer
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function administerVaccine(vaccineId) {
  if (!confirm('Mark this vaccine as administered? This will record a vaccine note in the performance log.')) return;
  try {
    const res = await fetch('/api/vaccines/administer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: vaccineId, user_id: currentUser.id })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to administer vaccine.');
    }
    alert('Vaccine marked as administered successfully!');
    await fetchVaccineSchedule();
    await fetchDailyLogs(); 
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}


