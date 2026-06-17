const fs = require('fs');
const path = require('path');
const Airport = require('./models/Airport');

// Datos del aeroclub de prueba
const larroqueData = {
  name: "Aeroclub Larroque",
  city: "Larroque, Entre Ríos, Argentina",
  iata_faa: "LRQ",
  icao: "SALR",
  lat: -33.034355,
  lng: -59.001217,
  alt: 82,
  tz: "America/Argentina/Buenos_Aires"
};

/**
 * Carga inicial (Seeding) de datos en MongoDB y Redis GEO
 */
async function seedData(redisGeo) {
  try {
    // Si la colección de MongoDB está vacía, iniciamos el seeding
    const count = await Airport.countDocuments();

    if (count === 0) {
      console.log('Colección vacía. Iniciando carga inicial...');

      const filePath = path.join(__dirname, 'data_trasport.json');
      if (!fs.existsSync(filePath)) {
        const fallbackPath = path.join(__dirname, '..', 'data_trasport.json');
        if (fs.existsSync(fallbackPath)) {
          await executeSeed(fallbackPath, redisGeo);
        } else {
          console.error('[Seeding Error] No se encontró el archivo de datos.');
        }
      } else {
        await executeSeed(filePath, redisGeo);
      }
    } else {
      console.log('La colección ya contiene datos. Omitiendo seeding.');
    }

    // Siempre garantizamos la presencia de Aeroclub Larroque (LRQ)
    const larroqueExists = await Airport.findOne({ iata_faa: "LRQ" });
    if (!larroqueExists) {
      const larroque = new Airport(larroqueData);
      await larroque.save();

      if (redisGeo) {
        await redisGeo.geoadd('airports-geo', larroqueData.lng, larroqueData.lat, "LRQ");
      }
    } else {
      if (redisGeo) {
        await redisGeo.geoadd('airports-geo', larroqueData.lng, larroqueData.lat, "LRQ");
      }
    }
  } catch (error) {
    console.error('[Seeding Error] Error al verificar la base de datos:', error);
  }
}

/**
 * Parsea el archivo JSON de aeropuertos e indexa en MongoDB y Redis GEO
 */
async function executeSeed(filePath, redisGeo) {
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');

    // Convertir bloques de JSON contiguos a un array estándar
    const formattedContent = '[' + rawContent.trim().replace(/\}\s*\{/g, '},{') + ']';
    const airports = JSON.parse(formattedContent);

    // Inserción masiva en MongoDB
    await Airport.insertMany(airports);
    console.log(`Insertados ${airports.length} aeropuertos en MongoDB.`);

    // Indexación por lotes en Redis GEO (usando Pipeline)
    const pipeline = redisGeo.pipeline();
    let geoIndexedCount = 0;

    for (const airport of airports) {
      if (
        airport.iata_faa &&
        airport.iata_faa.trim() &&
        airport.lng != null &&
        airport.lat != null &&
        !isNaN(parseFloat(airport.lng)) &&
        !isNaN(parseFloat(airport.lat))
      ) {
        const iata = airport.iata_faa.trim().toUpperCase();
        const lng = parseFloat(airport.lng);
        const lat = parseFloat(airport.lat);

        pipeline.geoadd('airports-geo', lng, lat, iata);
        geoIndexedCount++;
      }
    }

    if (geoIndexedCount > 0) {
      await pipeline.exec();
      console.log(`Indexados ${geoIndexedCount} elementos en Redis GEO.`);
    }
  } catch (error) {
    console.error('[Seeding Error] Error al ejecutar importación:', error);
  }
}

module.exports = seedData;
