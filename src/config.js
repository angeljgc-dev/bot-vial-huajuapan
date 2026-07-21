'use strict';
require('dotenv').config();

module.exports = {
  groqApiKey:       process.env.GROQ_API_KEY        || '',
  tomtomApiKey:     process.env.TOMTOM_API_KEY      || '',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  groqModel:        'llama-3.1-8b-instant',

  twitter: {
    user:  process.env.TWITTER_USER  || '',
    pass:  process.env.TWITTER_PASS  || '',
    email: process.env.TWITTER_EMAIL || '',
  },

  // Centro de Huajuapan de León, Oaxaca
  huajuapan: { lat: 17.8044, lon: -97.7703, radiusKm: 15 },

  incidentTtlHours: parseInt(process.env.INCIDENT_TTL_HOURS || '6'),

  rssFeeds: [
    {
      name:      'igavec',
      url:       'https://igavecnoticias.com/category/policiaca/feed/',
      cronExpr:  '*/10 * * * *',
    },
    {
      name:      'mixteca',
      url:       'http://www.mixtecainforma.com/feeds/posts/default',
      cronExpr:  '*/15 * * * *',
    },
    {
      name:      'zonaroja',
      url:       'https://zonaroja.com.mx/?tag=huajuapan-de-leon&feed=rss2',
      cronExpr:  '*/10 * * * *',
    },
    {
      name:      'oaxacavial',
      url:       'https://oaxacavialynoticias.com/feed/',
      cronExpr:  '*/15 * * * *',
    },
  ],

  // Cuentas de Twitter/X a monitorear
  twitterAccounts: [
    'Igavec_Noticias',
    'OaxacaVialSi',
    'Bloqueos_Oaxaca',
    'ZonaRoja_Oaxaca',
  ],

  // Palabras clave para filtrar antes de llamar al LLM (pre-filtro barato)
  incidentKeywords: [
    'accidente', 'choque', 'volcadura', 'atropell',
    'calle cerrada', 'cerrada', 'bloqueo', 'bloqueada',
    'cierre vial', 'cierre de', 'derrumbe', 'inundac',
    'carretera', 'vialidad', 'tapada', 'transito',
    'colision', 'colisión', 'camion', 'trailer',
    'reten', 'retén', 'operativo', 'alcoholimetro',
  ],

  // Tipo de incidente → emoji
  tipoEmoji: {
    accidente:    '🚨',
    calle_cerrada:'🚧',
    bloqueo:      '🛑',
    inundacion:   '🌊',
    derrumbe:     '⛰️',
    bache:        '🕳️',
    reten:        '👮',
    operativo:    '🚔',
    otro:         '⚠️',
  },

  severidadEmoji: { alta: '🔴', media: '🟡', baja: '🟢' },

  // Qué tipos mostrar para cada palabra que el usuario escribe
  tipoKeywords: {
    accidente:    ['accidente', 'accidentes', 'choque', 'choques', 'colision', 'colisiones', 'volcadura'],
    bloqueo:      ['bloqueo', 'bloqueos'],
    calle_cerrada:['calle cerrada', 'calles cerradas', 'cierre', 'cierres'],
    reten:        ['reten', 'retenes', 'alcoholimetro'],
    operativo:    ['operativo', 'operativos'],
    inundacion:   ['inundacion', 'inundaciones'],
    derrumbe:     ['derrumbe', 'derrumbes'],
    bache:        ['bache', 'baches'],
  },
};
