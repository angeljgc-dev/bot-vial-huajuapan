'use strict';
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom }     = require('@hapi/boom');
const pino         = require('pino');
const qrcode       = require('qrcode-terminal');
const path         = require('path');
const fs           = require('fs');

const rssMonitor     = require('./monitors/rssMonitor');
const twitterMonitor = require('./monitors/twitterMonitor');
const tomtomMonitor  = require('./monitors/tomtomMonitor');
const { handle }     = require('./bot/messageHandler');

const AUTH_DIR = path.join(__dirname, '../auth');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Logger silencioso para Baileys (los logs del bot van a stdout normal) ──
const silentLogger = pino({ level: 'silent' });

let monitoresIniciados = false;

function startMonitors() {
  if (monitoresIniciados) return;
  monitoresIniciados = true;
  console.log('\n[monitors] Iniciando todos los monitores...\n');
  rssMonitor.start();
  twitterMonitor.start();
  tomtomMonitor.start();
  console.log('\n[monitors] Listo.\n');
}

async function startBot() {
  const { version }        = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    version,
    auth:               state,
    printQRInTerminal:  false,
    logger:             silentLogger,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escanea este código QR con WhatsApp > Dispositivos vinculados:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const code           = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[bot] Desconectado (código ${code}). Reconectando: ${shouldReconnect}`);
      if (shouldReconnect) setTimeout(startBot, 3000);
    }

    if (connection === 'open') {
      console.log('[bot] ✅ WhatsApp conectado exitosamente.');
      startMonitors();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignorar mensajes propios, sin contenido, o de estado
      if (msg.key.fromMe)                          continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;
      if (!msg.message)                             continue;

      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      if (!body.trim()) continue;

      try {
        await handle({ body }, (text) =>
          sock.sendMessage(msg.key.remoteJid, { text })
        );
      } catch (err) {
        console.error('[bot] Error al procesar mensaje:', err.message);
      }
    }
  });

  return sock;
}

// ── Arranque ────────────────────────────────────────────────────────────────
console.log('');
console.log('🗺️  Bot Vial Huajuapan de León v1.0');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

if (!process.env.GROQ_API_KEY) {
  console.error('❌ ERROR: Falta GROQ_API_KEY en el archivo .env');
  console.error('   Copia .env.example a .env y agrega tu clave de Groq (gratis en console.groq.com)');
  process.exit(1);
}

startBot().catch((err) => {
  console.error('[bot] Error fatal al iniciar:', err);
  process.exit(1);
});
