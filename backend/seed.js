const fs = require('fs');
const path = require('path');
const { Airport } = require('./routes/airports');

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
 * Seeds data from data_trasport.json into MongoDB and Redis GEO if the MongoDB collection is empty.
 * @param {object} redisGeo - Redis client instance for geo operations
 */
async function seedData(redisGeo) {
  try {
    const count = await Airport.countDocuments();
    
    if (count === 0) {
      console.log('MongoDB "airports" collection is empty. Beginning initial seed process...');
      
      // File path is expected in the root directory (mapped through Docker volume to the app directory)
      const filePath = path.join(__dirname, 'data_trasport.json');
      if (!fs.existsSync(filePath)) {
        console.warn(`[Seeding Warning] data_trasport.json not found at ${filePath}. Attempting fallback paths...`);
        // Try root directory path relative to this file
        const fallbackPath = path.join(__dirname, '..', 'data_trasport.json');
        if (fs.existsSync(fallbackPath)) {
          console.log(`Found data_trasport.json at fallback path: ${fallbackPath}`);
          await executeSeed(fallbackPath, redisGeo);
        } else {
          console.error(`[Seeding Error] Could not find data_trasport.json. Seeding aborted.`);
        }
      } else {
        await executeSeed(filePath, redisGeo);
      }
    } else {
      console.log('MongoDB "airports" collection already has data. Seeding is skipped.');
    }

    // Always ensure Aeroclub Larroque (LRQ) is present in both MongoDB and Redis GEO
    const larroqueExists = await Airport.findOne({ iata_faa: "LRQ" });
    if (!larroqueExists) {
      console.log('Aeroclub Larroque (LRQ) not found in DB. Inserting it explicitly...');
      const larroque = new Airport(larroqueData);
      await larroque.save();
      
      if (redisGeo) {
        await redisGeo.geoadd('airports-geo', larroqueData.lng, larroqueData.lat, "LRQ");
        console.log('Aeroclub Larroque (LRQ) successfully added to Redis GEO!');
      }
    } else {
      // If it exists, make sure it's present in Redis GEO as well just in case
      if (redisGeo) {
        await redisGeo.geoadd('airports-geo', larroqueData.lng, larroqueData.lat, "LRQ");
      }
    }
  } catch (error) {
    console.error('[Seeding Error] Critical error during DB checking:', error);
  }
}

/**
 * Parses and indexes the airport data.
 */
async function executeSeed(filePath, redisGeo) {
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    
    console.log('Parsing concatenated JSON file content...');
    // Replace contiguous JSON blocks with a comma and wrap with square brackets to make it a standard JSON array
    const formattedContent = '[' + rawContent.trim().replace(/\}\s*\{/g, '},{') + ']';
    const airports = JSON.parse(formattedContent);
    console.log(`Successfully parsed ${airports.length} airports!`);

    console.log('Inserting airports into MongoDB...');
    const mongoResult = await Airport.insertMany(airports);
    console.log(`Successfully inserted ${mongoResult.length} airports into MongoDB.`);

    console.log('Syncing airports coordinates to Redis GEO...');
    
    // Use Redis pipeline for optimal performance
    const pipeline = redisGeo.pipeline();
    let geoIndexedCount = 0;

    for (const airport of airports) {
      // Ensure we have coordinates and a valid iata_faa code to index in Redis GEO
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
        
        // GEOADD airports-geo lng lat IATA
        pipeline.geoadd('airports-geo', lng, lat, iata);
        geoIndexedCount++;
      }
    }

    if (geoIndexedCount > 0) {
      console.log(`Executing Redis GEO pipeline for ${geoIndexedCount} members...`);
      await pipeline.exec();
      console.log(`Successfully loaded ${geoIndexedCount} members into Redis GEO (key: "airports-geo").`);
    } else {
      console.warn('[Seeding Warning] No airports were found with valid IATA codes and coordinates.');
    }

    console.log('Initial data seed process completed successfully!');
  } catch (error) {
    console.error('[Seeding Error] Error executing data importation:', error);
  }
}

module.exports = seedData;
