const API_URL = 'http://localhost:3000/airports';
let map, markerClusterGroup;
let airportMarkersMap = new Map(); // Fast lookup map { IATA => Marker }
let selectedAirportData = null;
let nearbyCircle = null;
let currentLang = 'en';
let currentlySelectedMarker = null;

// Custom Leaflet Marker Icon Generator (Teardrop Airport Pin with nested plane)
function createAirportIcon(iata, isSelected = false) {
  const markerClass = isSelected ? 'custom-airport-marker marker-cyan' : 'custom-airport-marker';

  const htmlContent = `
    <div class="marker-pulse-wrapper">
      <div class="marker-pulse-ring"></div>
      <div class="marker-pulse-ring-delayed"></div>
      <div class="marker-pin-bubble">
        <i class="fa-solid fa-plane"></i>
      </div>
    </div>
  `;

  return L.divIcon({
    html: htmlContent,
    className: markerClass,
    iconSize: [32, 32],
    iconAnchor: [16, 32], /* Point at the bottom center of the pin */
    popupAnchor: [0, -32] /* Open right above the pin */
  });
}

// Gorgeous custom concentric expanding sonar ping animation on map double-click/location zoom
function triggerSonarPing(lat, lng) {
  let currentRadius = 100;
  const maxRadius = 12000;
  const step = 800;

  const sonarPing = L.circle([lat, lng], {
    radius: currentRadius,
    color: '#fbbf24',
    fillColor: '#fbbf24',
    fillOpacity: 0.6,
    weight: 2,
    interactive: false
  }).addTo(map);

  const interval = setInterval(() => {
    currentRadius += step;
    if (currentRadius >= maxRadius) {
      clearInterval(interval);
      map.removeLayer(sonarPing);
    } else {
      sonarPing.setRadius(currentRadius);
      const progress = currentRadius / maxRadius;
      sonarPing.setStyle({
        fillOpacity: 0.6 * (1 - progress),
        opacity: 0.8 * (1 - progress)
      });
    }
  }, 30);
}

const TRANSLATIONS = {
  en: {
    brand_title: "Airports Dashboard",
    tab_popularity: "Popularity",
    tab_nearby: "Nearby",
    tab_details: "Details",
    tab_create: "Add New",
    pop_title: "Top 10 Visited Airports",
    pop_empty: "Fetching analytics. Click on markers or view details of airports to see statistics.",
    pop_no_visits: "No visits yet. Click on markers on the map to trigger hits!",
    pop_visits: "visits",
    near_title: "Geospatial Proximity Search",
    near_lat: "Latitude",
    near_lng: "Longitude",
    near_radius: "Radius",
    near_btn: "Search",
    near_empty: "Double click anywhere on the map to automatically populate coordinates, or input manually above to search.",
    near_found: "Found {count} airports nearby",
    near_away: "km away",
    near_no_results: "No airports found within {radius} km radius of these coordinates.",
    near_searching: "Searching nearby...",
    near_failed: "Geospatial query failed.",
    details_title: "Airport profile",
    details_empty: "No airport selected. Click on a marker on the map or select from list cards to query detailed database record.",
    details_iata: "IATA Code",
    details_icao: "ICAO Code",
    details_lat: "Latitude",
    details_lng: "Longitude",
    details_alt: "Altitude",
    details_tz: "Timezone",
    details_btn_edit: "Edit",
    details_btn_delete: "Delete",
    details_feet: "feet",
    create_title: "Register Airport",
    create_name: "Airport Name *",
    create_city: "City & Country",
    create_iata: "IATA Code *",
    create_icao: "ICAO Code",
    create_lat: "Latitude *",
    create_lng: "Longitude *",
    create_alt: "Altitude (ft)",
    create_tz: "Timezone (tz)",
    create_btn: "Save Airport",
    edit_title: "Edit Airport Profile",
    edit_name: "Airport Name",
    edit_city: "City & Country",
    edit_iata: "IATA Code",
    edit_icao: "ICAO Code",
    edit_lat: "Latitude",
    edit_lng: "Longitude",
    edit_alt: "Altitude (ft)",
    edit_tz: "Timezone (tz)",
    edit_save: "Save Changes",
    edit_cancel: "Cancel",
    toast_coords: "Selected coordinates: {lat}, {lng}",
    toast_reset: "Map view and search parameters successfully reset.",
    toast_connect_err: "Error connecting to Server to fetch airports. Make sure docker-compose services are running.",
    toast_created: "Airport {iata} created successfully!",
    toast_deleted: "Airport {iata} deleted successfully.",
    toast_delete_confirm: "Are you absolutely sure you want to permanently delete airport {iata}? This will delete it from MongoDB, Redis GEO, and Popularity rankings.",
    toast_updated: "Airport {iata} updated successfully!",
    toast_update_err: "Error updating airport profile.",
    toast_valid_coords: "Please input valid numeric coordinates.",
    toast_found_count: "Nearby search found {count} airports!",
    toast_create_err: "Error creating airport.",
    toast_delete_err: "Error deleting airport.",
    toast_geo_err: "Error querying geospatial database.",
    map_tip: "Tip: Double click on the map to set location coordinates for nearby search."
  },
  es: {
    brand_title: "Panel de Aeropuertos",
    tab_popularity: "Popularidad",
    tab_nearby: "Cercanos",
    tab_details: "Detalles",
    tab_create: "Agregar Nuevo",
    pop_title: "Top 10 Aeropuertos Visitados",
    pop_empty: "Cargando análisis. Haz clic en los marcadores o consulta los detalles para ver estadísticas.",
    pop_no_visits: "Sin visitas aún. ¡Haz clic en los marcadores en el mapa para sumar visitas!",
    pop_visits: "visitas",
    near_title: "Búsqueda por Proximidad Geosocial",
    near_lat: "Latitud",
    near_lng: "Longitud",
    near_radius: "Radio",
    near_btn: "Buscar",
    near_empty: "Haz doble clic en el mapa para rellenar coordenadas, o ingrésalas manualmente arriba para buscar.",
    near_found: "Se encontraron {count} aeropuertos cerca",
    near_away: "km de distancia",
    near_no_results: "No se encontraron aeropuertos en un radio de {radius} km de estas coordenadas.",
    near_searching: "Buscando cercanos...",
    near_failed: "La consulta geoespacial falló.",
    details_title: "Perfil del Aeropuerto",
    details_empty: "Ningún aeropuerto seleccionado. Haz clic en un marcador en el mapa o selecciona una tarjeta para consultar la base de datos.",
    details_iata: "Código IATA",
    details_icao: "Código ICAO",
    details_lat: "Latitud",
    details_lng: "Longitud",
    details_alt: "Altitud",
    details_tz: "Zona Horaria",
    details_btn_edit: "Editar",
    details_btn_delete: "Eliminar",
    details_feet: "pies",
    create_title: "Registrar Aeropuerto",
    create_name: "Nombre del Aeropuerto *",
    create_city: "Ciudad y País",
    create_iata: "Código IATA *",
    create_icao: "Código ICAO",
    create_lat: "Latitud *",
    create_lng: "Longitud *",
    create_alt: "Altitud (pies)",
    create_tz: "Zona Horaria (tz)",
    create_btn: "Guardar Aeropuerto",
    edit_title: "Editar Perfil de Aeropuerto",
    edit_name: "Nombre del Aeropuerto",
    edit_city: "Ciudad y País",
    edit_iata: "Código IATA",
    edit_icao: "Código ICAO",
    edit_lat: "Latitud",
    edit_lng: "Longitud",
    edit_alt: "Altitud (pies)",
    edit_tz: "Zona Horaria (tz)",
    edit_save: "Guardar Cambios",
    edit_cancel: "Cancelar",
    toast_coords: "Coordenadas seleccionadas: {lat}, {lng}",
    toast_reset: "La vista del mapa y los parámetros de búsqueda se han restablecido.",
    toast_connect_err: "Error al conectar con el servidor para obtener los aeropuertos. Asegúrate de que los servicios de docker-compose estén corriendo.",
    toast_created: "¡Aeropuerto {iata} creado con éxito!",
    toast_deleted: "Aeropuerto {iata} eliminado con éxito.",
    toast_delete_confirm: "¿Estás absolutamente seguro de que deseas eliminar permanentemente el aeropuerto {iata}? Esto lo eliminará de MongoDB, Redis GEO y el ranking de Popularidad.",
    toast_updated: "¡Aeropuerto {iata} actualizado con éxito!",
    toast_update_err: "Error al actualizar el perfil del aeropuerto.",
    toast_valid_coords: "Por favor, ingresa coordenadas numéricas válidas.",
    toast_found_count: "¡La búsqueda de cercanía encontró {count} aeropuertos!",
    toast_create_err: "Error al crear el aeropuerto.",
    toast_delete_err: "Error al eliminar el aeropuerto.",
    toast_geo_err: "Error al consultar la base de datos geoespacial.",
    map_tip: "Tip: Haz doble clic en el mapa para marcar las coordenadas para la búsqueda de cercanía."
  }
};

function getTranslation(key, params = {}) {
  let text = TRANSLATIONS[currentLang][key] || TRANSLATIONS['en'][key] || key;
  Object.keys(params).forEach(param => {
    text = text.replace(`{${param}}`, params[param]);
  });
  return text;
}

function setLanguage(lang) {
  currentLang = lang;
  document.getElementById('lang-en').classList.toggle('active', lang === 'en');
  document.getElementById('lang-es').classList.toggle('active', lang === 'es');

  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    if (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) {
      elem.innerText = TRANSLATIONS[lang][key];
    }
  });

  const radiusVal = document.getElementById('nearRadius').value;
  updateRadiusLabel(radiusVal);
  refreshDynamicViews();
}

function updateRadiusLabel(value) {
  const label = currentLang === 'en' ? `Radius: ${value} km` : `Radio: ${value} km`;
  document.getElementById('radiusLabel').innerText = label;
}

function refreshDynamicViews() {
  loadPopularAirports();
  if (selectedAirportData) {
    displayAirportDetails(selectedAirportData);
  } else {
    const detailsContainer = document.getElementById('detailsContainer');
    detailsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-info"></i>
        <p data-i18n="details_empty">${getTranslation('details_empty')}</p>
      </div>
    `;
  }
  const mapBadgeSpan = document.querySelector('.map-badge span');
  if (mapBadgeSpan) {
    mapBadgeSpan.innerHTML = `<strong>Tip:</strong> ${getTranslation('map_tip')}`;
  }
  const resetMapBtnSpan = document.querySelector('.reset-map-btn span');
  if (resetMapBtnSpan) {
    resetMapBtnSpan.innerText = currentLang === 'en' ? 'Reset Map' : 'Restablecer Mapa';
  }
}

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadAllAirports();
  setLanguage('en');
});

// Initialize Leaflet Map
function initMap() {
  // Centered globally with a nice dark theme
  map = L.map('map', {
    doubleClickZoom: false, // Disable default double click zoom so we can use double click for coords
    minZoom: 2,             // Limita el zoom mínimo para que ocupe todo el viewport
    worldCopyJump: true     // Muestra marcadores en las copias repetidas del mundo al arrastrar horizontalmente
  }).setView([20, 0], 2);

  // CartoDB Dark Matter tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Create cluster group
  markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  map.addLayer(markerClusterGroup);

  // Double-click listener on map to fill coordinates & automatically execute search!
  map.on('dblclick', (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById('nearLat').value = lat.toFixed(6);
    document.getElementById('nearLng').value = lng.toFixed(6);

    showToast(getTranslation('toast_coords', { lat: lat.toFixed(4), lng: lng.toFixed(4) }), 'info');
    switchTab('nearby');

    // Execute geospatial proximity search immediately
    searchNearby();

    // Gorgeous expanding sonar ping where user clicked
    triggerSonarPing(lat, lng);
  });
}

// Reset map view to global center, clear searches and boundary circles
function resetMapView(e) {
  if (e) e.preventDefault();

  // Smoothly zoom out and center the map globally
  map.setView([20, 0], 2);

  // Remove any active proximity circle
  if (nearbyCircle) {
    map.removeLayer(nearbyCircle);
    nearbyCircle = null;
  }

  // Reset marker highlight
  if (currentlySelectedMarker && currentlySelectedMarker.iata) {
    currentlySelectedMarker.marker.setIcon(createAirportIcon(currentlySelectedMarker.iata, false));
    currentlySelectedMarker = null;
  }

  // Clear inputs in Nearby search tab
  document.getElementById('nearLat').value = '';
  document.getElementById('nearLng').value = '';
  document.getElementById('nearRadius').value = '150';
  updateRadiusLabel(150);

  // Reset nearby list to empty state
  document.getElementById('nearbyList').innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-hand-pointer"></i>
      <p data-i18n="near_empty">${getTranslation('near_empty')}</p>
    </div>
  `;

  showToast(getTranslation('toast_reset'), 'info');
}

// Switch sidebar navigation tabs with smooth GSAP transitions
function switchTab(tabId) {
  const activeSec = document.querySelector('.panel-section.active');
  const targetSec = document.getElementById(`tab-${tabId}`);

  if (activeSec === targetSec) return;

  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  const buttons = document.querySelectorAll('.tab-btn');
  if (tabId === 'popular') buttons[0].classList.add('active');
  else if (tabId === 'nearby') buttons[1].classList.add('active');
  else if (tabId === 'details') buttons[2].classList.add('active');
  else if (tabId === 'create') buttons[3].classList.add('active');

  if (activeSec) {
    gsap.to(activeSec, {
      opacity: 0,
      x: -15,
      duration: 0.2,
      onComplete: () => {
        activeSec.classList.remove('active');
        targetSec.classList.add('active');
        gsap.fromTo(targetSec,
          { opacity: 0, x: 15 },
          { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }
        );

        // Stagger animation on child elements for high-end feel
        if (tabId === 'popular') {
          gsap.from('#tab-popular .chart-container, #popularList .airport-card', {
            opacity: 0,
            y: 15,
            stagger: 0.04,
            duration: 0.4,
            ease: "power2.out"
          });
        } else if (tabId === 'nearby') {
          gsap.from('#tab-nearby > div, #nearbyList .airport-card', {
            opacity: 0,
            y: 15,
            stagger: 0.04,
            duration: 0.4,
            ease: "power2.out"
          });
        } else if (tabId === 'details') {
          gsap.from('.details-box', {
            opacity: 0,
            y: 15,
            stagger: 0.08,
            duration: 0.45,
            ease: "power2.out"
          });
        } else if (tabId === 'create') {
          gsap.from('#createForm .form-group, #createForm button', {
            opacity: 0,
            y: 15,
            stagger: 0.04,
            duration: 0.4,
            ease: "power2.out"
          });
        }
      }
    });
  } else {
    targetSec.classList.add('active');
    gsap.fromTo(targetSec,
      { opacity: 0, x: 15 },
      { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }
    );
  }
}

// Fetch and draw all markers on load
async function loadAllAirports() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('API fetch failed');
    const airports = await res.json();

    // Clear previous state if any
    markerClusterGroup.clearLayers();
    airportMarkersMap.clear();
    currentlySelectedMarker = null;

    console.log(`Plotting ${airports.length} markers...`);

    airports.forEach(airport => {
      if (airport.lat != null && airport.lng != null && airport.iata_faa && (airport.lat !== 0 || airport.lng !== 0)) {
        const iata = airport.iata_faa.trim().toUpperCase();

        // Create Leaflet Marker with custom premium pulsing SVG
        const marker = L.marker([airport.lat, airport.lng], {
          icon: createAirportIcon(iata, false)
        });

        // Setup generic popup (updates dynamically on click)
        const popupContent = `
          <div class="popup-container" id="popup-${iata}">
            <h3>${airport.name}</h3>
            <p>${currentLang === 'en' ? 'Loading visits statistics...' : 'Cargando estadísticas de visitas...'}</p>
          </div>
        `;
        marker.bindPopup(popupContent);

        // Fetch details and increment visits score on click
        marker.on('click', () => {
          handleMarkerClick(iata, marker);
        });

        markerClusterGroup.addLayer(marker);
        airportMarkersMap.set(iata, marker);
      }
    });

  } catch (err) {
    console.error('Error loading all airports:', err);
    showToast(getTranslation('toast_connect_err'), 'error');
  }
}

// Handle clicking a marker on map
async function handleMarkerClick(iata, marker) {
  try {
    // Reset previous highlighted marker icon
    if (currentlySelectedMarker && currentlySelectedMarker.iata) {
      currentlySelectedMarker.marker.setIcon(createAirportIcon(currentlySelectedMarker.iata, false));
    }

    // Highlight currently selected marker icon (cyan glow)
    marker.setIcon(createAirportIcon(iata, true));
    currentlySelectedMarker = { iata, marker };

    const res = await fetch(`${API_URL}/${iata}`);
    if (!res.ok) throw new Error('Failed to fetch details');
    const detailedData = await res.json();

    // Update marker popup content on map
    const popup = marker.getPopup();
    popup.setContent(`
      <div class="popup-container">
        <h3>${detailedData.name}</h3>
        <p><strong>${currentLang === 'en' ? 'City' : 'Ciudad'}:</strong> ${detailedData.city || 'N/A'}</p>
        <p><strong>IATA:</strong> ${detailedData.iata_faa || 'N/A'} | <strong>ICAO:</strong> ${detailedData.icao || 'N/A'}</p>
        <p><strong>${currentLang === 'en' ? 'Altitude' : 'Altitud'}:</strong> ${detailedData.alt} ${getTranslation('details_feet')}</p>
        <p><strong>${currentLang === 'en' ? 'Timezone' : 'Zona Horaria'}:</strong> ${detailedData.tz || 'N/A'}</p>
      </div>
    `);
    popup.update();

    // Display detailed card in Sidebar "Details" tab
    displayAirportDetails(detailedData);
    switchTab('details');

    // Reload popularity scores list
    loadPopularAirports();
  } catch (err) {
    console.error('Error loading clicked marker details:', err);
  }
}

// Render detailed airport profile in Sidebar Details Tab
function displayAirportDetails(airport) {
  selectedAirportData = airport;
  const detailsContainer = document.getElementById('detailsContainer');

  detailsContainer.innerHTML = `
    <div class="details-box">
      <div style="text-align: center; margin-bottom: 16px;">
        <i class="fa-solid fa-plane" style="font-size: 32px; color: var(--accent-cyan); margin-bottom: 8px;"></i>
        <h2 style="font-size: 18px; font-weight: 700; color: #fff;">${airport.name}</h2>
        <p style="font-size: 13px; color: var(--text-muted);">${airport.city || 'Unknown City'}</p>
      </div>
      
      <div class="details-row">
        <span class="details-label">${getTranslation('details_iata')}</span>
        <span class="details-value badge badge-code">${airport.iata_faa || 'N/A'}</span>
      </div>
      <div class="details-row">
        <span class="details-label">${getTranslation('details_icao')}</span>
        <span class="details-value">${airport.icao || 'N/A'}</span>
      </div>
      <div class="details-row">
        <span class="details-label">${getTranslation('details_lat')}</span>
        <span class="details-value">${airport.lat}</span>
      </div>
      <div class="details-row">
        <span class="details-label">${getTranslation('details_lng')}</span>
        <span class="details-value">${airport.lng}</span>
      </div>
      <div class="details-row">
        <span class="details-label">${getTranslation('details_alt')}</span>
        <span class="details-value">${airport.alt != null ? airport.alt + ' ' + getTranslation('details_feet') : 'N/A'}</span>
      </div>
      <div class="details-row">
        <span class="details-label">${getTranslation('details_tz')}</span>
        <span class="details-value">${airport.tz || 'N/A'}</span>
      </div>
      
      <div class="details-actions">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openEditModal()">
          <i class="fa-solid fa-pen-to-square"></i> ${getTranslation('details_btn_edit')}
        </button>
        <button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteAirport('${airport.iata_faa}')">
          <i class="fa-solid fa-trash-can"></i> ${getTranslation('details_btn_delete')}
        </button>
      </div>
    </div>
  `;
}

// Zoom and trigger select on specific airport
function zoomToAirport(iata, lat, lng) {
  map.setView([lat, lng], 11);
  const marker = airportMarkersMap.get(iata);
  if (marker) {
    // Open cluster and marker popup
    markerClusterGroup.zoomToShowLayer(marker, () => {
      marker.openPopup();
      handleMarkerClick(iata, marker);
    });
  }
}

let popularityChartInstance = null;

// Fetch popular airports from analytics redis-pop ZSET
async function loadPopularAirports() {
  try {
    const res = await fetch(`${API_URL}/popular`);
    if (!res.ok) throw new Error('Popularity API failed');
    const popular = await res.json();

    const listDiv = document.getElementById('popularList');
    const chartContainer = document.getElementById('popularChartContainer');

    if (popular.length === 0) {
      listDiv.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <p>${getTranslation('pop_no_visits')}</p>
        </div>
      `;
      if (chartContainer) chartContainer.style.display = 'none';
      return;
    }

    // Show chart container
    if (chartContainer) chartContainer.style.display = 'block';

    // Calculate max score for progress bars percentage
    const maxScore = popular[0].visits || 1;

    listDiv.innerHTML = popular.map((item, index) => {
      const rank = index + 1;
      const airport = item.airport || { name: 'Unknown Airport', city: 'Unknown', lat: 0, lng: 0 };
      const fillWidth = (item.visits / maxScore) * 100;

      return `
        <div class="airport-card" onclick="zoomToAirport('${item.iata_faa}', ${airport.lat}, ${airport.lng})">
          <div class="rank-badge rank-${rank}">${rank}</div>
          <h3>${airport.name}</h3>
          <p>${airport.city || ''}</p>
          <div class="card-meta">
            <span class="badge badge-code">${item.iata_faa}</span>
            <span class="badge badge-visits">
              <i class="fa-solid fa-eye"></i> ${item.visits} ${getTranslation('pop_visits')}
            </span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${fillWidth}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // Render or update Chart
    renderPopularityChart(popular);

  } catch (err) {
    console.error('Error fetching popular airports:', err);
  }
}

// Chart.js Horizontal Bar Chart renderer
function renderPopularityChart(popularData) {
  const canvas = document.getElementById('popularityChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // We show only Top 5 for premium and readable dashboard look
  const topData = popularData.slice(0, 5);
  const labels = topData.map(item => item.iata_faa);
  const dataValues = topData.map(item => item.visits);

  if (popularityChartInstance) {
    popularityChartInstance.data.labels = labels;
    popularityChartInstance.data.datasets[0].data = dataValues;
    popularityChartInstance.update();
    return;
  }

  // Premium warm champagne and sky blue gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 320, 0);
  gradient.addColorStop(0, '#0ea5e9'); // Ocean Sky blue
  gradient.addColorStop(1, '#fbbf24'); // Champagne Gold

  popularityChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: currentLang === 'en' ? 'Visits' : 'Visitas',
        data: dataValues,
        backgroundColor: gradient,
        borderColor: 'rgba(251, 191, 36, 0.4)',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.65
      }]
    },
    options: {
      indexAxis: 'y', // Horizontal Layout
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 19, 31, 0.95)',
          borderColor: 'rgba(251, 191, 36, 0.25)',
          borderWidth: 1,
          titleColor: '#fbbf24',
          titleFont: { family: 'Outfit', weight: 'bold', size: 12 },
          bodyFont: { family: 'Outfit', size: 11 },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false
          },
          ticks: {
            color: '#8892b0',
            font: { family: 'Outfit', size: 9 },
            precision: 0
          }
        },
        y: {
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            color: '#f8fafc',
            font: { family: 'Outfit', size: 11, weight: '600' }
          }
        }
      }
    }
  });
}

// Geospatial search via Redis GEORADIUS
async function searchNearby() {
  const lat = parseFloat(document.getElementById('nearLat').value);
  const lng = parseFloat(document.getElementById('nearLng').value);
  const radius = parseFloat(document.getElementById('nearRadius').value);

  if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
    showToast(getTranslation('toast_valid_coords'), 'error');
    return;
  }

  // Draw warm gold radius boundary circle on map
  if (nearbyCircle) map.removeLayer(nearbyCircle);
  nearbyCircle = L.circle([lat, lng], {
    radius: radius * 1000, // in meters
    color: '#fbbf24',
    fillColor: '#fbbf24',
    fillOpacity: 0.08,
    weight: 1.5
  }).addTo(map);

  // Fit map view to bounds
  map.fitBounds(nearbyCircle.getBounds());

  const listDiv = document.getElementById('nearbyList');
  listDiv.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--accent-cyan);"></i>
      <p style="margin-top: 10px; font-size: 13px;">${getTranslation('near_searching')}</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_URL}/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    if (!res.ok) throw new Error('Nearby API failed');
    const nearby = await res.json();

    if (nearby.length === 0) {
      listDiv.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-satellite"></i>
          <p>${getTranslation('near_no_results', { radius })}</p>
        </div>
      `;
      return;
    }

    listDiv.innerHTML = `
      <div style="font-size: 12px; color: var(--accent-emerald); font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-circle-check"></i> ${getTranslation('near_found', { count: nearby.length })}
      </div>
    ` + nearby.map(item => {
      const airport = item.airport;
      return `
        <div class="airport-card" onclick="zoomToAirport('${item.iata_faa}', ${airport.lat}, ${airport.lng})">
          <h3>${airport.name}</h3>
          <p>${airport.city || ''}</p>
          <div class="card-meta">
            <span class="badge badge-code">${item.iata_faa}</span>
            <span class="badge badge-dist">
              <i class="fa-solid fa-compass"></i> ${item.distance.toFixed(1)} ${getTranslation('near_away')}
            </span>
          </div>
        </div>
      `;
    }).join('');

    showToast(getTranslation('toast_found_count', { count: nearby.length }), 'success');

  } catch (err) {
    console.error('Error fetching nearby airports:', err);
    showToast(getTranslation('toast_geo_err'), 'error');
    listDiv.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-exclamation" style="color:var(--accent-rose)"></i>
        <p>${getTranslation('near_failed')}</p>
      </div>
    `;
  }
}

// CRUD POST - Create new Airport
async function createNewAirport(e) {
  e.preventDefault();

  const payload = {
    name: document.getElementById('createName').value,
    city: document.getElementById('createCity').value,
    iata_faa: document.getElementById('createIata').value.trim().toUpperCase(),
    icao: document.getElementById('createIcao').value.trim().toUpperCase(),
    lat: parseFloat(document.getElementById('createLat').value),
    lng: parseFloat(document.getElementById('createLng').value),
    alt: document.getElementById('createAlt').value ? parseInt(document.getElementById('createAlt').value, 10) : null,
    tz: document.getElementById('createTz').value
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to create');
    }

    const createdAirport = await res.json();

    // Reset Form
    document.getElementById('createForm').reset();

    showToast(getTranslation('toast_created', { iata: createdAirport.iata_faa }), 'success');

    // Redraw marker dynamically with custom premium icon
    const iataUpper = createdAirport.iata_faa.trim().toUpperCase();
    const marker = L.marker([createdAirport.lat, createdAirport.lng], {
      icon: createAirportIcon(iataUpper, false)
    });
    marker.bindPopup(`
      <div class="popup-container">
        <h3>${createdAirport.name}</h3>
        <p><strong>${currentLang === 'en' ? 'City' : 'Ciudad'}:</strong> ${createdAirport.city || 'N/A'}</p>
        <p><strong>IATA:</strong> ${createdAirport.iata_faa || 'N/A'} | <strong>ICAO:</strong> ${createdAirport.icao || 'N/A'}</p>
        <p><strong>${currentLang === 'en' ? 'Altitude' : 'Altitud'}:</strong> ${createdAirport.alt} ${getTranslation('details_feet')}</p>
        <p><strong>${currentLang === 'en' ? 'Timezone' : 'Zona Horaria'}:</strong> ${createdAirport.tz || 'N/A'}</p>
      </div>
    `);
    marker.on('click', () => {
      handleMarkerClick(iataUpper, marker);
    });

    markerClusterGroup.addLayer(marker);
    airportMarkersMap.set(iataUpper, marker);

    // Zoom to new airport
    zoomToAirport(createdAirport.iata_faa, createdAirport.lat, createdAirport.lng);

  } catch (err) {
    console.error('Error creating airport:', err);
    showToast(getTranslation('toast_create_err'), 'error');
  }
}

// CRUD DELETE - Remove Airport
async function deleteAirport(iata) {
  if (!confirm(getTranslation('toast_delete_confirm', { iata }))) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/${iata}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deletion failed');

    // Reset highlight if we are deleting the selected airport
    if (currentlySelectedMarker && currentlySelectedMarker.iata === iata.toUpperCase()) {
      currentlySelectedMarker = null;
    }

    showToast(getTranslation('toast_deleted', { iata }), 'success');

    // Remove marker from map dynamically
    const marker = airportMarkersMap.get(iata.toUpperCase());
    if (marker) {
      markerClusterGroup.removeLayer(marker);
      airportMarkersMap.delete(iata.toUpperCase());
    }

    // Reset details view
    selectedAirportData = null;
    refreshDynamicViews();

    switchTab('popular');

  } catch (err) {
    console.error('Error deleting airport:', err);
    showToast(getTranslation('toast_delete_err'), 'error');
  }
}

// Open Edit Modal and fill data
function openEditModal() {
  if (!selectedAirportData) return;

  document.getElementById('editOriginalIata').value = selectedAirportData.iata_faa;
  document.getElementById('editName').value = selectedAirportData.name;
  document.getElementById('editCity').value = selectedAirportData.city || '';
  document.getElementById('editIata').value = selectedAirportData.iata_faa;
  document.getElementById('editIcao').value = selectedAirportData.icao || '';
  document.getElementById('editLat').value = selectedAirportData.lat;
  document.getElementById('editLng').value = selectedAirportData.lng;
  document.getElementById('editAlt').value = selectedAirportData.alt || '';
  document.getElementById('editTz').value = selectedAirportData.tz || '';

  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
}

// CRUD PUT - Edit Airport
async function submitEditAirport(e) {
  e.preventDefault();

  const iata = document.getElementById('editOriginalIata').value;
  const payload = {
    name: document.getElementById('editName').value,
    city: document.getElementById('editCity').value,
    icao: document.getElementById('editIcao').value.trim().toUpperCase(),
    lat: parseFloat(document.getElementById('editLat').value),
    lng: parseFloat(document.getElementById('editLng').value),
    alt: document.getElementById('editAlt').value ? parseInt(document.getElementById('editAlt').value, 10) : null,
    tz: document.getElementById('editTz').value
  };

  try {
    const res = await fetch(`${API_URL}/${iata}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Update failed');
    const updatedData = await res.json();

    closeEditModal();
    showToast(getTranslation('toast_updated', { iata: updatedData.iata_faa }), 'success');

    // Update sidebar profile
    displayAirportDetails(updatedData);

    // Update map marker dynamically
    const marker = airportMarkersMap.get(iata.toUpperCase());
    if (marker) {
      // In Leaflet.markercluster, to update a marker's position correctly inside a cluster,
      // we must remove it from the group, change its LatLng, and re-add it.
      markerClusterGroup.removeLayer(marker);
      marker.setLatLng([updatedData.lat, updatedData.lng]);
      markerClusterGroup.addLayer(marker);

      marker.getPopup().setContent(`
        <div class="popup-container">
          <h3>${updatedData.name}</h3>
          <p><strong>${currentLang === 'en' ? 'City' : 'Ciudad'}:</strong> ${updatedData.city || 'N/A'}</p>
          <p><strong>IATA:</strong> ${updatedData.iata_faa || 'N/A'} | <strong>ICAO:</strong> ${updatedData.icao || 'N/A'}</p>
          <p><strong>${currentLang === 'en' ? 'Altitude' : 'Altitud'}:</strong> ${updatedData.alt} ${getTranslation('details_feet')}</p>
          <p><strong>${currentLang === 'en' ? 'Timezone' : 'Zona Horaria'}:</strong> ${updatedData.tz || 'N/A'}</p>
        </div>
      `);
    }

    loadPopularAirports();
  } catch (err) {
    console.error('Error updating airport:', err);
    showToast(getTranslation('toast_update_err'), 'error');
  }
}

// Helper for Toast Notifications using GSAP spring physics
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div>${message}</div>
  `;

  container.appendChild(toast);

  // GSAP Spring entrance from right
  gsap.fromTo(toast,
    { x: 150, opacity: 0, scale: 0.9 },
    { x: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.2)" }
  );

  // Auto dismiss with slide out and fade
  setTimeout(() => {
    gsap.to(toast, {
      x: 180,
      opacity: 0,
      scale: 0.85,
      duration: 0.35,
      ease: "power2.in",
      onComplete: () => toast.remove()
    });
  }, 4000);
}

// Map Address Geocoding Search (OSM Nominatim API)
function handleMapSearchKey(event) {
  const clearBtn = document.getElementById('mapSearchClear');
  const val = event.target.value.trim();

  if (val.length > 0) {
    clearBtn.style.display = 'block';
  } else {
    clearBtn.style.display = 'none';
    document.getElementById('mapSearchResults').style.display = 'none';
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    performMapSearch(val);
  }
}

async function performMapSearch(query) {
  if (!query) return;

  const resultsDiv = document.getElementById('mapSearchResults');
  resultsDiv.innerHTML = `
    <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px;">
      <i class="fa-solid fa-spinner fa-spin" style="color: var(--accent-purple); margin-right: 6px;"></i>
      ${currentLang === 'en' ? 'Searching address...' : 'Buscando dirección...'}
    </div>
  `;
  resultsDiv.style.display = 'block';

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': currentLang === 'en' ? 'en' : 'es'
      }
    });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();

    if (data.length === 0) {
      resultsDiv.innerHTML = `
        <div style="padding: 12px; text-align: center; color: var(--accent-rose); font-size: 12px;">
          <i class="fa-solid fa-circle-exclamation" style="margin-right: 6px;"></i>
          ${currentLang === 'en' ? 'No results found' : 'No se encontraron resultados'}
        </div>
      `;
      return;
    }

    resultsDiv.innerHTML = data.map(item => {
      return `
        <div class="map-search-result-item" onclick="selectSearchResult(${item.lat}, ${item.lon}, '${item.display_name.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-location-dot" style="margin-right: 8px; color: var(--accent-purple);"></i>
          <span>${item.display_name}</span>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Search error:', err);
    resultsDiv.innerHTML = `
      <div style="padding: 12px; text-align: center; color: var(--accent-rose); font-size: 12px;">
        <i class="fa-solid fa-circle-exclamation" style="margin-right: 6px;"></i>
        ${currentLang === 'en' ? 'Search service unavailable' : 'Servicio de búsqueda no disponible'}
      </div>
    `;
  }
}

function selectSearchResult(lat, lon, displayName) {
  // Zoom map to the coordinates
  map.setView([lat, lon], 12);

  // Hide results box
  document.getElementById('mapSearchResults').style.display = 'none';

  // Auto fill coordinates in nearby inputs
  document.getElementById('nearLat').value = parseFloat(lat).toFixed(6);
  document.getElementById('nearLng').value = parseFloat(lon).toFixed(6);

  // Switch tab and search automatically!
  switchTab('nearby');
  searchNearby();

  const shortName = displayName.split(',')[0] + ', ' + (displayName.split(',')[1] || '');
  showToast(currentLang === 'en' ? `Located: ${shortName}` : `Ubicado: ${shortName}`, 'success');

  // Draw warm gold expanding concentric sonar ping sweep
  triggerSonarPing(lat, lon);
}

function clearMapSearch() {
  document.getElementById('mapSearchInput').value = '';
  document.getElementById('mapSearchClear').style.display = 'none';
  document.getElementById('mapSearchResults').style.display = 'none';
}

// Hide search results when clicking outside
document.addEventListener('click', (e) => {
  const container = document.querySelector('.map-search-container');
  if (container && !container.contains(e.target)) {
    document.getElementById('mapSearchResults').style.display = 'none';
  }
});
