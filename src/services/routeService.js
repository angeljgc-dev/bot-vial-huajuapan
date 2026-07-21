'use strict';
const axios  = require('axios');
const config = require('../config');

// Caché en memoria: evita llamar a la API dos veces por la misma calle
const cache = new Map(); // clave → { streets, expiresAt }
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

function fromCache(key) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.streets;
  cache.delete(key);
  return null;
}

function toCache(key, streets) {
  cache.set(key, { streets, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Extrae nombres de calle de las instrucciones HTML de Google Maps
// Ejemplo: "Gira a la izquierda en <b>Calle Morelos</b>" → "Calle Morelos"
function extractStreetNames(htmlInstruction) {
  const names = [];
  const matches = htmlInstruction.matchAll(/<b>(.*?)<\/b>/gi);
  for (const m of matches) {
    const name = m[1].trim();
    // Descartar si es solo una dirección cardinal o número
    if (name && !/^(norte|sur|este|oeste|n|s|e|o|\d+)$/i.test(name)) {
      names.push(name);
    }
  }
  return names;
}

// Normaliza nombre de calle para comparar (quita acentos, mayúsculas, prefijos)
function normalizeCalle(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(calle|avenida|av\.?|blvd\.?|boulevard|carretera|carr\.?)\s+/i, '')
    .trim();
}

/**
 * Devuelve hasta 3 calles alternativas para evitar la calle bloqueada.
 * Usa Google Maps Geocoding + Directions API.
 * Retorna array vacío si no hay API key o si no encuentra alternativas.
 */
async function getAlternativeStreets(calle, ciudad) {
  if (!calle || !config.googleMapsApiKey) return [];

  const cacheKey = `${normalizeCalle(calle)}|${ciudad || ''}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  try {
    // ── 1. Geocodificar la calle en Huajuapan ───────────────────────────────
    const geoRes = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address:  `${calle}, ${ciudad || 'Huajuapan de León'}, Oaxaca, México`,
        key:      config.googleMapsApiKey,
        region:   'mx',
        language: 'es',
      },
      timeout: 8000,
    });

    if (!geoRes.data.results?.length) { toCache(cacheKey, []); return []; }

    const { lat, lng } = geoRes.data.results[0].geometry.location;

    // Verificar que el punto está cerca de Huajuapan (radio ~25 km)
    const distKm = Math.hypot(lat - config.huajuapan.lat, lng - config.huajuapan.lon) * 111;
    if (distKm > 25) { toCache(cacheKey, []); return []; }

    // ── 2. Pedir rutas alternativas pasando cerca del incidente ────────────
    // Usamos dos puntos a ~400 m de distancia en la calle geocodificada
    const delta = 0.004;
    const dirRes = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin:       `${lat + delta},${lng - delta * 0.5}`,
        destination:  `${lat - delta},${lng + delta * 0.5}`,
        alternatives: true,
        region:       'mx',
        language:     'es',
        key:          config.googleMapsApiKey,
      },
      timeout: 8000,
    });

    const routes = dirRes.data.routes || [];
    if (routes.length < 2) { toCache(cacheKey, []); return []; }

    // ── 3. Extraer calles de rutas alternativas (descartar la ruta principal) ─
    const blockedNorm = normalizeCalle(calle);
    const alternatives = new Set();

    for (const route of routes.slice(1)) {          // skip ruta principal
      for (const leg of route.legs || []) {
        for (const step of leg.steps || []) {
          for (const name of extractStreetNames(step.html_instructions || '')) {
            if (!normalizeCalle(name).includes(blockedNorm)) {
              alternatives.add(name);
            }
          }
        }
      }
    }

    const result = [...alternatives].slice(0, 3);
    toCache(cacheKey, result);
    return result;

  } catch {
    return [];
  }
}

module.exports = { getAlternativeStreets };
