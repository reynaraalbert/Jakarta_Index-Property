const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  agent_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Agent', agentSchema);
