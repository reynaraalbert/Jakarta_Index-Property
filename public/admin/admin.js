console.log("🚀 JKTProp Admin PRO V2.0.1 Loaded");
let districtsByCity = {};

async function loadLocations() {
    try {
        const response = await fetch('/api/locations');
        const locations = await response.json();
        districtsByCity = {};
        locations.forEach(loc => {
            if (!loc.city || !loc.district) return;
            const cleanCity = loc.city.trim().replace(/\s+/g, ' ');
            const cleanDistrict = loc.district.trim().replace(/\s+/g, ' ');
            const formattedCity = cleanCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            const formattedDistrict = cleanDistrict.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            
            if (!districtsByCity[formattedCity]) districtsByCity[formattedCity] = [];
            if (!districtsByCity[formattedCity].includes(formattedDistrict)) {
                districtsByCity[formattedCity].push(formattedDistrict);
            }
        });
        Object.keys(districtsByCity).forEach(city => districtsByCity[city].sort());
    } catch (e) { console.error('Failed to load locations:', e); }
}


// =============================================
// Chart instances
// =============================================
let cityChartInstance   = null;
let salesDonutInstance  = null;
let salesByCityInstance = null;
let rankingChartInstance = null;
let distChartInstance = null;
let currentSalesRange   = 'day';

// =============================================
// Sidebar / Navigation
// =============================================
const sectionTitles = {
  dashboard:   'Analytics Dashboard',
  properties:  'Kelola Properti',
  salesstatus: 'Status Penjualan',
  agents:      'Kelola Agen',
  export:      'Export Data'
};

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        const isOpen = sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('open', isOpen);
        document.body.classList.toggle('sidebar-open', isOpen);
    } else {
        document.querySelector('.admin-container').classList.toggle('collapsed');
    }
}

function closeSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('sidebar-open');
}

function showSection(sectionId, el) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

    const section = document.getElementById(sectionId + 'Section');
    if (section) section.classList.add('active');
    if (el) el.classList.add('active');

    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        headerTitle.innerText = sectionTitles[sectionId] || 'Admin Panel';
    }

    if (window.innerWidth <= 768) {
        closeSidebarMobile();
    }

    // Dynamic loads
    if (sectionId === 'dashboard')   loadStats();
    if (sectionId === 'properties')  loadProperties();
    if (sectionId === 'agents')      loadAgents();
    if (sectionId === 'salesstatus') loadSalesStatus();
    if (sectionId === 'export')      loadExportOptions();
}

// =============================================
// Dashboard Stats
// =============================================
async function loadStats() {
    try {
        const rangeSelector = document.getElementById('statsRange');
        if (!rangeSelector) return;
        const range = rangeSelector.value;
        const res   = await fetchJSON(`/api/dashboard-combined?range=${range}`);
        
        if (!res || !res.stats) {
            console.error('Data stats tidak valid:', res);
            return;
        }

        const data = res.stats;
        // Update Kartu Statistik
        if(document.getElementById('totalProps'))   document.getElementById('totalProps').textContent   = data.total || 0;
        if(document.getElementById('totalAgents'))  document.getElementById('totalAgents').textContent  = data.totalAgents || 0;
        if(document.getElementById('soldUnits'))    document.getElementById('soldUnits').textContent    = data.soldUnits || 0;
        if(document.getElementById('totalRevenue')) document.getElementById('totalRevenue').textContent = formatRp(data.revenue);

        // Update Grafik Kota (dengan proteksi error)
        try {
            const labels = (data.cityStats || []).map(s => s._id || 'Unknown');
            const counts = (data.cityStats || []).map(s => s.count);
            const ctx = document.getElementById('cityChart');
            if (ctx) {
                if (cityChartInstance) cityChartInstance.destroy();
                cityChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Jumlah Unit', data: counts, backgroundColor: '#2563eb', borderRadius: 6 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
                });
            }
        } catch (err) { console.warn('City chart failed:', err); }

        // Load Analitik (Market Trends)
        if (res.analytics) renderAnalytics(res.analytics);

    } catch (e) { 
        console.error('LoadStats failed:', e);
        // Fallback agar tidak kosong sama sekali
        if(document.getElementById('totalProps')) document.getElementById('totalProps').textContent = 'Error';
    }
}

function renderAnalytics(data) {
    try {
        // 1. Ranking Chart
        const rankingCtx = document.getElementById('rankingChart');
        if (rankingCtx && data.rankingKecamatan) {
            const top10 = data.rankingKecamatan.slice(0, 10);
            const rankLabels = top10.map(s => s._id);
            const rankPrices = top10.map(s => Math.round(s.avgPricePerM2));
            if (rankingChartInstance) rankingChartInstance.destroy();
            rankingChartInstance = new Chart(rankingCtx, {
                type: 'bar',
                data: { labels: rankLabels, datasets: [{ label: 'Harga/m²', data: rankPrices, backgroundColor: '#f59e0b', borderRadius: 4 }] },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
            });
        }

        // 2. Distribution Chart
        const distCtx = document.getElementById('distChart');
        if (distCtx && data.priceDistribution) {
            const distLabels = data.priceDistribution.map(b => b.label);
            const distCounts = data.priceDistribution.map(b => b.count);
            if (distChartInstance) distChartInstance.destroy();
            distChartInstance = new Chart(distCtx, {
                type: 'doughnut',
                data: { labels: distLabels, datasets: [{ data: distCounts, backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444'] }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // 3. Comparison Table
        const tbody = document.getElementById('comparisonTableBody');
        if (tbody && data.rankingKecamatan) {
            tbody.innerHTML = '';
            data.rankingKecamatan.forEach(s => {
                tbody.insertAdjacentHTML('beforeend', `<tr><td><strong>${s._id}</strong></td><td>${formatRp(s.avgPricePerM2)}</td><td>${formatRp(s.minPrice)}</td><td>${formatRp(s.maxPrice)}</td><td><span class="badge status-avail">${s.totalListings} unit</span></td></tr>`);
            });
        }
    } catch (err) { console.warn('Analytics render partially failed:', err); }
}


// =============================================
// Properties — filter & table
// =============================================
function onCityFilterChange() {
    const city = document.getElementById('filterCitySelect').value;
    const sel  = document.getElementById('filterDistrictSelect');
    sel.innerHTML = '<option value="">Semua Kecamatan</option>';
    if (city && districtsByCity[city]) {
        districtsByCity[city].forEach(d => {
            const o = document.createElement('option');
            o.value = d; o.textContent = d;
            sel.appendChild(o);
        });
    }
    loadProperties();
}

async function loadProperties() {
    const city     = document.getElementById('filterCitySelect').value;
    const district = document.getElementById('filterDistrictSelect').value;
    const props    = await fetchJSON(`/api/properties?city=${enc(city)}&district=${enc(district)}`);
    const tbody    = document.getElementById('propTableBody');
    tbody.innerHTML = '';

    if (!props.length) {
        tbody.innerHTML = emptyRow(5, 'Tidak ada properti ditemukan.');
        return;
    }

    props.forEach(p => {
        const cls = p.status === 'Terjual' ? 'status-sold' : 'status-avail';
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td><span class="badge ${cls}">${p.status}</span></td>
                <td>${p.title}</td>
                <td>${p.district}, ${p.city}</td>
                <td>${formatRp(p.price_idr)}</td>
                <td>
                    <button class="btn-edit"   onclick="openEditPropPanel('${p._id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-delete" onclick="deleteProperty('${p._id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`);
    });
}

// =============================================
// Property Panel (side drawer)
// =============================================
function openPropPanel() {
    document.getElementById('propForm').reset();
    document.getElementById('propId').value = '';
    document.getElementById('f_image_url').value = '';
    document.getElementById('uploadStatus').textContent = '';
    document.getElementById('panelTitle').innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Unit Baru';
    showPanel();
}

async function openEditPropPanel(id) {
    const p = await fetchJSON(`/api/properties/${id}`);
    document.getElementById('propId').value      = p._id;
    document.getElementById('panelTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Data Unit';
    document.getElementById('f_status').value    = p.status || 'Tersedia';
    document.getElementById('f_title').value     = p.title;
    document.getElementById('f_price').value     = p.price_idr;
    document.getElementById('f_city').value      = p.city;
    document.getElementById('f_district').value  = p.district;
    document.getElementById('f_bedrooms').value  = p.bedrooms || '';
    document.getElementById('f_bathrooms').value = p.bathrooms || '';
    document.getElementById('f_land').value      = p.land_size_m2;
    document.getElementById('f_building').value  = p.building_size_m2;
    document.getElementById('f_njop').value      = p.njop_price && p.land_size_m2 ? Math.round(p.njop_price / p.land_size_m2) : '';
    document.getElementById('f_image_url').value = p.image_url || '';
    document.getElementById('f_agent_name').value  = p.agent_name || '';
    document.getElementById('f_agent_phone').value = p.agent_phone || '';
    document.getElementById('f_agent_email').value = p.agent_email || '';
    document.getElementById('f_notes').value     = p.notes || '';
    document.getElementById('uploadStatus').textContent = '';
    showPanel();
}

function showPanel() {
    document.getElementById('propPanel').classList.add('open');
    document.getElementById('propPanelOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closePropPanel() {
    document.getElementById('propPanel').classList.remove('open');
    document.getElementById('propPanelOverlay').classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('f_image_file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const lbl = document.getElementById('uploadStatus');
    lbl.textContent = 'Mengunggah...'; lbl.style.color = '#94a3b8';
    const fd = new FormData(); fd.append('image', file);
    try {
        const data = await (await fetch('/api/upload', { method: 'POST', body: fd })).json();
        document.getElementById('f_image_url').value = data.imageUrl;
        lbl.textContent = '✅ Berhasil diunggah!'; lbl.style.color = '#10b981';
    } catch {
        lbl.textContent = '❌ Gagal mengunggah'; lbl.style.color = '#ef4444';
    }
});

async function submitPropForm() {
    const id = document.getElementById('propId').value;

    const status = document.getElementById('f_status').value;
    const data = {
        status:           status,
        title:            document.getElementById('f_title').value,
        price_idr:        Number(document.getElementById('f_price').value),
        city:             document.getElementById('f_city').value,
        district:         document.getElementById('f_district').value,
        bedrooms:         Number(document.getElementById('f_bedrooms').value),
        bathrooms:        Number(document.getElementById('f_bathrooms').value),
        land_size_m2:     Number(document.getElementById('f_land').value),
        building_size_m2: Number(document.getElementById('f_building').value),
        njop_per_m2:      Number(document.getElementById('f_njop').value),
        image_url:        document.getElementById('f_image_url').value,
        agent_name:       document.getElementById('f_agent_name').value,
        agent_phone:      document.getElementById('f_agent_phone').value,
        agent_email:      document.getElementById('f_agent_email').value,
        notes:            document.getElementById('f_notes').value,
    };

    // Otomatis set tanggal terjual jika status adalah Terjual
    if (status === 'Terjual') {
        data.sold_at = new Date().toISOString();
    }

    const url    = id ? `/api/properties/${id}` : '/api/properties';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        closePropPanel();
        loadProperties();
        loadStats();
    } else {
        alert('Gagal menyimpan data. Periksa kembali isian form.');
    }
}

async function deleteProperty(id) {
    if (!confirm('Hapus unit ini secara permanen?')) return;
    await fetch(`/api/properties/${id}`, { method: 'DELETE' });
    loadProperties();
    loadStats();
}

// =============================================
// Sales Status
// =============================================
function setSalesRange(range, btn) {
    currentSalesRange = range;
    document.querySelectorAll('.range-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadSalesStatus();
}

async function loadSalesStatus() {
    try {
        const agentName = document.getElementById('ss_agentFilter').value;
        const res = await fetchJSON(`/api/dashboard-combined?range=${currentSalesRange}&agent=${enc(agentName)}`);
        const stats = res.stats;
        
        // 1. Agent Summary Card
        const summaryCard = document.getElementById('ss_agentSummary');
        if (agentName && summaryCard) {
            summaryCard.style.display = 'block';
            document.getElementById('ss_summaryAgentName').textContent = agentName;
            document.getElementById('ss_summaryUnits').textContent = stats.soldUnits;
            document.getElementById('ss_summaryRevenue').textContent = formatRp(stats.revenue);
        } else if (summaryCard) {
            summaryCard.style.display = 'none';
        }

        const sold      = stats.soldUnits || 0;
        const total     = stats.total || 0;
        const available = stats.available || (total - sold);
        const rate      = total > 0 ? ((sold / total) * 100).toFixed(1) : 0;

        document.getElementById('ss_sold').textContent     = sold;
        document.getElementById('ss_available').textContent = available;
        document.getElementById('ss_rate').textContent     = `${rate}%`;
        document.getElementById('ss_revenue').textContent  = formatRp(stats.revenue || 0);

        // 2. Donut Chart (Komposisi)
        try {
            const donutCtx = document.getElementById('salesDonutChart');
            if (donutCtx) {
                if (salesDonutInstance) salesDonutInstance.destroy();
                salesDonutInstance = new Chart(donutCtx, {
                    type: 'doughnut',
                    data: { labels: ['Terjual', 'Tersedia'], datasets: [{ data: [sold, available], backgroundColor: ['#ef4444', '#10b981'], borderColor: '#1e293b', borderWidth: 3 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc' } } }, cutout: '65%' }
                });
            }
        } catch (e) {}

        // 3. Bar Chart (By City) — Khusus unit TERJUAL per kota
        try {
            const cityCtx = document.getElementById('salesByCityChart');
            if (cityCtx) {
                const soldByCity = stats.soldByCityStats || [];
                const labels = soldByCity.length > 0
                    ? soldByCity.map(s => s._id || '—')
                    : ['Jakarta Selatan', 'Jakarta Barat', 'Jakarta Utara', 'Jakarta Timur', 'Jakarta Pusat'];
                const counts = soldByCity.map(s => s.count);
                if (salesByCityInstance) salesByCityInstance.destroy();
                salesByCityInstance = new Chart(cityCtx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Unit Terjual', data: counts, backgroundColor: '#f59e0b', borderRadius: 6 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        } catch (e) {}

        // 4. Sold List Table - Fetch only what's needed for the table
        const tbody = document.getElementById('soldTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Memuat daftar...</td></tr>';
            // PENTING: Tambahkan range=${currentSalesRange} agar tabel ikut berubah otomatis
            const soldProps = await fetchJSON(`/api/properties?status=Terjual&range=${currentSalesRange}&limit=50`); 
            tbody.innerHTML = '';
            document.getElementById('ss_tableCount').textContent = `${soldProps.length} unit terbaru`;
            if (!soldProps.length) {
                tbody.innerHTML = emptyRow(5, 'Belum ada unit terjual.');
            } else {
                soldProps.forEach(p => {
                    const dt = p.sold_at ? new Date(p.sold_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short' }) : '—';
                    tbody.insertAdjacentHTML('beforeend', `<tr><td>${dt}</td><td>${p.title}</td><td>${p.district}</td><td>${formatRp(p.price_idr)}</td><td>${p.agent_name || '—'}</td></tr>`);
                });
            }
        }

        // 5. Agent Performance
        const agentBody = document.getElementById('agentPerformanceBody');
        if (agentBody) {
            agentBody.innerHTML = '';
            if (!stats.agentPerformance || !stats.agentPerformance.length) {
                agentBody.innerHTML = emptyRow(4, 'Tidak ada data.');
            } else {
                stats.agentPerformance.forEach(ap => {
                    agentBody.insertAdjacentHTML('beforeend', `<tr><td><strong>${ap._id || '—'}</strong></td><td><span class="badge status-avail">${ap.soldUnits} unit</span></td><td><strong style="color:var(--success)">${formatRp(ap.totalRevenue)}</strong></td><td style="font-size:0.75rem; color:var(--text-muted);">Top Seller</td></tr>`);
                });
            }
        }
    } catch (e) { console.error('Sales status failed:', e); }
}


// =============================================
// Agents
// =============================================
async function loadAgents() {
    try {
        const agents = await fetchJSON('/api/agents');
        
        // Update Agent Filter in Sales Status
        const ssAgentFilter = document.getElementById('ss_agentFilter');
        if (ssAgentFilter) {
            const currentVal = ssAgentFilter.value;
            ssAgentFilter.innerHTML = '<option value="">Semua Agen</option>';
            agents.forEach(a => {
                ssAgentFilter.insertAdjacentHTML('beforeend', `<option value="${a.name}">${a.name}</option>`);
            });
            ssAgentFilter.value = currentVal;
        }

        const tbody  = document.getElementById('agentTableBody');
        tbody.innerHTML = '';
        if (!agents.length) { tbody.innerHTML = emptyRow(5, 'Belum ada agen.'); return; }
        agents.forEach(a => {
            tbody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${a.agent_id}</td>
                    <td>${a.name}</td>
                    <td>${a.phone}</td>
                    <td>${a.email}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-edit-outline" onclick="openAgentPanel('${a._id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button class="btn-delete" style="margin-left:0.4rem;" onclick="deleteAgent('${a._id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>`);
        });
    } catch (e) { console.error('Load agents failed:', e); }
}

// Agent Edit Panel
async function openAgentPanel(id) {
    const a = await fetchJSON(`/api/agents/${id}`);
    document.getElementById('ae_id').value       = a._id;
    document.getElementById('ae_agent_id').value = a.agent_id;
    document.getElementById('ae_name').value     = a.name;
    document.getElementById('ae_phone').value    = a.phone;
    document.getElementById('ae_email').value    = a.email;
    document.getElementById('agentPanelTitle').innerHTML = '<i class="fa-solid fa-user-pen"></i> Edit Agen';
    document.getElementById('agentPanel').classList.add('open');
    document.getElementById('agentPanelOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeAgentPanel() {
    document.getElementById('agentPanel').classList.remove('open');
    document.getElementById('agentPanelOverlay').classList.remove('open');
    document.body.style.overflow = '';
}

async function submitAgentEdit() {
    const id = document.getElementById('ae_id').value;
    const data = {
        agent_id: document.getElementById('ae_agent_id').value,
        name:     document.getElementById('ae_name').value,
        phone:    document.getElementById('ae_phone').value,
        email:    document.getElementById('ae_email').value,
    };
    const res = await fetch(`/api/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        closeAgentPanel();
        loadAgents();
    } else {
        alert('Gagal menyimpan. Pastikan ID Agen tidak duplikat.');
    }
}

function openAgentModal()  { document.getElementById('agentModal').classList.add('show'); }
function closeAgentModal() { document.getElementById('agentModal').classList.remove('show'); }

document.getElementById('agentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const res  = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (res.ok) { closeAgentModal(); loadAgents(); loadStats(); }
});

async function deleteAgent(id) {
    if (!confirm('Hapus agen ini?')) return;
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    loadAgents(); loadStats();
}

// =============================================
// Helpers
// =============================================
async function fetchJSON(url) {
    const res = await fetch(url);
    return res.json();
}

function formatRp(n) {
    if (!n) return 'Rp 0';
    return `Rp ${Math.floor(n).toLocaleString('id-ID')}`;
}

function enc(s) { return encodeURIComponent(s || ''); }

function emptyRow(cols, msg) {
    return `<tr><td colspan="${cols}" style="text-align:center;color:var(--text-muted);padding:2rem;">${msg}</td></tr>`;
}

// Close agent modal on overlay click
document.getElementById('agentModal').addEventListener('click', function(e) {
    if (e.target === this) closeAgentModal();
});

// --- DYNAMIC EXPORT SYSTEM ---
async function loadExportOptions() {
    const selector = document.getElementById('exportSelector');
    if (!selector) return;

    try {
        selector.innerHTML = '<option value="">⏳ Memuat daftar database...</option>';
        selector.disabled = true;

        const res = await fetch('/api/export-list');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const list = await res.json();
        selector.disabled = false;

        if (!list || list.length === 0) {
            selector.innerHTML = '<option value="">-- Tidak ada koleksi ditemukan --</option>';
            return;
        }

        selector.innerHTML = '<option value="">-- Pilih Kategori Data --</option>' +
            list.map(item => `<option value="${item.id}">${item.label}</option>`).join('');

    } catch (e) {
        console.error('Export list error:', e);
        selector.disabled = false;
        selector.innerHTML = '<option value="">⚠️ Server belum tersambung — klik Segarkan</option>';
    }
}

async function handleDynamicExport() {
    const selector = document.getElementById('exportSelector');
    const modelId = selector.value;
    if (!modelId) return alert('Silakan pilih kategori data terlebih dahulu.');

    const btn = event.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengekspor...';
    btn.disabled = true;

    try {
        const res = await fetch(`/api/export/data/${modelId}`);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            alert('Data kosong, tidak ada yang bisa di-export.');
        } else {
            // GENERIC CSV GENERATOR
            const headers = Object.keys(data[0]).filter(k => k !== '__v'); // Saring field internal mongo
            const rows = data.map(item => headers.map(h => {
                let val = item[h];
                if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                return `"${(String(val || '')).replace(/"/g, '""')}"`;
            }));

            downloadCSV(headers, rows, `Export_${modelId.toUpperCase()}`);
        }
    } catch (e) {
        console.error('Export error:', e);
        alert('Gagal mengambil data.');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

function downloadCSV(headers, rows, filename) {
    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =============================================
// Initial load
// =============================================
loadLocations();
loadStats();
loadProperties();
loadAgents();
loadExportOptions(); // Panggil di awal agar data langsung siap