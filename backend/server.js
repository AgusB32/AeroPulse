const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const { router } = require('./routes/airports');
const seedData = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Conexión a MongoDB (usando Mongoose)
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/airport_db';
mongoose.connect(mongoUri)
  .then(() => console.log('Conectado a MongoDB.'))
  .catch(err => console.error('Error MongoDB:', err));

// Instancia 1: Redis GEO (Puerto 6379) para búsquedas geoespaciales
const redisGeoHost = process.env.REDIS_GEO_HOST || '127.0.0.1';
const redisGeoPort = parseInt(process.env.REDIS_GEO_PORT || '6379', 10);
const redisGeo = new Redis({
  host: redisGeoHost,
  port: redisGeoPort,
  maxRetriesPerRequest: 3
});
redisGeo.on('connect', () => console.log(`Conectado a Redis GEO en ${redisGeoHost}:${redisGeoPort}`));
redisGeo.on('error', (err) => console.error('[Redis GEO Error]', err.message));

// Instancia 2: Redis Popularity (Puerto 6380) para estadísticas
const redisPopHost = process.env.REDIS_POP_HOST || '127.0.0.1';
const redisPopPort = parseInt(process.env.REDIS_POP_PORT || '6380', 10);
const redisPop = new Redis({
  host: redisPopHost,
  port: redisPopPort,
  maxRetriesPerRequest: 3
});
redisPop.on('connect', () => console.log(`Conectado a Redis Popularity en ${redisPopHost}:${redisPopPort}`));
redisPop.on('error', (err) => console.error('[Redis Popularity Error]', err.message));

// Bind Redis clients to Express application context for router access
app.set('redisGeo', redisGeo);
app.set('redisPop', redisPop);

// Register routes
app.use('/airports', router);

// Simple Health Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
    redisGeo: redisGeo.status === 'ready' ? 'CONNECTED' : 'DISCONNECTED',
    redisPop: redisPop.status === 'ready' ? 'CONNECTED' : 'DISCONNECTED'
  });
});

// Start Express Listener
app.listen(PORT, async () => {
  console.log(`\n======================================================`);
  console.log(`[Express] Airport REST API is running on port ${PORT}`);
  console.log(`======================================================\n`);
  
  // Trigger initial database seeding
  await seedData(redisGeo);
});
