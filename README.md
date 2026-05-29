# ✈️ AeroPulse: Sistema de Gestión y Análisis de Aeropuertos

[![Node.js](https://img.shields.io/badge/Node.js-18.x-6DB33F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-7.0-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Orchestrated-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

## 📋 ¿De Qué Se Trata Este Proyecto?

**AeroPulse** es una aplicación web completa para **gestionar, consultar y analizar información de aeropuertos** a nivel mundial. El sistema está diseñado con una arquitectura moderna que combina:

- **MongoDB**: Almacena información detallada de cada aeropuerto (nombre, ubicación, códigos IATA/ICAO, altitud, zona horaria)
- **Redis GEO**: Realiza búsquedas de proximidad ultrarrápidas para encontrar aeropuertos cercanos
- **Redis Popularity**: Rastrea estadísticas de visitas y proporciona rankings en tiempo real del Top 10
- **Express.js + Node.js**: Backend API que expone endpoints REST
- **Frontend**: Interfaz web para interactuar con los datos
- **Docker**: Todo contenedorizado para un despliegue sencillo

**Objetivo**: Proporcionar una plataforma escalable para explorar, gestionar y analizar datos de aeropuertos con búsquedas rápidas y análisis de popularidad.

---

## 🏗️ Arquitectura del Sistema

El proyecto está compuesto por 4 servicios principales en contenedores interconectados:

```
┌─────────────────────────────────────┐
│   Frontend (HTML/CSS/JavaScript)    │
│     Puerto: 3000                    │
└──────────────┬──────────────────────┘
               │
               │ (Requests HTTP)
               ▼
┌──────────────────────────────────────┐
│  Backend Express.js + Node.js        │
│     Puerto: 3000                     │
│  ├─ server.js (configuración)        │
│  ├─ routes/airports.js (rutas)       │
│  └─ seed.js (carga inicial)          │
└──┬─────────────┬─────────────────────┘
   │             │
   ▼             ▼
┌──────────────┐ ┌──────────────────────────────────┐
│   MongoDB    │ │  Redis (Dual Instance)           │
│ Puerto 27017 │ │  ├─ redis-geo:6379 (Geospatial) │
│              │ │  └─ redis-pop:6380 (Popularidad)│
└──────────────┘ └──────────────────────────────────┘
```

---

## 📊 Características Principales

| Característica | Descripción |
|---|---|
| **Gestión de Aeropuertos** | Crear, leer, actualizar y eliminar información de aeropuertos |
| **Búsqueda de Proximidad** | Encontrar aeropuertos cercanos usando Redis GEO |
| **Rankings de Popularidad** | Top 10 de aeropuertos más visitados en tiempo real |
| **API RESTful** | Endpoints para todas las operaciones CRUD |
| **Persistencia de Datos** | MongoDB almacena información de forma permanente |
| **Caché Distribuido** | Redis proporciona búsquedas ultrarrápidas |
| **Dockerizado** | Fácil despliegue con Docker Compose |

---

## 🚀 Instrucciones de Ejecución - Paso a Paso

### Requisitos Previos

Asegúrate de tener instalados:
- **Docker** (descargar desde https://www.docker.com/)
- **Docker Compose** (generalmente incluido con Docker Desktop)
- Puertos disponibles: `3000`, `27017`, `6379`, `6380`

### PASO 1: Navegar a la Carpeta del Proyecto

```bash
cd Airports
```

### PASO 2: Iniciar los Servicios con Docker Compose

```bash
docker-compose up --build
```

**¿Qué ocurre aquí?**
- Docker descarga las imágenes de MongoDB y Redis
- Compila la imagen del backend desde el `Dockerfile`
- Inicia 4 contenedores:
  - **MongoDB**: Base de datos (puerto 27017)
  - **Redis GEO**: Índices geoespaciales (puerto 6379)
  - **Redis POP**: Estadísticas de popularidad (puerto 6380)
  - **Backend API**: Servidor Express (puerto 3000)
- Carga automáticamente datos iniciales desde `data_trasport.json`

**Ejemplo de salida esperada:**
```
mongo-heroes | ...
redis-geo   | Ready to accept connections
redis-pop   | Ready to accept connections
airport-backend | Connected to MongoDB successfully.
airport-backend | Connected to Redis GEO at redis-geo:6379
airport-backend | Connected to Redis Popularity at redis-pop:6380
airport-backend | Server running on port 3000
```

### PASO 3: Esperar a que Todo Esté Listo

Espera a ver todos los mensajes de conexión. **Esto puede tomar 30-60 segundos la primera vez**.

### PASO 4: Acceder a la Aplicación

Abre tu navegador web en:
```
http://localhost:8080
```

### PASO 5: Interactuar con la Aplicación

**En el Frontend:**
- Ver lista de aeropuertos
- Buscar aeropuertos populares
- Agregar nuevos aeropuertos
- Ver estadísticas de visitas

**Endpoints de API (para pruebas con Postman/curl):**

```bash
# Obtener todos los aeropuertos
curl http://localhost:3000/airports

# Obtener Top 10 más populares
curl http://localhost:3000/airports/popular

# Obtener detalles de un aeropuerto específico
curl http://localhost:3000/airports/JFK
```

### PASO 6: Detener los Servicios

Presiona **`Ctrl + C`** en la terminal

Para detener y limpiar completamente:
```bash
docker-compose down
```

Para eliminar también los datos almacenados:
```bash
docker-compose down -v
```

---

## 📚 API REST - Endpoints Disponibles

| Método | Endpoint | Descripción | Ejemplo |
|--------|----------|-------------|---------|
| **GET** | `/airports` | Lista todos los aeropuertos | `GET /airports` |
| **GET** | `/airports/popular` | Top 10 más visitados | `GET /airports/popular` |
| **GET** | `/airports/:iata` | Detalle de un aeropuerto | `GET /airports/JFK` |
| **POST** | `/airports` | Crear nuevo aeropuerto | `POST /airports` (con JSON) |
| **PUT** | `/airports/:iata` | Actualizar aeropuerto | `PUT /airports/JFK` (con JSON) |
| **DELETE** | `/airports/:iata` | Eliminar aeropuerto | `DELETE /airports/JFK` |

---

## 🔬 Tecnologías Utilizadas

* **Backend**: Node.js, Express, Mongoose (MongoDB ODM), ioredis (Redis Client).
* **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism & Neon Design System), Leaflet.js, Leaflet.markercluster, FontAwesome 6, Google Fonts (Outfit).
* **Bases de Datos**: MongoDB 6.0, Redis 7.0 (GEO & Analytics).
* **Orquestación**: Docker, Docker Compose (Multi-container orchestration).
