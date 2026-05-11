const mongoose = require('mongoose');
require('dotenv').config();
const Property = require('./models/Property');

async function checkStats() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const stats = await Property.aggregate([
            { $group: { _id: '$city', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        console.log('DISTRIBUSI DATA PER KOTA:');
        console.log(JSON.stringify(stats, null, 2));
        
        const total = await Property.countDocuments();
        console.log('\nTOTAL DATA:', total);
        
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkStats();
