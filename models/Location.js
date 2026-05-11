const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  city: { type: String, required: true },
  district: { type: String, required: true },
  loc_id: { type: String, unique: true }
});

module.exports = mongoose.model('Location', locationSchema);
