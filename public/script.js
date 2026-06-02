// === ADI FIX MERAH V12 - Frontend Script ===
const socket = io();
const toast = document.getElementById('toast');

function showToast(msg, type='info') {
  toast.className = `toast toast-${type}`;
  toast.innerText = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// === Auth Token ===
function getToken() { return localStorage.getItem('token'); }
function setAuthHeader(headers={}) {
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

function apiFetch(url, options={}) {
  options.headers = setAuthHeader(options.headers || {});
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  return fetch(url, options).then(r => r.json());
}

// === Navigation ===
function showPage(pageId, element) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${pageId}`).classList.add('active');
  if (element) element.classList.add('active');
  document.querySelector('.app-content').scrollTop = 0;
}

function openTool(type) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${type}`).classList.add('active');
  document.querySelector('.app-content').scrollTop = 0;
}

function backToMenu() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-tools').classList.add('active');
}

// === WhatsApp ===
function connectWA() { socket.emit('connect-wa'); }

function getPairing() {
  const phone = document.getElementById('pairing-phone').value.trim();
  if (!phone) return showToast('Masukkan nomor telepon!', 'error');
  socket.emit('get-pairing', phone);
}

function disconnectWA() { socket.emit('disconnect-wa'); }

socket.on('wa-qr', (qrBase64) => {
  document.getElementById('qr-placeholder').style.display = 'none';
  const img = document.getElementById('qr-image');
  img.src = qrBase64;
  img.classList.remove('hidden');
  showToast('Scan QR code di WhatsApp Anda', 'info');
});

socket.on('wa-status', (data) => {
  const statusDiv = document.getElementById('header-wa-status');
  if (data.status === 'connected') {
    statusDiv.innerHTML = `<span class="dot"></span> ${data.number || 'ONLINE'}`;
    statusDiv.classList.remove('offline');
    statusDiv.classList.add('online');
    document.getElementById('qr-image').classList.add('hidden');
    document.getElementById('qr-placeholder').style.display = 'block';
    showToast('WhatsApp terhubung!', 'success');
  } else {
    statusDiv.innerHTML = `<span class="dot"></span> OFFLINE`;
    statusDiv.classList.remove('online');
    statusDiv.classList.add('offline');
  }
});

socket.on('pairing-code', (code) => {
  const resDiv = document.getElementById('pairing-result');
  resDiv.classList.remove('hidden');
  resDiv.innerText = code;
  showToast('Pairing code: ' + code, 'success');
});

socket.on('error-msg', (msg) => showToast(msg, 'error'));

// === Cek Functions ===
function startCek(type) {
  const inputMap = { bio: 'bio-input', nomor: 'nomor-input', repe: 'repe-input' };
  const inputId = inputMap[type];
  const raw = document.getElementById(inputId).value;
  const numbers = raw.split(/[\s,\n]+/).filter(Boolean);
  if (numbers.length === 0) return showToast('Masukkan nomor!', 'error');

  if (type === 'bio' || type === 'repe') {
    document.getElementById('bio-results').innerHTML = '';
    document.getElementById('repe-results').innerHTML = '';
    socket.emit('cek-bio', numbers);
  } else {
    document.getElementById('nomor-registered').innerHTML = '';
    document.getElementById('nomor-unregistered').innerHTML = '';
    socket.emit('cek-nomor', numbers);
  }
}

socket.on('bio-progress', (data) => {
  const percent = Math.round((data.current / data.total) * 100);
  ['bio', 'nomor'].forEach(prefix => {
    const textEl = document.getElementById(`${prefix}-progress-text`);
    const pctEl = document.getElementById(`${prefix}-progress-percent`);
    const fillEl = document.getElementById(`${prefix}-progress-fill`);
    if (textEl) textEl.innerText = `${data.current}/${data.total}`;
    if (pctEl) pctEl.innerText = `${percent}%`;
    if (fillEl) fillEl.style.width = `${percent}%`;
  });
});

socket.on('bio-result', (results) => {
  const bioContainer = document.getElementById('bio-results');
  const repeContainer = document.getElementById('repe-results');

  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-header">
        <span class="result-number">${r.number}</span>
        ${r.registered ? '<span class="badge badge-green"><i class="fas fa-check"></i> Aktif</span>' : '<span class="badge badge-red"><i class="fas fa-times"></i> Mati</span>'}
      </div>
      ${r.registered ? `
        <div class="result-meta">
          <i class="fas fa-comment-alt"></i> Bio: ${r.bio || 'Privasi'}<br>
          <i class="fas fa-building"></i> Meta Business: ${r.metaBusiness ? 'Ya' : 'Tidak'}
        </div>
        <div class="result-badges">
          <span class="badge badge-blue"><i class="fas fa-clock"></i> ${r.jamPercentage}% Ngejam</span>
          <span class="badge badge-purple"><i class="fas fa-star"></i> ${r.verifPercent}% Repe</span>
        </div>
      ` : ''}
    `;
    bioContainer.appendChild(card);

    if (r.repe && repeContainer) {
      const repeCard = document.createElement('div');
      repeCard.className = 'result-card';
      repeCard.style.borderColor = 'rgba(234, 179, 8, 0.3)';
      repeCard.innerHTML = `
        <div class="result-header">
          <span class="result-number">${r.number}</span>
          <span class="badge badge-yellow"><i class="fas fa-star"></i> ${r.verifPercent}%</span>
        </div>
      `;
      repeContainer.appendChild(repeCard);
    }
  });
});

socket.on('nomor-progress', (data) => {
  const percent = Math.round((data.current / data.total) * 100);
  const textEl = document.getElementById('nomor-progress-text');
  const pctEl = document.getElementById('nomor-progress-percent');
  const fillEl = document.getElementById('nomor-progress-fill');
  if (textEl) textEl.innerText = `${data.current}/${data.total}`;
  if (pctEl) pctEl.innerText = `${percent}%`;
  if (fillEl) fillEl.style.width = `${percent}%`;
});

socket.on('nomor-result', (data) => {
  const regEl = document.getElementById('nomor-registered');
  const unregEl = document.getElementById('nomor-unregistered');
  regEl.innerHTML = data.registered.map(n => `<div class="p-1 text-green-400"><i class="fas fa-check"></i> ${n}</div>`).join('');
  unregEl.innerHTML = data.notRegistered.map(n => `<div class="p-1 text-red-400"><i class="fas fa-times"></i> ${n}</div>`).join('');
});

// === Fix ===
function fixNomor() {
  const num = document.getElementById('fix-input').value.trim();
  if (!num) return showToast('Masukkan nomor!', 'error');
  socket.emit('fix-nomor', num);
  const statusEl = document.getElementById('fix-status');
  statusEl.classList.remove('hidden', 'alert-success', 'alert-danger');
  statusEl.classList.add('alert-info');
  statusEl.innerHTML = '<i class="fas fa-spinner spin"></i> Mengirim email...';
}

socket.on('fix-result', (data) => {
  const statusEl = document.getElementById('fix-status');
  statusEl.classList.remove('hidden', 'alert-info', 'alert-success', 'alert-danger');
  if (data.success) {
    statusEl.classList.add('alert-success');
    statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${data.message}`;
    showToast(data.message, 'success');
  } else {
    statusEl.classList.add('alert-danger');
    statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message}`;
    showToast(data.message, 'error');
  }
});

function generateBanding() {
  const num = document.getElementById('fix-input').value.replace(/\D/g, '');
  if (!num) return showToast('Masukkan nomor dulu!', 'error');
  const names = ["Luai", "Ahmad", "Rizky", "Budi", "Sari"];
  const name = names[Math.floor(Math.random() * names.length)];
  const msg = `Hello WhatsApp team, my name is ${name}. I'm having trouble registering my phone number (+${num}). Please help me resolve this issue.`;
  const textEl = document.getElementById('banding-text');
  textEl.classList.remove('hidden');
  textEl.innerText = `Kepada: android@support.whatsapp.com\nSubjek: Appeal Issue\n\n${msg}`;
}

// === File Upload ===
function uploadFile(input, targetId) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  apiFetch('/api/dashboard/upload-file', { method: 'POST', body: formData })
    .then(data => {
      if (data.success) {
        document.getElementById(targetId).value = data.numbers.join('\n');
        showToast(`${data.numbers.length} nomor di-load dari file`, 'success');
      } else {
        showToast(data.message || 'Gagal upload file', 'error');
      }
    })
    .catch(() => showToast('Gagal upload file', 'error'));
}

// === Settings ===
function loadSettings() {
  apiFetch('/api/auth/settings')
    .then(data => {
      if (data.success) {
        const s = data.settings;
        const el = (id) => document.getElementById(id);
        if (el('set-delay')) el('set-delay').value = s.check_delay || 1000;
        if (el('set-email')) el('set-email').value = s.email || '';
        if (el('set-smtp-host')) el('set-smtp-host').value = s.smtp_host || 'smtp.gmail.com';
        if (el('set-smtp-port')) el('set-smtp-port').value = s.smtp_port || 587;
      }
    })
    .catch(err => console.error('Load settings error:', err));
}

function saveSettings() {
  const data = {
    check_delay: parseInt(document.getElementById('set-delay').value) || 1000,
    email: document.getElementById('set-email').value,
    email_pass: document.getElementById('set-pass').value,
    smtp_host: document.getElementById('set-smtp-host').value || 'smtp.gmail.com',
    smtp_port: parseInt(document.getElementById('set-smtp-port').value) || 587,
    active_mt_id: window.currentActiveMtId || 0
  };
  apiFetch('/api/auth/settings', { method: 'POST', body: data })
    .then(data => {
      if (data.success) showToast('Settings disimpan!', 'success');
      else showToast(data.message || 'Gagal simpan', 'error');
    })
    .catch(() => showToast('Gagal simpan settings', 'error'));
}

function loadMt() {
  apiFetch('/api/dashboard/mt')
    .then(data => {
      if (data.success) {
        const list = document.getElementById('mt-list');
        list.innerHTML = '';
        data.mtTexts.forEach(mt => {
          const div = document.createElement('div');
          div.className = 'flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700 text-xs';
          div.innerHTML = `
            <div>
              <strong class="text-white">${mt.subject}</strong><br>
              <span class="text-muted">${mt.to_email || 'android@support.whatsapp.com'}</span>
            </div>
            <button class="badge badge-green cursor-pointer" onclick="setActiveMt(${mt.id})">
              <i class="fas fa-check"></i> Aktifkan
            </button>
          `;
          list.appendChild(div);
        });
      }
    })
    .catch(err => console.error('Load MT error:', err));
}

function addMt() {
  const data = {
    to_email: document.getElementById('mt-to').value || 'android@support.whatsapp.com',
    subject: document.getElementById('mt-subject').value,
    body: document.getElementById('mt-body').value
  };
  if (!data.subject || !data.body) return showToast('Isi subjek dan body!', 'error');
  apiFetch('/api/dashboard/mt', { method: 'POST', body: data })
    .then(data => {
      if (data.success) {
        showToast('Template ditambahkan!', 'success');
        loadMt();
      } else {
        showToast(data.message || 'Gagal', 'error');
      }
    })
    .catch(() => showToast('Gagal tambah MT', 'error'));
}

function setActiveMt(id) {
  apiFetch('/api/dashboard/mt/active', { method: 'POST', body: { id } })
    .then(data => {
      if (data.success) {
        window.currentActiveMtId = id;
        showToast('MT diaktifkan!', 'success');
      } else {
        showToast(data.message || 'Gagal', 'error');
      }
    })
    .catch(() => showToast('Gagal aktifkan MT', 'error'));
}

function logout() {
  localStorage.removeItem('token');
  showToast('Logged out', 'info');
  setTimeout(() => window.location.href = '/login', 500);
}

// === Init ===
loadSettings();
loadMt();

// Check auth
const token = getToken();
if (!token && window.location.pathname !== '/login') {
  window.location.href = '/login';
}

// Reconnect socket if disconnected
socket.on('connect_error', () => {
  console.warn('Socket connection error, retrying...');
});

socket.on('connect', () => {
  console.log('Socket connected');
});
