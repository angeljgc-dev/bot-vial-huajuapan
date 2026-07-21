'use strict';
const RSSParser      = require('rss-parser');
const cron           = require('node-cron');
const config         = require('../config');
const { parse }      = require('../parsers/incidentParser');
const incidentService = require('../services/incidentService');

const parser = new RSSParser({ timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WbVialBot/1.0)' } });

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    return (result.items || []).map(item => ({
      feedName:    feed.name,
      title:       item.title            || '',
      description: (item.contentSnippet || item.content || '').slice(0, 600),
      link:        item.link             || '',
      pubDate:     item.isoDate          || item.pubDate || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn(`[rss:${feed.name}] Error al obtener feed: ${err.message}`);
    return [];
  }
}

async function processFeed(feed) {
  const items = await fetchFeed(feed);
  let newCount = 0;

  for (const item of items) {
    try {
      const incident = await parse(item);
      if (incident) {
        const isNew = incidentService.save(incident);
        if (isNew) {
          newCount++;
          console.log(`[rss:${feed.name}] Nuevo incidente: ${incident.tipo} — ${incident.calle || 'sin calle'}`);
        }
      }
    } catch {
      // continúa con el siguiente artículo
    }
  }

  return newCount;
}

function start() {
  console.log('[rss] Iniciando monitores de feeds...');

  for (const feed of config.rssFeeds) {
    // Primera ejecución inmediata
    processFeed(feed);
    // Luego en el intervalo configurado
    cron.schedule(feed.cronExpr, () => processFeed(feed));
    console.log(`[rss:${feed.name}] Programado (${feed.cronExpr})`);
  }

  // Expirar incidentes viejos cada hora
  cron.schedule('0 * * * *', () => {
    const expired = incidentService.expireOld();
    if (expired > 0) console.log(`[rss] Incidentes expirados: ${expired}`);
  });
}

module.exports = { start, processFeed };
