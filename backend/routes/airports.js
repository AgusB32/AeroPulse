const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Define Airport Schema
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

// Helper function to get Redis clients
const getRedisClients = (req) => {
  return {
    redisGeo: req.app.get('redisGeo'),
    redisPop: req.app.get('redisPop')
  };
};

/**
 * GET /airports/popular
 * Returns top 10 most visited airports from redis-pop
 */
router.get('/popular', async (req, res) => {
  try {
    const { redisPop } = getRedisClients(req);
    if (!redisPop) {
      return res.status(500).json({ message: 'Redis Popularity service not available' });
    }

    // ZRANGE key start stop REV WITHSCORES
    // 0 to 9 gets the top 10 (0-indexed)
    const result = await redisPop.zrange('airport_popularity', 0, 9, 'REV', 'WITHSCORES');
    
    if (!result || result.length === 0) {
      return res.json([]);
    }

    const popularList = [];
    for (let i = 0; i < result.length; i += 2) {
      const iata = result[i];
      const score = parseInt(result[i + 1], 10);
      popularList.push({ iata_faa: iata.toUpperCase(), visits: score });
    }

    const iatas = popularList.map(p => p.iata_faa);
    const dbAirports = await Airport.find({ iata_faa: { $in: iatas } });

    const dbMap = {};
    dbAirports.forEach(airport => {
      if (airport.iata_faa) {
        dbMap[airport.iata_faa.toUpperCase()] = airport;
      }
    });

    const response = popularList.map(p => {
      const dbData = dbMap[p.iata_faa];
      return {
        iata_faa: p.iata_faa,
        visits: p.visits,
        airport: dbData || { name: 'Unknown Airport', city: 'Unknown', lat: 0, lng: 0 }
      };
    });

    res.json(response);
  } catch (error) {
    console.error('Error fetching popular airports:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /airports/nearby
 * Searches nearby airports in redis-geo using GEORADIUS
 */
router.get('/nearby', async (req, res) => {
  try {
    const { redisGeo } = getRedisClients(req);
    if (!redisGeo) {
      return res.status(500).json({ message: 'Redis GEO service not available' });
    }

    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius); // in km

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      return res.status(400).json({ message: 'Parameters lat, lng, and radius (in km) must be numbers' });
    }

    // GEORADIUS airports-geo lng lat radius km WITHDIST ASC
    const results = await redisGeo.georadius('airports-geo', lng, lat, radius, 'km', 'WITHDIST', 'ASC');

    if (!results || results.length === 0) {
      return res.json([]);
    }

    const nearbyList = results.map(r => ({
      iata_faa: r[0].toUpperCase(),
      distance: parseFloat(r[1])
    }));

    const iatas = nearbyList.map(n => n.iata_faa);
    const dbAirports = await Airport.find({ iata_faa: { $in: iatas } });

    const dbMap = {};
    dbAirports.forEach(airport => {
      if (airport.iata_faa) {
        dbMap[airport.iata_faa.toUpperCase()] = airport;
      }
    });

    const response = nearbyList
      .map(n => {
        const dbData = dbMap[n.iata_faa];
        return {
          iata_faa: n.iata_faa,
          distance: n.distance,
          airport: dbData || null
        };
      })
      .filter(item => item.airport !== null);

    res.json(response);
  } catch (error) {
    console.error('Error searching nearby airports:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /airports
 * Creates a new airport in MongoDB and adds to Redis GEO
 */
router.post('/', async (req, res) => {
  try {
    const { redisGeo } = getRedisClients(req);
    const airportData = req.body;

    const newAirport = new Airport(airportData);
    await newAirport.save();

    if (newAirport.iata_faa && newAirport.iata_faa.trim() && newAirport.lng != null && newAirport.lat != null) {
      const iata = newAirport.iata_faa.trim().toUpperCase();
      if (redisGeo) {
        await redisGeo.geoadd('airports-geo', newAirport.lng, newAirport.lat, iata);
      }
    }

    res.status(201).json(newAirport);
  } catch (error) {
    console.error('Error creating airport:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /airports
 * Returns list of all airports from MongoDB
 */
router.get('/', async (req, res) => {
  try {
    const airports = await Airport.find({});
    res.json(airports);
  } catch (error) {
    console.error('Error fetching airports:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /airports/:iata_code
 * Returns single airport, increments visits (+1) and sets TTL in redis-pop
 */
router.get('/:iata_code', async (req, res) => {
  try {
    const { redisPop } = getRedisClients(req);
    const iata = req.params.iata_code.trim().toUpperCase();

    const airport = await Airport.findOne({ iata_faa: iata });
    if (!airport) {
      return res.status(404).json({ message: `Airport with code ${iata} not found` });
    }

    if (redisPop) {
      // ZINCRBY airport_popularity 1 iata_code
      await redisPop.zincrby('airport_popularity', 1, iata);
      // EXPIRE airport_popularity 86400
      await redisPop.expire('airport_popularity', 86400);
    }

    res.json(airport);
  } catch (error) {
    console.error('Error fetching airport details:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /airports/:iata_code
 * Updates an airport in MongoDB and syncs coordinates in Redis GEO
 */
router.put('/:iata_code', async (req, res) => {
  try {
    const { redisGeo } = getRedisClients(req);
    const iata = req.params.iata_code.trim().toUpperCase();
    const updateData = req.body;

    const updatedAirport = await Airport.findOneAndUpdate(
      { iata_faa: iata },
      updateData,
      { new: true }
    );

    if (!updatedAirport) {
      return res.status(404).json({ message: `Airport with code ${iata} not found` });
    }

    // Sync to Redis GEO if coordinates are updated
    if (updatedAirport.lng != null && updatedAirport.lat != null) {
      if (redisGeo) {
        await redisGeo.geoadd('airports-geo', updatedAirport.lng, updatedAirport.lat, iata);
      }
    }

    res.json(updatedAirport);
  } catch (error) {
    console.error('Error updating airport:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /airports/:iata_code
 * Deletes airport from MongoDB, Redis GEO, and Redis Popularity
 */
router.delete('/:iata_code', async (req, res) => {
  try {
    const { redisGeo, redisPop } = getRedisClients(req);
    const iata = req.params.iata_code.trim().toUpperCase();

    const deletedAirport = await Airport.findOneAndDelete({ iata_faa: iata });
    if (!deletedAirport) {
      return res.status(404).json({ message: `Airport with code ${iata} not found` });
    }

    // Remove from Redis GEO (it is a sorted set internally under the hood)
    if (redisGeo) {
      await redisGeo.zrem('airports-geo', iata);
    }

    // Remove from Redis Popularity ZSET
    if (redisPop) {
      await redisPop.zrem('airport_popularity', iata);
    }

    res.json({ message: `Airport ${iata} deleted successfully`, airport: deletedAirport });
  } catch (error) {
    console.error('Error deleting airport:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  Airport
};
