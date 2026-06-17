const mongoose = require('mongoose');

// =========================================================================
// ESQUEMA Y MODELO DE MONGODB (Mongoose ODM)
// =========================================================================
const airportSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String },
  iata_faa: { type: String, index: true },
  icao: { type: String },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  alt: { type: Number },
  tz: { type: String }
});

const Airport = mongoose.model('Airport', airportSchema);

module.exports = Airport;
