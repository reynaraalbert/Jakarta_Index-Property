const tableBody = document.getElementById('adminTableBody');

async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        document.getElementById('totalCount').innerText = data.total.toLocaleString();
        document.getElementById('avgPrice').innerText = 'Rp ' + Math.round(data.avgPrice).toLocaleString('id-ID');
    } catch (error) {
        console.error(error);
    }
}

async function fetchAdminData() {
    try {
        const response = await fetch('/api/properties');
        const data = await response.json();
        
        tableBody.innerHTML = '';
        data.forEach(prop => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${prop.title.substring(0, 50)}${prop.title.length > 50 ? '...' : ''}</td>
                <td>${prop.price_idr.toLocaleString('id-ID')}</td>
                <td>${prop.district}</td>
                <td>${prop.bedrooms}</td>
                <td>
                    <button class="btn-edit" onclick="editProperty('${prop._id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="deleteProperty('${prop._id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error(error);
    }
}

async function deleteProperty(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    
    try {
        const response = await fetch(`/api/properties/${id}`, { method: 'DELETE' });
        if (response.ok) {
            alert('Data dihapus!');
            fetchAdminData();
            fetchStats();
        }
    } catch (error) {
        console.error(error);
    }
}

function editProperty(id) {
    alert('Fitur edit untuk ID ' + id + ' sedang dikembangkan!');
}

// Initial load
fetchStats();
fetchAdminData();
