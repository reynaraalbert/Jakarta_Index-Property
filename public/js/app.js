const propertyGrid = document.getElementById('propertyGrid');
const loading = document.getElementById('loading');
const previewModal = document.getElementById('previewModal');
const modalData = document.getElementById('modalData');

// Pool foto properti realistis dari Unsplash (stabil, tidak berubah)
const PROPERTY_PHOTOS = [
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1523217582562-09d0def993a6?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1549517045-bc93de075e53?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
];

// Jika properti punya foto upload → pakai itu. Jika tidak → pilih dari pool berdasarkan ID
function getPropertyImage(prop) {
    if (prop.image_url && prop.image_url.trim() !== '') return prop.image_url;
    const id = prop._id || '';
    const idx = parseInt(id.slice(-2), 16) % PROPERTY_PHOTOS.length;
    return PROPERTY_PHOTOS[idx];
}

let cityDistricts = {};

async function loadLocations() {
    try {
        const response = await fetch('/api/locations');
        const locations = await response.json();
        
        cityDistricts = {};
        locations.forEach(loc => {
            if (!loc.city || !loc.district) return;
            
            // Bersihkan spasi dan format Capitalize
            const cleanCity = loc.city.trim().replace(/\s+/g, ' ');
            const cleanDistrict = loc.district.trim().replace(/\s+/g, ' ');
            
            const formattedCity = cleanCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            const formattedDistrict = cleanDistrict.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            
            if (!cityDistricts[formattedCity]) cityDistricts[formattedCity] = [];
            if (!cityDistricts[formattedCity].includes(formattedDistrict)) {
                cityDistricts[formattedCity].push(formattedDistrict);
            }
        });
        
        Object.keys(cityDistricts).forEach(city => cityDistricts[city].sort());
        console.log("Locations loaded:", cityDistricts);
    } catch (error) {
        console.error('Failed to load locations:', error);
    }
}

const citySelect = document.getElementById('citySelect');
const districtSelect = document.getElementById('districtSelect');

if (citySelect) {
    citySelect.addEventListener('change', function() {
        const selectedCity = this.value;
        districtSelect.innerHTML = '<option value="">Semua Wilayah</option>';
        
        if (selectedCity && cityDistricts[selectedCity]) {
            cityDistricts[selectedCity].forEach(district => {
                const option = document.createElement('option');
                option.value = district;
                option.textContent = district;
                districtSelect.appendChild(option);
            });
        }
    });
}


async function fetchProperties() {
    const searchInput = document.getElementById('searchInput');
    const citySelect = document.getElementById('citySelect');
    const districtSelect = document.getElementById('districtSelect');
    const minPriceInput = document.getElementById('minPrice');
    const maxPriceInput = document.getElementById('maxPrice');
    const maxLandInput = document.getElementById('maxLand');

    // Restore from sessionStorage on first load
    if (!searchInput.dataset.initialized) {
        const saved = JSON.parse(sessionStorage.getItem('userSearchFilter') || '{}');
        if (saved.search) searchInput.value = saved.search;
        if (saved.city) citySelect.value = saved.city;
        if (saved.city && cityDistricts[saved.city]) {
            // Trigger change manually to populate districts
            citySelect.dispatchEvent(new Event('change'));
            if (saved.district) districtSelect.value = saved.district;
        }
        if (saved.minPrice) minPriceInput.value = saved.minPrice;
        if (saved.maxPrice) maxPriceInput.value = saved.maxPrice;
        if (saved.maxLand) maxLandInput.value = saved.maxLand;
        
        searchInput.dataset.initialized = "true";
    }

    const search = searchInput.value;
    const city = citySelect.value;
    const district = districtSelect.value;
    const minPrice = minPriceInput.value;
    const maxPrice = maxPriceInput.value;
    const maxLand = maxLandInput.value;

    // Save to sessionStorage
    sessionStorage.setItem('userSearchFilter', JSON.stringify({
        search, city, district, minPrice, maxPrice, maxLand
    }));

    const params = new URLSearchParams({
        search, city, district, minPrice, maxPrice, maxLand
    });

    propertyGrid.innerHTML = '';
    loading.style.display = 'block';

    try {
        const response = await fetch(`/api/properties?${params}`);
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.length === 0) {
            propertyGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8;">Tidak ada properti ditemukan.</p>';
            return;
        }

        data.forEach(prop => {
            const cardImg = getPropertyImage(prop);
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => showPreview(prop._id);
            card.innerHTML = `
                <div class="card-img">
                    <img src="${cardImg}" alt="${prop.title}" loading="lazy"
                         onerror="this.src='https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=500&q=80'">
                    <span class="price-tag">Rp ${Number(prop.price_idr).toLocaleString('id-ID')}</span>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${prop.title}</h3>
                    <div class="card-loc">
                        <i class="fa-solid fa-location-dot"></i> ${prop.district}, ${prop.city}
                    </div>
                    <div class="card-specs">
                        <div class="spec-item"><i class="fa-solid fa-bed"></i> ${prop.bedrooms || '—'} KT</div>
                        <div class="spec-item"><i class="fa-solid fa-bath"></i> ${prop.bathrooms || '—'} KM</div>
                        <div class="spec-item"><i class="fa-solid fa-ruler-combined"></i> ${prop.land_size_m2}m²</div>
                    </div>
                </div>
            `;
            propertyGrid.appendChild(card);
        });
    } catch (error) {
        console.error('Error:', error);
        loading.style.display = 'none';
    }
}

async function showPreview(id) {
    const modal = document.getElementById('previewModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    modalData.innerHTML = `
        <div class="modal-inner-scroll">
            <div style="padding:4rem 2rem; text-align:center;">
                <i class="fa-solid fa-circle-notch fa-spin fa-2xl" style="color:#fbbf24;"></i>
            </div>
        </div>`;
    
    try {
        const response = await fetch(`/api/properties/${id}`);
        const prop = await response.json();
        
        const njopPerMeter = prop.njop_price && prop.land_size_m2
            ? `Rp ${Math.round(prop.njop_price / prop.land_size_m2).toLocaleString('id-ID')}`
            : 'Tersedia saat survey';
        const waLink = prop.agent_phone
            ? `https://wa.me/${prop.agent_phone.replace(/\D/g,'')}`
            : '#';

        const hasImage = prop.image_url && prop.image_url.trim() !== '';
        const modalImgSrc = getPropertyImage(prop);
        const headerHTML = `<img src="${modalImgSrc}" class="modal-header-img" alt="${prop.title}"
                onerror="this.outerHTML='<div class=\\'modal-header-img-placeholder\\'><i class=\\'fa-solid fa-building\\'></i><span>Foto tidak tersedia</span></div>'">`;

        modalData.innerHTML = `
            <div class="modal-inner-scroll">
                ${headerHTML}
                <div class="modal-body">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.8rem;margin-bottom:1rem;">
                        <div class="agent-badge">
                            <i class="fa-solid fa-user-tie"></i> ${prop.agent_name || 'JKTProp Agent'}
                        </div>
                        <div style="text-align:right;font-size:0.82rem;color:#94a3b8;line-height:1.9;">
                            ${prop.agent_email ? `<div><i class="fa-solid fa-envelope"></i> ${prop.agent_email}</div>` : ''}
                            ${prop.agent_phone ? `<div><i class="fa-solid fa-phone"></i> ${prop.agent_phone}</div>` : ''}
                        </div>
                    </div>

                    <h2 class="modal-title">${prop.title}</h2>
                    <div class="card-loc" style="margin-bottom:1rem;font-size:1rem;">
                        <i class="fa-solid fa-location-dot"></i> ${prop.district}, ${prop.city}
                    </div>

                    <div class="modal-meta">
                        <div class="meta-item">
                            <label>Harga Penawaran</label>
                            <span>Rp ${Number(prop.price_idr).toLocaleString('id-ID')}</span>
                        </div>
                        <div class="meta-item">
                            <label>Estimasi NJOP / m²</label>
                            <span>${njopPerMeter}</span>
                        </div>
                        <div class="meta-item">
                            <label>Luas Tanah</label>
                            <span>${prop.land_size_m2} m²</span>
                        </div>
                        <div class="meta-item">
                            <label>Luas Bangunan</label>
                            <span>${prop.building_size_m2} m²</span>
                        </div>
                        ${prop.bedrooms ? `<div class="meta-item"><label>Kamar Tidur</label><span>${prop.bedrooms} KT</span></div>` : ''}
                        ${prop.bathrooms ? `<div class="meta-item"><label>Kamar Mandi</label><span>${prop.bathrooms} KM</span></div>` : ''}
                    </div>

                    <div class="modal-notes">
                        <h4><i class="fa-solid fa-note-sticky" style="color:#fbbf24;margin-right:0.4rem;"></i>Catatan Properti:</h4>
                        <p>${prop.notes || 'Bebas banjir, kawasan elit, dekat dengan fasilitas publik dan akses transportasi mudah.'}</p>
                    </div>

                    <div style="margin-top:1.8rem;display:flex;gap:0.8rem;flex-wrap:wrap;">
                        <a href="${waLink}" target="_blank"
                           style="flex:2;min-width:160px;padding:0.9rem 1rem;background:#25d366;text-decoration:none;text-align:center;color:white;border-radius:0.8rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:0.5rem;font-family:inherit;">
                            <i class="fa-brands fa-whatsapp"></i> Hubungi Agen via WA
                        </a>
                        <button onclick="closeModal()"
                                style="flex:1;min-width:80px;padding:0.9rem;background:transparent;border:1px solid #334155;color:#f8fafc;border-radius:0.8rem;cursor:pointer;font-family:inherit;font-size:0.9rem;">
                            Tutup
                        </button>
                    </div>
                </div>
            </div>`;
    } catch (error) {
        modalData.innerHTML = `
            <div class="modal-inner-scroll">
                <p style="padding:3rem;text-align:center;color:#94a3b8;">Gagal memuat detail properti.</p>
            </div>`;
    }
}

function closeModal() {
    previewModal.style.display = 'none';
    document.body.style.overflow = '';
}

// Close modal when clicking the backdrop
window.onclick = function(event) {
    if (event.target === previewModal) closeModal();
}

// Initial fetch
loadLocations();
fetchProperties();