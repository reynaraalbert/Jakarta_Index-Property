const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const Property = require('./models/Property');
const Agent = require('./models/Agent');
const Location = require('./models/Location');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE CONNECTION
// ─────────────────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ DB Connection error:', err.message));

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK — buka http://localhost:5000/api/health untuk cek status server
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.json({
        server: 'ok',
        db: dbState[mongoose.connection.readyState] || 'unknown',
        models: mongoose.modelNames(),
        timestamp: new Date().toISOString()
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTIES
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/properties', async (req, res) => {
    try {
        const { city, district, minPrice, maxPrice, maxLand, search, status, limit } = req.query;
        let query = {};
        if (city)    query.city     = new RegExp(city, 'i');
        if (district) query.district = new RegExp(district, 'i');
        if (minPrice || maxPrice) {
            query.price_idr = {};
            if (minPrice) query.price_idr.$gte = Number(minPrice);
            if (maxPrice) query.price_idr.$lte = Number(maxPrice);
        }
        if (maxLand)  query.land_size_m2 = { $lte: Number(maxLand) };
        if (search)   query.$or = [{ title: new RegExp(search, 'i') }];
        if (status)   query.status = status;
        const props = await Property.find(query).sort({ createdAt: -1 }).limit(Number(limit) || 100000);
        res.json(props);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// FIX #4: GET /api/properties/:id yang hilang (dibutuhkan saat edit properti)
app.get('/api/properties/:id', async (req, res) => {
    try {
        const prop = await Property.findById(req.params.id);
        if (!prop) return res.status(404).json({ error: 'Properti tidak ditemukan' });
        res.json(prop);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/properties', async (req, res) => {
    try { res.json(await new Property(req.body).save()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/properties/:id', async (req, res) => {
    try { res.json(await Property.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/properties/:id', async (req, res) => {
    try { await Property.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENTS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/agents', async (req, res) => {
    try { res.json(await Agent.find().sort({ name: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents', async (req, res) => {
    try { res.json(await new Agent(req.body).save()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agents/:id', async (req, res) => {
    try { res.json(await Agent.findById(req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/:id', async (req, res) => {
    try {
        const updated = await Agent.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(updated);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/:id', async (req, res) => {
    try { await Agent.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/locations', async (req, res) => {
    try { res.json(await Location.find().sort({ city: 1, district: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #2: /api/stats — field names diperbaiki sesuai kebutuhan admin.js
// Frontend butuh: totalAgents, soldUnits, cityStats, agentPerformance
// Juga handles ?range= dan ?agent= dari halaman Sales Status
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
    try {
        const { range, agent } = req.query;

        // Filter tanggal penjualan berdasarkan range
        let dateFilter = {};
        const now = new Date();
        if (range === 'day') {
            const start = new Date(now); start.setHours(0, 0, 0, 0);
            dateFilter = { sold_at: { $gte: start } };
        } else if (range === 'week') {
            dateFilter = { sold_at: { $gte: new Date(now.getTime() - 7 * 86400000) } };
        } else if (range === 'month') {
            dateFilter = { sold_at: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
        } else if (range === 'year') {
            dateFilter = { sold_at: { $gte: new Date(now.getFullYear(), 0, 1) } };
        }

        let soldQuery = { status: 'Terjual', ...dateFilter };
        if (agent) soldQuery.agent_name = agent;

        const [total, totalAgents, soldProps, allProperties, allSold] = await Promise.all([
            Property.countDocuments(),
            Agent.countDocuments(),
            Property.find(soldQuery),
            Property.find(),
            Property.find({ status: 'Terjual' })
        ]);

        // cityStats: format array of {_id, count} sesuai ekspektasi Chart di admin.js
        const cityMap = {};
        allProperties.forEach(p => { if (p.city) cityMap[p.city] = (cityMap[p.city] || 0) + 1; });
        const cityStats = Object.entries(cityMap).map(([_id, count]) => ({ _id, count }));

        // agentPerformance: group by agent_name
        const agentMap = {};
        allSold.forEach(p => {
            if (!p.agent_name) return;
            if (!agentMap[p.agent_name]) agentMap[p.agent_name] = { soldUnits: 0, totalRevenue: 0, items: [] };
            agentMap[p.agent_name].soldUnits++;
            agentMap[p.agent_name].totalRevenue += (p.price_idr || 0);
            agentMap[p.agent_name].items.push({ title: p.title, price: p.price_idr });
        });
        const agentPerformance = Object.entries(agentMap).map(([_id, d]) => ({ _id, ...d }));

        res.json({
            total,
            totalAgents,
            soldUnits: soldProps.length,
            available: total - allSold.length,
            revenue: soldProps.reduce((s, p) => s + (p.price_idr || 0), 0),
            cityStats,
            agentPerformance
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #3: /api/analytics — endpoint yang sama sekali hilang dari server.js
// Dipakai oleh loadMarketTrends() untuk: rankingKecamatan + priceDistribution
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/analytics', async (req, res) => {
    try {
        // Ranking kecamatan berdasarkan rata-rata harga per m² lahan
        const rankingKecamatan = await Property.aggregate([
            { $match: { land_size_m2: { $gt: 0 }, price_idr: { $gt: 0 } } },
            {
                $group: {
                    _id: '$district',
                    avgPricePerM2:  { $avg: { $divide: ['$price_idr', '$land_size_m2'] } },
                    minPrice:       { $min: '$price_idr' },
                    maxPrice:       { $max: '$price_idr' },
                    totalListings:  { $sum: 1 }
                }
            },
            { $sort: { avgPricePerM2: -1 } },
            { $limit: 20 }
        ]);

        // Distribusi harga per m² dalam 4 bracket
        const allProps = await Property.find({ land_size_m2: { $gt: 0 }, price_idr: { $gt: 0 } });
        const brackets = [
            { label: '<10jt',   min: 0,          max: 10_000_000,  count: 0 },
            { label: '10-30jt', min: 10_000_000, max: 30_000_000,  count: 0 },
            { label: '30-50jt', min: 30_000_000, max: 50_000_000,  count: 0 },
            { label: '>50jt',   min: 50_000_000, max: Infinity,    count: 0 }
        ];
        allProps.forEach(p => {
            const ppm2 = p.price_idr / p.land_size_m2;
            const b = brackets.find(b => ppm2 >= b.min && ppm2 < b.max);
            if (b) b.count++;
        });

        res.json({ rankingKecamatan, priceDistribution: brackets });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CSV — tidak berubah, sudah benar. Sekarang bisa jalan karena server hidup
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/export-list', (req, res) => {
    try {
        const models = mongoose.modelNames().filter(m => !m.startsWith('__'));
        res.json(models.map(name => ({ id: name.toLowerCase(), name, label: `Database ${name}` })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/data/:model', async (req, res) => {
    try {
        const targetName = mongoose.modelNames().find(
            m => m.toLowerCase() === req.params.model.toLowerCase()
        );
        if (!targetName) return res.status(404).json({ error: 'Model tidak ditemukan' });
        const data = await mongoose.model(targetName).find().lean();
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;