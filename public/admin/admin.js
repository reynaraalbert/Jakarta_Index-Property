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
        const range = document.getElementById('statsRange').value;
        const data  = await fetchJSON(`/api/stats?range=${range}`);

        document.getElementById('totalProps').textContent   = data.total;
        document.getElementById('totalAgents').textContent  = data.totalAgents;
        document.getElementById('soldUnits').textContent    = data.soldUnits;
        document.getElementById('totalRevenue').textContent = formatRp(data.revenue);

        const labels = data.cityStats.map(s => s._id || 'Unknown');
        const counts = data.cityStats.map(s => s.count);

        if (cityChartInstance) cityChartInstance.destroy();
        cityChartInstance = new Chart(document.getElementById('cityChart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Jumlah Unit', data: counts, backgroundColor: '#2563eb', borderRadius: 6 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });

        // Load Market Trends
        loadMarketTrends();
    } catch (e) { console.error(e); }
}

async function loadMarketTrends() {
    try {
        const data = await fetchJSON('/api/analytics');
        
        // 1. Ranking Chart (Top 10)
        const top10 = data.rankingKecamatan.slice(0, 10);
        const rankLabels = top10.map(s => s._id);
        const rankPrices = top10.map(s => Math.round(s.avgPricePerM2));

        if (rankingChartInstance) rankingChartInstance.destroy();
        rankingChartInstance = new Chart(document.getElementById('rankingChart'), {
            type: 'bar',
            data: {
                labels: rankLabels,
                datasets: [{ label: 'Harga/m²', data: rankPrices, backgroundColor: '#f59e0b', borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    x: { ticks: { color: '#94a3b8', callback: v => `Rp ${v/1000000}jt` } },
                    y: { ticks: { color: '#94a3b8' } }
                }
            }
        });

        // 2. Distribution Chart
        const distLabels = ['<10jt', '10-30jt', '30-50jt', '>50jt'];
        const distCounts = data.priceDistribution.map(b => b.count);

        if (distChartInstance) distChartInstance.destroy();
        distChartInstance = new Chart(document.getElementById('distChart'), {
            type: 'doughnut',
            data: {
                labels: distLabels,
                datasets: [{ 
                    data: distCounts, 
                    backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444'],
                    borderColor: '#1e293b', borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc' } } },
                cutout: '60%'
            }
        });

        // 3. Comparison Table
        const tbody = document.getElementById('comparisonTableBody');
        tbody.innerHTML = '';
        data.rankingKecamatan.forEach(s => {
            tbody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td><strong>${s._id}</strong></td>
                    <td>${formatRp(s.avgPricePerM2)}</td>
                    <td>${formatRp(s.minPrice)}</td>
                    <td>${formatRp(s.maxPrice)}</td>
                    <td><span class="badge status-avail">${s.totalListings} unit</span></td>
                </tr>
            `);
        });

    } catch (e) { console.error('Trends failed:', e); }
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

    const data = {
        status:           document.getElementById('f_status').value,
        title:            document.getElementById('f_title').value,
        price_idr:        document.getElementById('f_price').value,
        city:             document.getElementById('f_city').value,
        district:         document.getElementById('f_district').value,
        bedrooms:         document.getElementById('f_bedrooms').value,
        bathrooms:        document.getElementById('f_bathrooms').value,
        land_size_m2:     document.getElementById('f_land').value,
        building_size_m2: document.getElementById('f_building').value,
        njop_per_m2:      document.getElementById('f_njop').value,
        image_url:        document.getElementById('f_image_url').value,
        agent_name:       document.getElementById('f_agent_name').value,
        agent_phone:      document.getElementById('f_agent_phone').value,
        agent_email:      document.getElementById('f_agent_email').value,
        notes:            document.getElementById('f_notes').value,
    };

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
        const stats = await fetchJSON(`/api/stats?range=${currentSalesRange}&agent=${encodeURIComponent(agentName)}`);
        
        // Show/Hide Summary Card for specific agent
        const summaryCard = document.getElementById('ss_agentSummary');
        if (agentName) {
            summaryCard.style.display = 'block';
            document.getElementById('ss_summaryAgentName').textContent = agentName;
            document.getElementById('ss_summaryUnits').textContent = stats.soldUnits;
            document.getElementById('ss_summaryRevenue').textContent = formatRp(stats.revenue);
        } else {
            summaryCard.style.display = 'none';
        }

        const sold      = stats.soldUnits || 0;
        const total     = stats.total || 0;
        const available = total - sold;
        const rate      = total > 0 ? ((sold / total) * 100).toFixed(1) : 0;

        document.getElementById('ss_sold').textContent     = sold;
        document.getElementById('ss_available').textContent = available;
        document.getElementById('ss_rate').textContent     = `${rate}%`;
        document.getElementById('ss_revenue').textContent  = formatRp(stats.revenue || 0);

        // Donut
        if (salesDonutInstance) salesDonutInstance.destroy();
        salesDonutInstance = new Chart(document.getElementById('salesDonutChart'), {
            type: 'doughnut',
            data: {
                labels: ['Terjual', 'Tersedia'],
                datasets: [{
                    data: [sold, available],
                    backgroundColor: ['#ef4444', '#10b981'],
                    borderColor: '#1e293b',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#f8fafc', padding: 16, font: { size: 12 } } }
                },
                cutout: '65%'
            }
        });

        // Sold list
        const soldProps = await fetchJSON(`/api/properties?status=Terjual&range=${currentSalesRange}&limit=1000`);
        const filtered  = soldProps.filter(p => p.status === 'Terjual');

        // Bar by city
        const byCityMap = {};
        filtered.forEach(p => { byCityMap[p.city] = (byCityMap[p.city] || 0) + 1; });
        const cities     = Object.keys(byCityMap).sort();
        const cityCounts = cities.map(c => byCityMap[c]);

        if (salesByCityInstance) salesByCityInstance.destroy();
        salesByCityInstance = new Chart(document.getElementById('salesByCityChart'), {
            type: 'bar',
            data: {
                labels: cities.length ? cities : ['—'],
                datasets: [{ label: 'Unit Terjual', data: cities.length ? cityCounts : [0], backgroundColor: '#f59e0b', borderRadius: 6 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });

        // Table
        const tbody = document.getElementById('soldTableBody');
        tbody.innerHTML = '';
        document.getElementById('ss_tableCount').textContent = `${filtered.length} unit`;

        if (!filtered.length) {
            tbody.innerHTML = emptyRow(5, 'Belum ada unit terjual dalam periode ini.');
            return;
        }
        filtered.forEach(p => {
            const dt = p.sold_at ? new Date(p.sold_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '—';
            tbody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${dt}</td>
                    <td>${p.title}</td>
                    <td>${p.district}, ${p.city}</td>
                    <td>${formatRp(p.price_idr)}</td>
                    <td>${p.agent_name || '—'}</td>
                </tr>`);
        });

        // Agent Performance Table
        const agentBody = document.getElementById('agentPerformanceBody');
        agentBody.innerHTML = '';
        if (!stats.agentPerformance || !stats.agentPerformance.length) {
            agentBody.innerHTML = emptyRow(4, 'Tidak ada data performa agen.');
        } else {
            stats.agentPerformance.forEach(ap => {
                const details = ap.items.map(it => `• ${it.title} (${formatRp(it.price)})`).join('<br>');
                agentBody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td><strong>${ap._id || '—'}</strong></td>
                        <td><span class="badge status-avail">${ap.soldUnits} unit</span></td>
                        <td><strong style="color:var(--success)">${formatRp(ap.totalRevenue)}</strong></td>
                        <td style="font-size:0.8rem; color:var(--text-muted); line-height:1.4;">${details}</td>
                    </tr>
                `);
            });
        }
    } catch (e) { console.error(e); }
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