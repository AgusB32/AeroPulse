const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Airport = require('../models/Airport');

// Helper function to get Redis clients
const getRedisClients = (req) => {
  return {
    redisGeo: req.app.get('redisGeo'),
    redisPop: req.app.get('redisPop')
  };
};

/**
 * Combina Redis y MongoDB:
 * 1. Redis Popularity (`redisPop`) nos da el Top 10 de códigos IATA y sus puntajes de visitas.
 * 2. MongoDB (`Airport.find`) busca los detalles de esos 10 códigos usando una consulta $in.
 */
router.get('/popular', async (req, res) => {
  try {
    const { redisPop } = getRedisClients(req);
    if (!redisPop) {
      return res.status(500).json({ message: 'Redis Popularity service not available' });
    }


    const result = await redisPop.zrange('airport_popularity', 0, 9, 'REV', 'WITHSCORES');

    if (!result || result.length === 0) {
      return res.json([]);
    }

    // Convertimos la respuesta lineal de Redis [IATA1, SCORE1, IATA2, SCORE2...] en un array estructurado
    const popularList = [];
    for (let i = 0; i < result.length; i += 2) {
      const iata = result[i];
      const score = parseInt(result[i + 1], 10);
      popularList.push({ iata_faa: iata.toUpperCase(), visits: score });
    }

    // EXPLICACIÓN MONGODB: Consultamos todos los aeropuertos populares de una sola vez.
    // Usamos el operador $in pasándole la lista de códigos IATA que sacamos de Redis.
    const iatas = popularList.map(p => p.iata_faa);
    const dbAirports = await Airport.find({ iata_faa: { $in: iatas } });

    // Mapeamos los datos de MongoDB en un diccionario para asociarlos rápidamente con las visitas de Redis
    const dbMap = {};
    dbAirports.forEach(airport => {
      if (airport.iata_faa) {
        dbMap[airport.iata_faa.toUpperCase()] = airport;
      }
    });

    // Combinamos las estadísticas de visitas (de Redis) con el perfil detallado (de MongoDB)
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
 * =========================================================================
 * GET /airports/nearby -> BÚSQUEDA GEOGRÁFICA DE PROXIMIDAD
 * =========================================================================
 * 1. Redis GEO busca en memoria los códigos IATA dentro de un radio de Km.
 * 2. MongoDB provee la información descriptiva de esos aeropuertos encontrados.
 */
router.get('/nearby', async (req, res) => {
  try {
    const { redisGeo } = getRedisClients(req);
    if (!redisGeo) {
      return res.status(500).json({ message: 'Redis GEO service not available' });
    }

    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius); // Radio de búsqueda en Km

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      return res.status(400).json({ message: 'Parameters lat, lng, and radius (in km) must be numbers' });
    }

    // EXPLICACIÓN REDIS: 'GEORADIUS' busca elementos indexados geoespacialmente.
    // Le pasamos la clave, longitud, latitud, radio, unidad de medida ('km'),
    // e indicamos que traiga la distancia física ('WITHDIST') ordenada de menor a mayor ('ASC').
    const results = await redisGeo.georadius('airports-geo', lng, lat, radius, 'km', 'WITHDIST', 'ASC');

    if (!results || results.length === 0) {
      return res.json([]);
    }

    // Estructuramos la lista de aeropuertos cercanos y sus distancias
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

    // Filtramos e integramos la distancia calculada por Redis y el documento de MongoDB
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
 * =========================================================================
 * POST /airports -> REGISTRAR UN NUEVO AEROPUERTO
 * =========================================================================
 * 1. Crea y guarda el registro completo en MongoDB.
 * 2. Registra las coordenadas en Redis GEO para habilitar búsquedas cercanas.
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
 * =========================================================================
 * GET /airports -> OBTENER TODOS LOS AEROPUERTOS (R)
 * =========================================================================
 * Consulta directamente MongoDB para traer la lista completa.
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
 * =========================================================================
 * GET /airports/:iata_code -> OBTENER DETALLE E INCREMENTAR VISITAS (R)
 * =========================================================================
 * 1. Busca el aeropuerto en MongoDB por su código IATA.
 * 2. Incrementa el contador de visitas en Redis Popularidad y renueva el TTL (tiempo de vida).
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
      await redisPop.zincrby('airport_popularity', 1, iata);
      await redisPop.expire('airport_popularity', 86400);
    }

    res.json(airport);
  } catch (error) {
    console.error('Error fetching airport details:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * =========================================================================
 * PUT /airports/:iata_code -> ACTUALIZAR AEROPUERTO (U)
 * =========================================================================
 * 1. Actualiza los datos en MongoDB.
 * 2. Sincroniza las coordenadas en Redis GEO.
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

    // Si se actualizaron las coordenadas geográficas, las volvemos a guardar en Redis GEO
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
 * =========================================================================
 * DELETE /airports/:iata_code -> ELIMINAR AEROPUERTO (D)
 * =========================================================================
 * 1. Elimina el documento de la colección en MongoDB.
 * 2. Limpia los registros asociados de Redis GEO y Redis Popularity.
 */
router.delete('/:iata_code', async (req, res) => {
  try {
    const { redisGeo, redisPop } = getRedisClients(req);
    const iata = req.params.iata_code.trim().toUpperCase();
    const deletedAirport = await Airport.findOneAndDelete({ iata_faa: iata });
    if (!deletedAirport) {
      return res.status(404).json({ message: `Airport with code ${iata} not found` });
    }
    if (redisGeo) {
      await redisGeo.zrem('airports-geo', iata);
    }

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
