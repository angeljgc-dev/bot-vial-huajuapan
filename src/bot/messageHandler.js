'use strict';
const config              = require('../config');
const incidentService     = require('../services/incidentService');
const { getAlternativeStreets } = require('../services/routeService');

// ── Utilidades ─────────────────────────────────────────────────────────────

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Devuelve el valor solo si no es null ni el string "null"
function val(v) {
  return (v && v !== 'null' && v !== 'undefined') ? v : null;
}

function relativeTime(isoStr) {
  const mins = Math.round((Date.now() - new Date(isoStr + 'Z')) / 60000);
  if (mins <  1)  return 'ahora mismo';
  if (mins < 60)  return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  return `hace ${hrs} h`;
}

function capitalize(str) {
  return (str || '').charAt(0).toUpperCase() + (str || '').slice(1).replace(/_/g, ' ');
}

// Detecta si el usuario está pidiendo un tipo específico de incidente
function detectTipoFilter(body) {
  for (const [tipo, keywords] of Object.entries(config.tipoKeywords)) {
    if (keywords.some(kw => body.includes(normalize(kw)))) return tipo;
  }
  return null;
}

// Tipos relacionados (bloqueos también incluye calles cerradas y viceversa)
const TIPOS_RELACIONADOS = {
  bloqueo:      ['bloqueo', 'calle_cerrada'],
  calle_cerrada:['calle_cerrada', 'bloqueo'],
};

function getRelatedTypes(tipo) {
  return TIPOS_RELACIONADOS[tipo] || [tipo];
}

// ── Formateo ───────────────────────────────────────────────────────────────

function formatOne(inc, alternativas = []) {
  const te = config.tipoEmoji[inc.tipo]          || '⚠️';
  const se = config.severidadEmoji[inc.severidad] || '🟡';

  const calleStr = val(inc.calle)        ? `*${inc.calle}*`          : '_Vía no especificada_';
  const entreStr = val(inc.entre_calles) ? `\n  ↔️ ${inc.entre_calles}` : '';
  const descStr  = val(inc.descripcion)  ? `\n  📝 ${inc.descripcion}`  : '';
  const altStr   = alternativas.length
    ? `\n  🔀 *Puedes usar:* ${alternativas.join(' · ')}`
    : '';
  const hace     = relativeTime(inc.created_at);
  const fuente   = inc.fuente.replace('twitter_', '@').replace(/_/g, ' ');

  return `${te} ${se} *${capitalize(inc.tipo)}*\n  ${calleStr}${entreStr}${descStr}${altStr}\n  📰 ${fuente} · ${hace}`;
}

// Formatea lista de incidentes, consultando alternativas para cada uno
async function formatList(incidents) {
  const lines = await Promise.all(incidents.map(async (inc) => {
    const alts = val(inc.calle)
      ? await getAlternativeStreets(inc.calle, inc.ciudad)
      : [];
    return formatOne(inc, alts);
  }));
  return lines.join('\n\n');
}

// ── Mensajes predefinidos ──────────────────────────────────────────────────

const MSG_BIENVENIDA = `🗺️ *Bot Vial Huajuapan de León*
Consulta en tiempo real el estado de las calles.

*Comandos:*
• *reportes* — todos los incidentes activos
• *accidentes* — solo accidentes y choques
• *bloqueos* — bloqueos y calles cerradas
• *retenes* — retenes y alcoholímetros
• *operativos* — operativos policiales
• *calle [nombre]* — buscar en una calle específica
• *estado* — resumen estadístico
• *ayuda* — mostrar este menú

_Los reportes incluyen calles alternativas cuando están disponibles._`;

// ── Manejador principal ────────────────────────────────────────────────────

async function handle(message, sendFn) {
  const body = normalize(message.body || '');

  // --- Bienvenida / menú ---
  if (!body || ['hola', 'inicio', 'menu', 'start', 'hi', 'buenas'].some(k => body === k)) {
    return sendFn(MSG_BIENVENIDA);
  }

  if (body === 'ayuda' || body === 'help') {
    return sendFn(MSG_BIENVENIDA);
  }

  // --- Estadísticas ---
  if (body === 'estado' || body === 'stats') {
    const s = incidentService.stats();
    return sendFn(
      `📊 *Estado actual*\n\n` +
      `Activos: ${s.activos}\n` +
      `🔴 Alta: ${s.alta}   🟡 Media: ${s.media}   🟢 Baja: ${s.baja}\n` +
      `Última hora: ${s.ultima_hora} nuevos`
    );
  }

  // --- Detección de tipo específico O consulta general ---
  const tipoFilter = detectTipoFilter(body);
  const esConsultaGeneral = ['reportes', 'incidentes', 'que esta pasando',
    'noticias', 'trafico', 'vialidad', 'que hay', 'calles', 'situacion',
    'como esta', 'hay algo'].some(k => body.includes(k));

  if (tipoFilter || esConsultaGeneral) {
    let incidents = incidentService.getActive(6);

    // Aplicar filtro de tipo si aplica
    if (tipoFilter) {
      const tipos = getRelatedTypes(tipoFilter);
      incidents = incidents.filter(i => tipos.includes(i.tipo));
    }

    if (!incidents.length) {
      const what = tipoFilter ? `${tipoFilter.replace('_', ' ')}s` : 'incidentes';
      return sendFn(`✅ Sin ${what} activos en las últimas 6 horas.\nCircula con precaución.`);
    }

    const list = await formatList(incidents);
    const hora  = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const titulo = tipoFilter
      ? `${config.tipoEmoji[tipoFilter] || '⚠️'} *${capitalize(tipoFilter)}s activos* (últimas 6h)`
      : `🗺️ *Incidentes activos* (últimas 6h)`;

    return sendFn(`${titulo}\n\n${list}\n\n_Actualizado: ${hora}_`);
  }

  // --- Búsqueda por calle ---
  const calleMatch = body.match(/^calle\s+(.+)/);
  if (calleMatch) {
    const keyword   = calleMatch[1].trim();
    const incidents = incidentService.getByStreet(keyword);
    if (!incidents.length) {
      return sendFn(`✅ Sin incidentes en *${keyword}* en las últimas 6 horas.`);
    }
    const list = await formatList(incidents);
    return sendFn(`🔍 *Incidentes en "${keyword}"*\n\n${list}`);
  }

  // --- Consulta de ruta ---
  if (['voy de', 'como llego', 'como esta la', 'ruta', 'camino a', 'hay algo en'].some(k => body.includes(k))) {
    const incidents = incidentService.getActive(6);
    if (!incidents.length) {
      return sendFn('✅ Sin incidentes activos. Tu ruta debería estar despejada.');
    }
    const list = await formatList(incidents);
    return sendFn(
      `⚠️ *Hay incidentes activos — revisa si afectan tu ruta:*\n\n${list}\n\n` +
      '_Escribe *calle [nombre]* para filtrar por vía específica._'
    );
  }

  // --- Fallback ---
  return sendFn('No entendí ese comando. Escribe *ayuda* para ver las opciones disponibles.');
}

module.exports = { handle };
