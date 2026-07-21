'use strict';
const cron            = require('node-cron');
const config          = require('../config');
const { parse }       = require('../parsers/incidentParser');
const incidentService = require('../services/incidentService');

let scraper = null;

async function initScraper() {
  const { user, pass, email } = config.twitter;
  if (!user || !pass) return false;

  try {
    const { Scraper } = require('@the-convocation/twitter-scraper');
    scraper = new Scraper();
    await scraper.login(user, pass, email || undefined);
    const ok = await scraper.isLoggedIn();
    if (!ok) { scraper = null; }
    return ok;
  } catch (err) {
    console.warn(`[twitter] Error al inicializar: ${err.message}`);
    scraper = null;
    return false;
  }
}

async function fetchAccountTweets(account) {
  if (!scraper) return [];
  const items = [];
  try {
    for await (const tweet of scraper.getTweets(account, 20)) {
      items.push({
        feedName:    `twitter_${account}`,
        title:       tweet.text || '',
        description: '',
        link:        `https://x.com/${account}/status/${tweet.id}`,
        pubDate:     tweet.timeParsed?.toISOString() || new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn(`[twitter] Error al leer @${account}: ${err.message}`);
  }
  return items;
}

async function poll() {
  if (!scraper) return;
  let total = 0;

  for (const account of config.twitterAccounts) {
    const items = await fetchAccountTweets(account);
    for (const item of items) {
      try {
        const incident = await parse(item);
        if (incident) {
          const isNew = incidentService.save(incident);
          if (isNew) {
            total++;
            console.log(`[twitter:@${account}] Nuevo: ${incident.tipo} — ${incident.calle || 'sin calle'}`);
          }
        }
      } catch {
        // continúa
      }
    }
  }

  return total;
}

async function start() {
  const ok = await initScraper();
  if (!ok) {
    console.log('[twitter] Deshabilitado. Configura TWITTER_USER/TWITTER_PASS/TWITTER_EMAIL en .env para activarlo.');
    return;
  }
  console.log(`[twitter] Activo. Monitoreando: ${config.twitterAccounts.join(', ')}`);
  poll();
  // Cada 20 minutos para no saturar la cuenta
  cron.schedule('*/20 * * * *', poll);
}

module.exports = { start };
