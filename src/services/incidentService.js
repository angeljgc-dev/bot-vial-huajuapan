'use strict';
const crypto = require('crypto');
const db     = require('../database/db');
const config = require('../config');

// Hash de fuente + identificador único del artículo para deduplicación
function makeSourceId(fuente, identifier) {
  return crypto.createHash('md5').update(`${fuente}:${identifier || Date.now()}`).digest('hex');
}

// Guarda un incidente. Devuelve true si es nuevo, false si ya existía.
function save(incident) {
  const sourceId  = makeSourceId(incident.fuente, incident.url || incident.titulo);
  const expiresAt = new Date(Date.now() + config.incidentTtlHours * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  const result = db.prepare(`
    INSERT OR IGNORE INTO incidents
      (source_id, tipo, calle, entre_calles, ciudad, severidad,
       descripcion, fuente, url, titulo, expires_at)
    VALUES
      (@sourceId, @tipo, @calle, @entre_calles, @ciudad, @severidad,
       @descripcion, @fuente, @url, @titulo, @expiresAt)
  `).run({
    sourceId,
    tipo:         incident.tipo         || 'otro',
    calle:        incident.calle        || null,
    entre_calles: incident.entre_calles || null,
    ciudad:       incident.ciudad       || 'Huajuapan de León',
    severidad:    incident.severidad    || 'media',
    descripcion:  incident.descripcion  || null,
    fuente:       incident.fuente,
    url:          incident.url          || null,
    titulo:       incident.titulo       || null,
    expiresAt,
  });

  return result.changes > 0;
}

// Devuelve incidentes activos de las últimas N horas
function getActive(hours = 6) {
  return db.prepare(`
    SELECT * FROM incidents
    WHERE  activo = 1
      AND  created_at >= strftime('%Y-%m-%d %H:%M:%S', datetime('now', ? || ' hours'))
    ORDER  BY created_at DESC
    LIMIT  20
  `).all(`-${hours}`);
}

// Busca incidentes por nombre de calle (búsqueda parcial)
function getByStreet(keyword) {
  const like = `%${keyword}%`;
  return db.prepare(`
    SELECT * FROM incidents
    WHERE  activo = 1
      AND  created_at >= strftime('%Y-%m-%d %H:%M:%S', datetime('now', '-6 hours'))
      AND  (calle LIKE ? OR entre_calles LIKE ? OR descripcion LIKE ?)
    ORDER  BY created_at DESC
    LIMIT  10
  `).all(like, like, like);
}

// Marca como inactivos los incidentes expirados
function expireOld() {
  return db.prepare(`
    UPDATE incidents SET activo = 0
    WHERE  activo = 1
      AND  expires_at IS NOT NULL
      AND  expires_at < strftime('%Y-%m-%d %H:%M:%S', 'now')
  `).run().changes;
}

// Estadísticas rápidas para el monitor de salud
function stats() {
  return db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE activo = 1)                                  AS activos,
      COUNT(*) FILTER (WHERE activo = 1 AND severidad = 'alta')           AS alta,
      COUNT(*) FILTER (WHERE activo = 1 AND severidad = 'media')          AS media,
      COUNT(*) FILTER (WHERE activo = 1 AND severidad = 'baja')           AS baja,
      COUNT(*) FILTER (WHERE created_at >= datetime('now', '-1 hour'))    AS ultima_hora
    FROM incidents
  `).get();
}

module.exports = { save, getActive, getByStreet, expireOld, stats };
