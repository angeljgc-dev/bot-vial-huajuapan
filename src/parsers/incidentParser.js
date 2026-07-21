'use strict';
const config = require('../config');

let groqClient = null;

function getClient() {
  if (groqClient) return groqClient;
  if (!config.groqApiKey) return null;
  const Groq = require('groq-sdk');
  // groq-sdk exporta la clase como default; compatible con CJS y ESM
  const GroqClass = Groq.default || Groq;
  groqClient = new GroqClass({ apiKey: config.groqApiKey });
  return groqClient;
}

// Pre-filtro sin costo: descarta artículos sin ninguna palabra clave vial
function hasVialKeyword(text) {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return config.incidentKeywords.some(kw =>
    normalized.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g, ''))
  );
}

const SYSTEM_PROMPT = `Eres un extractor de incidentes viales para Huajuapan de León, Oaxaca, México.
Analiza el texto y extrae el incidente vial principal si existe.

Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicaciones):
{"incidente": {"tipo": "accidente|calle_cerrada|bloqueo|inundacion|derrumbe|bache|reten|operativo|otro", "calle": "nombre de la calle (omite este campo si no se menciona)", "entre_calles": "intersección o referencia (omite este campo si no se menciona)", "ciudad": "nombre de la ciudad", "severidad": "baja|media|alta", "descripcion": "resumen en máximo 15 palabras"}}

Usa "reten" para retenes policiales o alcoholímetros. Usa "operativo" para operativos de seguridad o revisiones masivas.

IMPORTANTE: si un campo no tiene información, simplemente NO lo incluyas en el JSON. Nunca escribas la palabra "null" como valor de texto.

Si el texto NO describe un incidente vial real o no tiene datos suficientes, responde exactamente:
{"incidente": null}`;

async function parse(item) {
  const client = getClient();
  if (!client) return null;

  const rawText = `${item.title}. ${item.description || ''}`.slice(0, 1200);
  if (!hasVialKeyword(rawText)) return null;

  try {
    const res = await client.chat.completions.create({
      model:       config.groqModel,
      temperature: 0,
      max_tokens:  280,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: rawText },
      ],
    });

    const raw = res.choices[0]?.message?.content?.trim() || '{}';
    // Extraer el JSON aunque venga con backticks por error del modelo
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed  = JSON.parse(jsonStr);

    if (!parsed.incidente) return null;

    // Sanitizar: el LLM a veces devuelve el string "null" en lugar de JSON null
    const inc = parsed.incidente;
    const clean = (v) => (!v || v === 'null' || v === 'undefined' ? null : v);

    return {
      tipo:         clean(inc.tipo)         || 'otro',
      calle:        clean(inc.calle),
      entre_calles: clean(inc.entre_calles),
      ciudad:       clean(inc.ciudad),
      severidad:    clean(inc.severidad)    || 'media',
      descripcion:  clean(inc.descripcion),
      fuente:       item.feedName,
      url:          item.link  || null,
      titulo:       item.title || null,
    };
  } catch {
    return null;
  }
}

module.exports = { parse, hasVialKeyword };
