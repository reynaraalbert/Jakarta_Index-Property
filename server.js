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
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const uploadDir = 'public/uploads';
// fs.mkdirSync dihapus karena Vercel menggunakan Read-Only File System

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE CONNECTION
// ─────────────────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
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
app.get('/api/health', async (req, res) => {
    try {
        const count = await Property.countDocuments();
        res.json({ 
            status: 'ok', 
            db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            propertyCount: count
        });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

// Explicitly serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
        
        // Fix: Sort by scraped_at because createdAt doesn't exist in schema
        const props = await Property.find(query).sort({ scraped_at: -1 }).limit(Number(limit) || 100);
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
app.get('/api/dashboard-combined', async (req, res) => {
    try {
        await connectDB(); // WAJIB tersambung dulu
        const { range, agent } = req.query;
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

        const [
            total,
            totalAgents,
            available,
            soldStats,
            cityStats,
            agentPerf,
            rankingKecamatan,
            priceBuckets
        ] = await Promise.all([
            Property.countDocuments(),
            Agent.countDocuments(),
            Property.countDocuments({ status: 'Tersedia' }),
            Property.aggregate([
                { $match: { status: 'Terjual', ...dateFilter, ...(agent ? { agent_name: agent } : {}) } },
                { $group: { _id: null, units: { $sum: 1 }, revenue: { $sum: '$price_idr' } } }
            ]),
            Property.aggregate([
                { $group: { _id: '$city', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Property.aggregate([
                { $match: { status: 'Terjual' } },
                { $group: { _id: '$agent_name', soldUnits: { $sum: 1 }, totalRevenue: { $sum: '$price_idr' }, items: { $push: { title: '$title', price: '$price_idr' } } } },
                { $sort: { totalRevenue: -1 } },
                { $limit: 10 }
            ]),
            Property.aggregate([
                { $match: { land_size_m2: { $gt: 0 }, price_idr: { $gt: 0 } } },
                { $group: { _id: '$district', avgPricePerM2: { $avg: { $divide: ['$price_idr', '$land_size_m2'] } }, minPrice: { $min: '$price_idr' }, maxPrice: { $max: '$price_idr' }, totalListings: { $sum: 1 } } },
                { $sort: { avgPricePerM2: -1 } }, { $limit: 20 }
            ]),
            Property.aggregate([
                { $match: { land_size_m2: { $gt: 0 }, price_idr: { $gt: 0 } } },
                { $bucket: { groupBy: { $divide: ['$price_idr', '$land_size_m2'] }, boundaries: [0, 10000000, 30000000, 50000000, Infinity], default: 'Other', output: { count: { $sum: 1 } } } }
            ])
        ]);

        const currentSold = soldStats[0] || { units: 0, revenue: 0 };
        const priceDist = priceBuckets.map(b => ({ 
            label: b._id === 0 ? '<10jt' : b._id === 10000000 ? '10-30jt' : b._id === 30000000 ? '30-50jt' : '>50jt', 
            count: b.count 
        }));

        res.json({
            stats: { total, totalAgents, soldUnits: currentSold.units, available, revenue: currentSold.revenue, cityStats, agentPerformance: agentPerf },
            analytics: { rankingKecamatan, priceDistribution: priceDist }
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