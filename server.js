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
        
        // Untuk filter waktu: sertakan properti yang sold_at-nya null (data lama/import)
        // sehingga properti Terjual tanpa tanggal tetap terhitung di semua range
        if (range === 'day') {
            dateFilter = { $or: [
                { sold_at: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
                { sold_at: null }, { sold_at: { $exists: false } }
            ]};
        } else if (range === 'week') {
            dateFilter = { $or: [
                { sold_at: { $gte: new Date(now.getTime() - 7 * 86400000) } },
                { sold_at: null }, { sold_at: { $exists: false } }
            ]};
        } else if (range === 'month') {
            dateFilter = { $or: [
                { sold_at: { $gte: new Date(now.getTime() - 30 * 86400000) } },
                { sold_at: null }, { sold_at: { $exists: false } }
            ]};
        } else if (range === 'year') {
            dateFilter = { $or: [
                { sold_at: { $gte: new Date(now.getTime() - 365 * 86400000) } },
                { sold_at: null }, { sold_at: { $exists: false } }
            ]};
        }

        // Jalankan semua query secara paralel untuk kecepatan maksimal
        const [
            total,
            totalAgents,
            available,
            soldStats,
            cityStats,
            soldByCityStats,
            agentPerf,
            rankingKecamatan,
            priceBuckets
        ] = await Promise.all([
            Property.countDocuments().lean(),
            Agent.countDocuments().lean(),
            Property.countDocuments({ status: 'Tersedia' }).lean(),
            // Revenue & sold units (filtered by agent & date)
            Property.aggregate([
                { $match: { status: 'Terjual', ...dateFilter, ...(agent ? { agent_name: agent } : {}) } },
                { $group: { _id: null, units: { $sum: 1 }, revenue: { $sum: '$price_idr' } } }
            ]),
            // Total listing per kota (untuk dashboard overview)
            Property.aggregate([
                { $group: { _id: '$city', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            // FIX BUG 2: Unit TERJUAL per kota, difilter berdasarkan dateFilter & agent
            Property.aggregate([
                { $match: { status: 'Terjual', ...dateFilter, ...(agent ? { agent_name: agent } : {}) } },
                { $group: { _id: '$city', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            // Performa agen
            Property.aggregate([
                { $match: { status: 'Terjual', ...dateFilter } },
                { $group: { _id: '$agent_name', soldUnits: { $sum: 1 }, totalRevenue: { $sum: '$price_idr' } } },
                { $sort: { totalRevenue: -1 } },
                { $limit: 10 }
            ]),
            // FIX BUG 3: Ranking kecamatan — hanya tampilkan district yang valid (match di Location collection)
            Property.aggregate([
                { $match: { land_size_m2: { $gt: 0 }, price_idr: { $gt: 0 } } },
                {
                    $lookup: {
                        from: 'locations',
                        let: { propCity: { $toLower: '$city' }, propDistrict: { $toLower: '$district' } },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [{ $toLower: '$city' }, '$$propCity'] },
                                            { $eq: [{ $toLower: '$district' }, '$$propDistrict'] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: 'kecamatanMatch'
                    }
                },
                // Hanya properti yang district-nya terdaftar sebagai kecamatan di Location
                { $match: { kecamatanMatch: { $ne: [] } } },
                { $group: { _id: '$district', avgPricePerM2: { $avg: { $divide: ['$price_idr', '$land_size_m2'] } }, minPrice: { $min: '$price_idr' }, maxPrice: { $max: '$price_idr' }, totalListings: { $sum: 1 } } },
                { $sort: { avgPricePerM2: -1 } },
                { $limit: 20 }
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
            stats: { total, totalAgents, soldUnits: currentSold.units, available, revenue: currentSold.revenue, cityStats, soldByCityStats, agentPerformance: agentPerf },
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
        const { city, district, status, range, limit, search, minPrice, maxPrice, maxLand } = req.query;
        let query = {};
        if (city) query.city = new RegExp(city, 'i');
        if (district) query.district = new RegExp(district, 'i');
        if (status) query.status = status;
        if (search) query.$or = [
            { title: new RegExp(search, 'i') },
            { notes: new RegExp(search, 'i') }
        ];
        if (minPrice || maxPrice) {
            query.price_idr = {};
            if (minPrice) query.price_idr.$gte = Number(minPrice);
            if (maxPrice) query.price_idr.$lte = Number(maxPrice);
        }
        if (maxLand) query.land_size_m2 = { $lte: Number(maxLand) };
        
        if (range && range !== 'all') {
            const now = new Date();
            let cutoff;
            if (range === 'day')   cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            else if (range === 'week')  cutoff = new Date(now.getTime() - 7 * 86400000);
            else if (range === 'month') cutoff = new Date(now.getTime() - 30 * 86400000);
            else if (range === 'year')  cutoff = new Date(now.getTime() - 365 * 86400000);
            
            if (cutoff) {
                // Sertakan juga properti Terjual yang sold_at-nya tidak ada (data lama/import)
                query.$or = [
                    { sold_at: { $gte: cutoff } },
                    { sold_at: null },
                    { sold_at: { $exists: false } }
                ];
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