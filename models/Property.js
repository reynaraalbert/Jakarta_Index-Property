const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  price_idr: { type: Number, required: true },
  city: { type: String, required: true },
  district: { type: String, required: true },
  bedrooms: Number,
  bathrooms: Number,
  garage: Number,
  land_size_m2: Number,
  building_size_m2: Number,
  njop_price: Number,
  image_url: { type: String, default: '/uploads/default-house.jpg' },
  agent_name: String,
  agent_phone: String,
  agent_email: String,
  notes: String,
  status: { type: String, enum: ['Tersedia', 'Terjual'], default: 'Tersedia' },
  sold_price: { type: Number, default: 0 },
  sold_at: { type: Date },
  scraped_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Property', propertySchema);
