'use strict';
const axios           = require('axios');
const cron            = require('node-cron');
const config          = require('../config');
const incidentService = require('../services/incidentService');

// TomTom iconCategory → tipo interno
const CATEGORY_MAP = {
  1:  'accidente',
  2:  'calle_cerrada',
  3:  'otro',   // road works
  4:  'otro',   // construction
  5:  'otro',   // jam
  6:  'otro',   // weather
  7:  'bache',
  8:  'otro',
  9:  'otro',
  10: 'otro',
  11: 'otro',
  14: 'derrumbe',
};

function buildBbox({ lat, lon, radiusKm }) {
  const deg = radiusKm / 111;
  return `${lon - deg},${lat - deg * 0.8},${lon + deg},${lat + deg * 0.8}`;
}

async function poll() {
  if (!config.tomtomApiKey) return;

  const bbox = buildBbox(config.huajuapan);
  const url  = `https://api.tomtom.com/traffic/services/5/incidentDetails` +
    `?key=${config.tomtomApiKey}` +
    `&bbox=${bbox}` +
    `&fields={incidents{type,properties{iconCategory,from,to,delay,events{description}}}}` +
    `&language=es-MX` +
    `&timeValidityFilter=present`;

  try {
    const { data } = await axios.get(url, { timeout: 12000 });
    const incidents = data.incidents || [];
    let newCount = 0;

    for (const inc of incidents) {
      const props       = inc.properties || {};
      const events      = props.events   || [];
      const descripcion = events.map(e => e.description).filter(Boolean).join('. ') ||
                          `Incidente vial en ${props.from || 'vía desconocida'}`;

      const isNew = incidentService.save({
        tipo:         CATEGORY_MAP[props.iconCategory] || 'otro',
        calle:        props.from  || null,
        entre_calles: props.to    || null,
        ciudad:       'Huajuapan de León',
        severidad:    props.delay > 300 ? 'alta' : props.delay > 60 ? 'media' : 'baja',
        descripcion,
        fuente:       'tomtom',
        url:          null,
        titulo:       descripcion,
      });

      if (isNew) {
        newCount++;
        console.log(`[tomtom] Nuevo: ${CATEGORY_MAP[props.iconCategory] || 'otro'} — ${props.from || '?'}`);
      }
    }

    return newCount;
  } catch (err) {
    console.warn(`[tomtom] Error al consultar API: ${err.message}`);
  }
}

function start() {
  if (!config.tomtomApiKey) {
    console.log('[tomtom] Deshabilitado. Agrega TOMTOM_API_KEY en .env para habilitarlo (2,500 req/día gratis).');
    return;
  }
  console.log('[tomtom] Monitor activo.');
  poll();
  cron.schedule('*/10 * * * *', poll);
}

module.exports = { start };
