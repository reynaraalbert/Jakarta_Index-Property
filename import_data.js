const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Property = require('./models/Property');
const Agent = require('./models/Agent');
const Location = require('./models/Location');
require('dotenv').config();

// Mapping NJOP per m2 (Estimasi kasar Jakarta)
const njopMapping = {
    "Menteng": 55000000,
    "Pondok Indah": 45000000,
    "Kebayoran Baru": 40000000,
    "Kemang": 25000000,
    "Tebet": 20000000,
    "Kelapa Gading": 22000000,
    "Puri Indah": 18000000,
    "Tanjung Duren Utara": 15000000,
    "Cempaka Putih": 14000000,
    "Cibubur": 8000000,
    "default": 10000000
};

const dummyNotes = [
    "Kawasan elit, keamanan 24 jam, bebas banjir.",
    "Dekat dengan pusat perbelanjaan dan akses tol.",
    "Sangat cocok untuk investasi atau dijadikan rumah kos.",
    "Lingkungan asri, jalan lebar bisa papasan 2 mobil.",
    "Berada di pinggir jalan raya, cocok untuk ruang usaha/bisnis.",
    "Dekat dengan pemukiman padat penduduk, lokasi sangat strategis.",
    "Bangunan baru, desain modern minimalis, siap huni.",
    "Halaman luas, posisi hook, udara masih segar."
];

const readCSV = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
};

const importData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for import...');

    // 1. Clear existing data
    await Property.deleteMany({});
    await Agent.deleteMany({});
    await Location.deleteMany({});
    console.log('Existing data cleared.');

    // 2. Import Locations
    console.log('Importing locations...');
    const locationData = await readCSV('location.csv');
    const locations = locationData.map(l => ({
        city: l.city,
        district: l.district,
        loc_id: l.loc_id
    }));
    await Location.insertMany(locations);
    console.log(`${locations.length} locations imported.`);

    // 3. Import Agents
    console.log('Importing agents...');
    const agentData = await readCSV('agent.csv');
    const agents = agentData.map(a => ({
        agent_id: a.agent_id,
        name: a.name,
        phone: a.phone,
        email: a.email
    }));
    const savedAgents = await Agent.insertMany(agents);
    console.log(`${savedAgents.length} agents imported.`);

    // 3. Import Properties
    console.log('Importing properties...');
    const propertyData = await readCSV('jakarta_properties_raw.csv');
    
    const results = propertyData.map(data => {
        const district = data.district || "";
        const landSize = parseInt(data.land_size_m2) || 0;
        
        // Hitung NJOP: Luas Tanah x Harga per m2 di daerah itu
        const baseNjop = njopMapping[district] || njopMapping["default"];
        const estimatedNjop = landSize * baseNjop;

        // Random agent from savedAgents
        const randomAgent = savedAgents[Math.floor(Math.random() * savedAgents.length)];

        return {
          title: data.title,
          price_idr: parseFloat(data.price_idr) || 0,
          city: data.city,
          district: district,
          bedrooms: parseInt(data.bedrooms) || 0,
          bathrooms: parseInt(data.bathrooms) || 0,
          garage: parseInt(data.garage) || 0,
          land_size_m2: landSize,
          building_size_m2: parseInt(data.building_size_m2) || 0,
          njop_price: estimatedNjop,
          agent_name: randomAgent.name,
          agent_phone: randomAgent.phone,
          agent_email: randomAgent.email,
          notes: dummyNotes[Math.floor(Math.random() * dummyNotes.length)],
          scraped_at: data.scraped_at ? new Date(data.scraped_at) : new Date()
        };
    });

    const chunkSize = 500;
    for (let i = 0; i < results.length; i += chunkSize) {
      const chunk = results.slice(i, i + chunkSize);
      await Property.insertMany(chunk);
      console.log(`Imported ${i + chunk.length} / ${results.length} properties...`);
    }

    console.log('Data successfully updated with NJOP and Real Agents!');
    process.exit();
  } catch (error) {
    console.error('Error during import:', error);
    process.exit(1);
  }
};

importData();

