const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const Property = require('./models/Property');
const Agent = require('./models/Agent');
const Location = require('./models/Location');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE CONNECTION (Serverless Optimized)
// ─────────────────────────────────────────────────────────────────────────────
let isConnected = false;
async function connectDB() {
    if (isConnected) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ DB Connection error:', err.message);
    }
}

// Initial connect
connectDB();

// ─────────────────────────────────────────────────────────────────────────────
// CORE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        await connectDB();
        const count = await Property.countDocuments();
        res.json({ status: 'ok', db: 'connected', propertyCount: count });
    } catch (e) { res.json({ status: 'error', message: e.message }); }
});

// Root
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads'),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD COMBINED — TARGET < 2S
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/dashboard-combined', async (req, res) => {
    try {
        await connectDB();
        const { range, agent } = req.query;
        let dateFilter = {};
        const now = new Date();
        
        // Gunakan rentang waktu relatif agar tidak bentrok dengan zona waktu server Vercel
        if (range === 'day') {
            // Terjual dalam 24 jam terakhir (Realtime untuk semua zona waktu)
            dateFilter = { sold_at: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } };
        } else if (range === 'week') {
            dateFilter = { sold_at: { $gte: new Date(now.getTime() - 7 * 86400000) } };
        } else if (range === 'month') {
            dateFilter = { sold_at: { $gte: new Date(now.getTime() - 30 * 86400000) } };
        } else if (range === 'year') {
            dateFilter = { sold_at: { $gte: new Date(now.getTime() - 365 * 86400000) } };
        }

        // Jalankan semua query secara paralel untuk kecepatan maksimal
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
            Property.countDocuments().lean(),
            Agent.countDocuments().lean(),
            Property.countDocuments({ status: 'Tersedia' }).lean(),
            Property.aggregate([
                { $match: { status: 'Terjual', ...dateFilter, ...(agent ? { agent_name: agent } : {}) } },
                { $group: { _id: null, units: { $sum: 1 }, revenue: { $sum: '$price_idr' } } }
            ]),
            Property.aggregate([
                { $group: { _id: '$city', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Property.aggregate([
                { $match: { status: 'Terjual', ...dateFilter } },
                { $group: { _id: '$agent_name', soldUnits: { $sum: 1 }, totalRevenue: { $sum: '$price_idr' } } },
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
// PROPERTIES
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/properties', async (req, res) => {
    try {
        await connectDB();
        const { city, district, status, range, limit } = req.query;
        let query = {};
        if (city) query.city = new RegExp(city, 'i');
        if (district) query.district = new RegExp(district, 'i');
        if (status) query.status = status;
        
        if (range && range !== 'all') {
            const now = new Date();
            if (range === 'day') {
                query.sold_at = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
            } else if (range === 'week') {
                query.sold_at = { $gte: new Date(now.getTime() - 7 * 86400000) };
            } else if (range === 'month') {
                query.sold_at = { $gte: new Date(now.getTime() - 30 * 86400000) };
            } else if (range === 'year') {
                query.sold_at = { $gte: new Date(now.getTime() - 365 * 86400000) };
            }
        }
        
        const props = await Property.find(query).sort({ scraped_at: -1 }).limit(Number(limit) || 100).lean();
        res.json(props);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/properties/:id', async (req, res) => {
    try {
        await connectDB();
        const prop = await Property.findById(req.params.id).lean();
        res.json(prop);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/properties', async (req, res) => {
    try { await connectDB(); res.json(await new Property(req.body).save()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/properties/:id', async (req, res) => {
    try { await connectDB(); res.json(await Property.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/properties/:id', async (req, res) => {
    try { await connectDB(); await Property.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENTS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/agents', async (req, res) => {
    try { await connectDB(); res.json(await Agent.find().sort({ name: 1 }).lean()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents', async (req, res) => {
    try { await connectDB(); res.json(await new Agent(req.body).save()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agents/:id', async (req, res) => {
    try { await connectDB(); res.json(await Agent.findById(req.params.id).lean()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/:id', async (req, res) => {
    try { await connectDB(); res.json(await Agent.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/:id', async (req, res) => {
    try { await connectDB(); await Agent.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/locations', async (req, res) => {
    try { await connectDB(); res.json(await Location.find().sort({ city: 1, district: 1 }).lean()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT LIST
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/export-list', (req, res) => {
    try {
        const models = mongoose.modelNames().filter(m => !m.startsWith('__'));
        res.json(models.map(name => ({ id: name.toLowerCase(), name, label: `Database ${name}` })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/data/:model', async (req, res) => {
    try {
        await connectDB();
        const targetName = mongoose.modelNames().find(m => m.toLowerCase() === req.params.model.toLowerCase());
        if (!targetName) return res.status(404).json({ error: 'Model tidak ditemukan' });
        res.json(await mongoose.model(targetName).find().lean());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listen only in dev
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}

module.exports = app;