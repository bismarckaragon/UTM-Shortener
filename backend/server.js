import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';
import db, { initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 4000;
const BASE_DOMAIN = process.env.BASE_DOMAIN || `http://localhost:${PORT}`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const AUTH_SECRET = process.env.AUTH_SECRET || (process.env.IP_SALT ? process.env.IP_SALT + '_jwt' : 'omnya_auth_token_key_2026');

app.use(cors());
app.use(express.json());
app.use(express.text({ type: ['text/plain', 'application/json'] }));

// Initialize SQLite DB
initDb();

// Helper to anonymize IP for privacy
function hashIp(ip) {
  if (!ip) return 'anon';
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'omnya_salt')).digest('hex').substring(0, 16);
}

// Generate simple HMAC token for authenticated sessions (lasts 30 days)
function generateAuthToken() {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(String(expires)).digest('hex');
  return `${expires}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token) return false;
  const [expiresStr, signature] = token.split('.');
  if (!expiresStr || !signature) return false;
  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) return false;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(expiresStr).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}

// Middleware to protect API routes from unauthorized access
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifyAuthToken(token)) {
    return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión primero.' });
  }
  next();
}

// -------------------------------------------------------------
// AUTH ENDPOINTS (Login & Session check)
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Contraseña requerida' });
  }

  // Constant time comparison to prevent timing attacks
  const inputBuffer = Buffer.from(password);
  const targetBuffer = Buffer.from(ADMIN_PASSWORD);

  if (inputBuffer.length !== targetBuffer.length || !crypto.timingSafeEqual(inputBuffer, targetBuffer)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  const token = generateAuthToken();
  res.json({ success: true, token });
});

app.get('/api/auth/check', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  res.json({ authenticated: Boolean(token && verifyAuthToken(token)) });
});

// -------------------------------------------------------------
// 1. REDIRECTION ENGINE (Ultra-fast)
// -------------------------------------------------------------
app.get('/r/:slug', (req, res) => {
  handleRedirect(req, res, req.params.slug);
});

// Also support root redirection e.g. https://link.juditcatala.com/bf-wsp-1
app.get('/:slug', (req, res, next) => {
  const { slug } = req.params;
  // Ignore reserved routes and static assets
  if (slug === 'api' || slug === 'favicon.ico' || slug === 'health' || slug.includes('.')) {
    return next();
  }
  handleRedirect(req, res, slug);
});

function handleRedirect(req, res, slug) {
  try {
    const link = db.prepare('SELECT id, destination_url, clicks_count, utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM links WHERE slug = ?').get(slug);

    if (!link) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Enlace no encontrado</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 60px; background: #0b0f19; color: #fff;">
            <h2>Enlace no encontrado o expirado</h2>
            <p style="color: #94a3b8;">El enlace que intentas abrir (${slug}) no existe en este servidor.</p>
          </body>
        </html>
      `);
    }

    // 1. Send immediate 302 redirect so user experience is instant
    res.redirect(302, link.destination_url);

    // 2. Track analytics asynchronously in the background
    setImmediate(() => {
      try {
        // Increment link counter
        db.prepare('UPDATE links SET clicks_count = clicks_count + 1 WHERE id = ?').run(link.id);

        // Extract exact UTMs from destination_url first (so clicks always match what the landing form receives), fallback to link columns
        let clickSource = link.utm_source || null;
        let clickMedium = link.utm_medium || null;
        let clickCampaign = link.utm_campaign || null;
        let clickContent = link.utm_content || null;
        let clickTerm = link.utm_term || null;

        try {
          const destUrl = new URL(link.destination_url);
          if (destUrl.searchParams.get('utm_source')) clickSource = destUrl.searchParams.get('utm_source').toLowerCase().trim();
          if (destUrl.searchParams.get('utm_medium')) clickMedium = destUrl.searchParams.get('utm_medium').toLowerCase().trim();
          if (destUrl.searchParams.get('utm_campaign')) clickCampaign = destUrl.searchParams.get('utm_campaign').toLowerCase().trim();
          if (destUrl.searchParams.get('utm_content')) clickContent = destUrl.searchParams.get('utm_content').toLowerCase().trim();
          if (destUrl.searchParams.get('utm_term')) clickTerm = destUrl.searchParams.get('utm_term').toLowerCase().trim();
        } catch (e) {
          // Keep link column values
        }

        // Parse User Agent
        const ua = req.headers['user-agent'] || '';
        const parser = new UAParser(ua);
        const parsed = parser.getResult();

        const deviceType = parsed.device.type || (ua.toLowerCase().includes('mobile') ? 'mobile' : 'desktop');
        const browser = parsed.browser.name || 'Desconocido';
        const os = parsed.os.name || 'Desconocido';

        // Parse IP & Geolocation
        const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
        const ipHashed = hashIp(rawIp);
        const geo = geoip.lookup(rawIp);
        const country = geo ? geo.country : 'Desconocido';
        const city = geo ? geo.city : 'Desconocido';

        const referer = req.headers['referer'] || req.headers['referrer'] || 'Directo / WhatsApp';

        // Insert click record with exact UTMs
        db.prepare(`
          INSERT INTO clicks (link_id, slug, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ip_hash, country, city, device_type, browser, os, referer)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(link.id, slug, clickSource, clickMedium, clickCampaign, clickContent, clickTerm, ipHashed, country, city, deviceType, browser, os, referer);
      } catch (err) {
        console.error('[Analytics Error]', err);
      }
    });

  } catch (error) {
    console.error('[Redirect Error]', error);
    res.status(500).send('Error interno en la redirección.');
  }
}

// -------------------------------------------------------------
// 2. API ENDPOINTS
// -------------------------------------------------------------

// Lightweight Tracking Script (for landing pages like app.juditcatala.com)
app.get('/track.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(`
(function() {
  try {
    var params = new URLSearchParams(window.location.search);
    var source = params.get('utm_source');
    var medium = params.get('utm_medium');
    var campaign = params.get('utm_campaign');
    var content = params.get('utm_content');
    var term = params.get('utm_term');
    var fbclid = params.get('fbclid');

    // Only track if there are UTMs or ad click IDs
    if (source || medium || campaign || fbclid) {
      var data = {
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
        utm_content: content,
        utm_term: term,
        fbclid: fbclid,
        referrer: document.referrer || '',
        url: window.location.href
      };

      var payloadStr = JSON.stringify(data);
      if (navigator.sendBeacon) {
        navigator.sendBeacon('${BASE_DOMAIN}/api/track', payloadStr);
      } else {
        fetch('${BASE_DOMAIN}/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: payloadStr,
          keepalive: true
        }).catch(function() {});
      }
      console.log('[Omnya Tracker] Visita registrada:', source, medium);
    }
  } catch (e) {
    console.error('[Omnya Tracker Error]', e);
  }
})();
  `);
});

// Endpoint that receives landing page pageviews/clicks from track.js
app.post('/api/track', (req, res) => {
  try {
    let data = {};
    if (typeof req.body === 'string' && req.body.trim()) {
      try {
        data = JSON.parse(req.body);
      } catch (e) {
        data = {};
      }
    } else if (req.body && typeof req.body === 'object') {
      data = req.body;
    }

    // Fallback to query params if body was empty
    const rawSource = data.utm_source || req.query.utm_source;
    const rawMedium = data.utm_medium || req.query.utm_medium;
    const rawCampaign = data.utm_campaign || req.query.utm_campaign;
    const rawContent = data.utm_content || req.query.utm_content;
    const rawTerm = data.utm_term || req.query.utm_term;
    const rawFbclid = data.fbclid || req.query.fbclid;

    // Ignore empty payloads without any UTM or fbclid
    if (!rawSource && !rawMedium && !rawCampaign && !rawFbclid) {
      return res.json({ success: true, skipped: 'no_utms' });
    }
    
    setImmediate(() => {
      try {
        const ua = req.headers['user-agent'] || '';
        const parser = new UAParser(ua);
        const parsed = parser.getResult();
        const deviceType = parsed.device.type || (ua.toLowerCase().includes('mobile') ? 'mobile' : 'desktop');
        const browser = parsed.browser.name || 'Desconocido';
        const os = parsed.os.name || 'Desconocido';

        const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
        const ipHashed = hashIp(rawIp);

        // Prevent double counting if user JUST arrived from one of our shortened links (< 60s ago)
        const recentShortenerClick = db.prepare(`
          SELECT id FROM clicks 
          WHERE ip_hash = ? AND slug != 'landing_tracker' 
          AND timestamp >= datetime('now', '-60 seconds')
          LIMIT 1
        `).get(ipHashed);

        if (recentShortenerClick) {
          return;
        }

        const geo = geoip.lookup(rawIp);
        const country = geo ? geo.country : 'Desconocido';
        const city = geo ? geo.city : 'Desconocido';

        const source = rawSource ? String(rawSource).toLowerCase().trim() : (rawFbclid ? 'meta' : 'directo');
        const medium = rawMedium ? String(rawMedium).toLowerCase().trim() : (rawFbclid ? 'paid' : 'ninguno');
        const campaign = rawCampaign ? String(rawCampaign).toLowerCase().trim() : null;
        const content = rawContent ? String(rawContent).toLowerCase().trim() : null;
        const term = rawTerm ? String(rawTerm).toLowerCase().trim() : null;
        const referer = data.referrer || req.headers['referer'] || 'Directo / Ads';

        // Find or create synthetic link for direct landing tracker matching the UTMs
        let trackerLinkId = null;
        try {
          const slugKey = `__direct_${source}_${medium}`.replace(/[^a-z0-9_-]/g, '_').substring(0, 48);
          const existingLink = db.prepare("SELECT id FROM links WHERE slug = ?").get(slugKey);
          if (existingLink) {
            trackerLinkId = existingLink.id;
            db.prepare('UPDATE links SET clicks_count = clicks_count + 1 WHERE id = ?').run(trackerLinkId);
          } else {
            const ins = db.prepare(`
              INSERT INTO links (slug, destination_url, campaign_name, channel_name, utm_source, utm_medium, utm_campaign, utm_content, utm_term, clicks_count)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `).run(
              slugKey,
              data.url || BASE_DOMAIN,
              campaign || 'Landing Direct',
              source.toUpperCase(),
              source,
              medium,
              campaign,
              content,
              term
            );
            trackerLinkId = ins.lastInsertRowid;
          }
        } catch (e) {
          console.error('[Track Synthetic Link Error]', e);
          trackerLinkId = null;
        }

        db.prepare(`
          INSERT INTO clicks (
            link_id, slug, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            ip_hash, country, city, device_type, browser, os, referer
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          trackerLinkId,
          'landing_tracker',
          source,
          medium,
          campaign,
          content,
          term,
          ipHashed,
          country,
          city,
          deviceType,
          browser,
          os,
          referer
        );
      } catch (e) {
        console.error('[Track View Error]', e);
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Healthcheck for Coolify
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// WEBHOOK for Conversions (from n8n, Webhook or Form)
app.post('/api/webhook/conversion', (req, res) => {
  try {
    const payload = req.body || {};

    // Extract UTMs directly or fallback to parsing the "pagina" URL
    let source = payload.utm_source;
    let medium = payload.utm_medium;
    let campaign = payload.utm_campaign;
    let content = payload.utm_content;
    let term = payload.utm_term;

    if (payload.pagina) {
      try {
        const u = new URL(payload.pagina);
        if (!source) source = u.searchParams.get('utm_source');
        if (!medium) medium = u.searchParams.get('utm_medium');
        if (!campaign) campaign = u.searchParams.get('utm_campaign');
        if (!content) content = u.searchParams.get('utm_content');
        if (!term) term = u.searchParams.get('utm_term');
      } catch (err) {
        // Not a standard URL, continue with payload values
      }
    }

    const email = payload.email ? payload.email.trim().toLowerCase() : null;
    const nombre = payload.nombre ? payload.nombre.trim() : null;
    const evento = payload.evento || null;
    const lista = payload.lista || null;
    const variante = payload.variante || null;
    const pagina = payload.pagina || null;
    const referrer = payload.referrer || null;
    const fbclid = payload.fbclid || null;
    const zona_horaria = payload.zona_horaria || null;
    const posible_bot = payload.posible_bot ? 1 : 0;
    const fecha = payload.fecha ? new Date(payload.fecha).toISOString() : new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO conversions (
        email, nombre, evento, lista, variante, pagina, referrer,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        fbclid, zona_horaria, posible_bot, timestamp, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      email,
      nombre,
      evento,
      lista,
      variante,
      pagina,
      referrer,
      source ? source.toLowerCase().trim() : null,
      medium ? medium.toLowerCase().trim() : null,
      campaign ? campaign.toLowerCase().trim() : null,
      content ? content.toLowerCase().trim() : null,
      term ? term.toLowerCase().trim() : null,
      fbclid,
      zona_horaria,
      posible_bot,
      fecha,
      JSON.stringify(payload)
    );

    res.json({ success: true, message: 'Conversión registrada con éxito' });
  } catch (err) {
    console.error('[Conversion Webhook Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// WEBHOOK for Link Sends (from GoHighLevel / GHL Workflows or any automation)
// Accepts POST (JSON body or query params) and GET (query params)
function handleLinkSendWebhook(req, res) {
  try {
    let payload = {};
    if (typeof req.body === 'string' && req.body.trim()) {
      try {
        payload = JSON.parse(req.body);
      } catch (e) {
        payload = {};
      }
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body;
    }

    // GHL puts custom webhook key-values inside payload.customData OR at root level
    const custom = (payload.customData && typeof payload.customData === 'object') ? payload.customData : {};
    const q = req.query || {};

    // Extract slug directly OR from a full short URL (e.g. https://go.juditcatala.com/bf-ig-1)
    let rawSlug = q.slug || custom.slug || payload.slug || '';
    const rawUrl = q.url || q.link || q.short_url || custom.url || custom.link || custom.short_url || payload.url || payload.link || payload.short_url || '';

    if (!rawSlug && rawUrl) {
      try {
        const parsedUrl = new URL(String(rawUrl).trim());
        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        // Handle both /r/:slug and /:slug
        if (segments.length >= 2 && segments[0] === 'r') {
          rawSlug = segments[1];
        } else if (segments.length >= 1) {
          rawSlug = segments[segments.length - 1];
        }
      } catch (e) {
        // Fallback: take last segment after /
        const parts = String(rawUrl).trim().split('/').filter(Boolean);
        rawSlug = parts[parts.length - 1] || '';
      }
    }

    const slug = String(rawSlug || '').trim();
    if (!slug) {
      return res.status(400).json({
        error: 'Falta identificar el enlace. Envía "slug" o "link" (ej: ?slug=mi-enlace o {"link": "https://go.juditcatala.com/mi-enlace"}).'
      });
    }

    // Find the link in DB (exact match first, then case-insensitive)
    const link = db.prepare('SELECT id, slug, channel_name, sends_count FROM links WHERE slug = ? OR LOWER(slug) = LOWER(?) LIMIT 1').get(slug, slug);

    const quantityRaw = Number(q.count || q.quantity || custom.count || custom.quantity || payload.count || payload.quantity || 1);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;

    const contactId = String(q.contact_id || custom.contact_id || payload.contact_id || payload.id || '').trim() || null;
    const contactEmail = String(q.email || custom.email || payload.email || '').trim().toLowerCase() || null;
    const contactName = String(
      q.name || q.full_name || custom.name || payload.full_name ||
      [payload.first_name, payload.last_name].filter(Boolean).join(' ') || ''
    ).trim() || null;
    const workflowName = String(
      q.workflow || q.workflow_name || custom.workflow || custom.workflow_name ||
      payload.workflow_name || (payload.workflow && payload.workflow.name) || ''
    ).trim() || null;
    const channel = String(
      q.channel || custom.channel || payload.channel || (link && link.channel_name) || ''
    ).trim() || null;

    db.prepare(`
      INSERT INTO link_sends (
        link_id, slug, quantity, contact_id, contact_email, contact_name, workflow_name, channel, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      link ? link.id : null,
      link ? link.slug : slug,
      quantity,
      contactId,
      contactEmail,
      contactName,
      workflowName,
      channel,
      JSON.stringify({ query: q, body: payload })
    );

    if (link) {
      db.prepare('UPDATE links SET sends_count = COALESCE(sends_count, 0) + ? WHERE id = ?').run(quantity, link.id);
    }

    const updatedLink = link ? db.prepare('SELECT sends_count, clicks_count FROM links WHERE id = ?').get(link.id) : null;

    res.json({
      success: true,
      message: 'Envío registrado con éxito',
      slug: link ? link.slug : slug,
      matched_link: Boolean(link),
      quantity,
      sends_count: updatedLink ? updatedLink.sends_count : quantity,
      clicks_count: updatedLink ? updatedLink.clicks_count : 0
    });
  } catch (err) {
    console.error('[Link Send Webhook Error]', err);
    res.status(500).json({ error: err.message });
  }
}

app.post('/api/webhook/send', handleLinkSendWebhook);
app.get('/api/webhook/send', handleLinkSendWebhook);

// BATCH IMPORT CONVERSIONS (e.g. from CSV or historical export)
app.post('/api/conversions/import', requireAuth, (req, res) => {
  try {
    const { conversions } = req.body;
    if (!Array.isArray(conversions) || conversions.length === 0) {
      return res.status(400).json({ error: 'Lista de conversiones requerida' });
    }

    const stmt = db.prepare(`
      INSERT INTO conversions (
        email, nombre, evento, lista, variante, pagina, referrer,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        fbclid, zona_horaria, posible_bot, timestamp, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const email = row.email ? row.email.trim().toLowerCase() : null;
        const nombre = row.nombre ? row.nombre.trim() : null;
        const evento = row.evento || 'Black Friday 2026';
        const lista = row.lista || 'captacion_historica';
        const variante = row.variante || null;
        const pagina = row.pagina || null;
        const referrer = row.referrer || null;
        const source = row.utm_source ? row.utm_source.toLowerCase().trim() : null;
        const medium = row.utm_medium ? row.utm_medium.toLowerCase().trim() : null;
        const campaign = row.utm_campaign ? row.utm_campaign.toLowerCase().trim() : null;
        const content = row.utm_content ? row.utm_content.toLowerCase().trim() : null;
        const term = row.utm_term ? row.utm_term.toLowerCase().trim() : null;
        const fbclid = row.fbclid || null;
        const zona_horaria = row.zona_horaria || null;
        const posible_bot = row.posible_bot ? 1 : 0;
        const fecha = row.fecha ? new Date(row.fecha).toISOString() : new Date().toISOString();

        stmt.run(
          email,
          nombre,
          evento,
          lista,
          variante,
          pagina,
          referrer,
          source,
          medium,
          campaign,
          content,
          term,
          fbclid,
          zona_horaria,
          posible_bot,
          fecha,
          JSON.stringify(row)
        );
        imported++;
      }
    });

    insertMany(conversions);

    res.json({ success: true, count: imported, message: `Se importaron ${imported} contactos exitosamente` });
  } catch (err) {
    console.error('[Batch Import Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Create single or batch links
app.post('/api/links/batch', requireAuth, (req, res) => {
  try {
    const { items, campaignName } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debes enviar un arreglo de items con destination_url.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO links (slug, destination_url, campaign_name, channel_name, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const results = [];
    const transaction = db.transaction((linksToInsert) => {
      for (const item of linksToInsert) {
        // Use custom slug or generate a clean 6-character nanoid
        let finalSlug = item.customSlug ? item.customSlug.trim().toLowerCase().replace(/\s+/g, '-') : nanoid(6);

        // Check collision if custom slug was passed
        let existing = db.prepare('SELECT id FROM links WHERE slug = ?').get(finalSlug);
        if (existing && !item.customSlug) {
          finalSlug = nanoid(7);
        }

        const info = insertStmt.run(
          finalSlug,
          item.destinationUrl,
          campaignName || item.utm_campaign || 'General',
          item.channelName || 'Canal',
          item.utm_source || null,
          item.utm_medium || null,
          item.utm_campaign || null,
          item.utm_content || null,
          item.utm_term || null
        );

        results.push({
          id: info.lastInsertRowid,
          slug: finalSlug,
          shortUrl: `${BASE_DOMAIN}/${finalSlug}`,
          channelName: item.channelName,
          destinationUrl: item.destinationUrl,
          utm_source: item.utm_source,
          utm_medium: item.utm_medium,
          utm_content: item.utm_content
        });
      }
    });

    transaction(items);

    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error('[API Batch Links]', error);
    res.status(500).json({ error: error.message });
  }
});

// List all links with stats
app.get('/api/links', requireAuth, (req, res) => {
  try {
    const { campaign, search } = req.query;
    let query = 'SELECT * FROM links';
    const params = [];
    const conditions = ["slug NOT LIKE '__direct_%'", "slug != '__landing_direct'"];

    if (campaign) {
      conditions.push('campaign_name = ?');
      params.push(campaign);
    }
    if (search) {
      conditions.push('(slug LIKE ? OR destination_url LIKE ? OR channel_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY id DESC LIMIT 500';

    const links = db.prepare(query).all(...params);

    const formatted = links.map(l => ({
      ...l,
      shortUrl: `${BASE_DOMAIN}/${l.slug}`
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a single link
app.delete('/api/links/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete multiple links in bulk
app.post('/api/links/delete-batch', requireAuth, (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debes enviar un arreglo de ids para eliminar.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM links WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true, count: ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// CHANNEL PRESETS API (Save & Sync across all devices)
// -------------------------------------------------------------
app.get('/api/channels', requireAuth, (req, res) => {
  try {
    const channels = db.prepare('SELECT * FROM channel_presets ORDER BY rowid ASC').all();
    const formatted = channels.map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      source: c.source,
      medium: c.medium,
      enabled: Boolean(c.enabled),
      count: c.count,
      customItems: c.custom_items,
      variationType: c.variation_type
    }));
    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/channels', requireAuth, (req, res) => {
  try {
    const { id, name, category, source, medium, enabled, count, customItems, variationType } = req.body;
    if (!id || !name || !source || !medium) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    db.prepare(`
      INSERT INTO channel_presets (id, name, category, source, medium, enabled, count, custom_items, variation_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        source = excluded.source,
        medium = excluded.medium,
        enabled = excluded.enabled,
        count = excluded.count,
        custom_items = excluded.custom_items,
        variation_type = excluded.variation_type
    `).run(
      id,
      name,
      category || 'other',
      source,
      medium,
      enabled ? 1 : 0,
      count || 1,
      customItems || '',
      variationType || 'content'
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/channels/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM channel_presets WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 3. ANALYTICS API (Comprehensive dashboard metrics)
// -------------------------------------------------------------
app.get('/api/analytics', requireAuth, (req, res) => {
  try {
    const { linkId, campaign } = req.query;

    let linkFilter = '';
    const params = [];

    if (linkId) {
      linkFilter = 'WHERE l.id = ?';
      params.push(linkId);
    } else if (campaign) {
      linkFilter = 'WHERE l.campaign_name = ?';
      params.push(campaign);
    }

    // 1. Total links count and fast clicks sum directly from links table
    const linksSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_links,
        COALESCE(SUM(clicks_count), 0) as total_clicks
      FROM links l
      ${linkFilter}
    `).get(...params);

    // 2. Real total events and unique visitors directly from clicks table
    // (includes both shortened links clicks and direct landing page tracking)
    let clicksFilter = '';
    const clickParams = [];
    if (linkId) {
      clicksFilter = 'WHERE link_id = ?';
      clickParams.push(linkId);
    } else if (campaign) {
      clicksFilter = 'WHERE link_id IN (SELECT id FROM links WHERE campaign_name = ?) OR LOWER(utm_campaign) = LOWER(?)';
      clickParams.push(campaign, campaign);
    }

    const clicksSummary = db.prepare(`
      SELECT 
        COUNT(*) as recorded_clicks,
        COUNT(DISTINCT ip_hash) as unique_visitors
      FROM clicks
      ${clicksFilter}
    `).get(...clickParams);

    // 3. Conversions summary (total leads, unique leads)
    const convFilter = campaign ? 'WHERE utm_campaign = ?' : '';
    const convSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_conversions,
        COUNT(DISTINCT email) as unique_leads
      FROM conversions
      ${convFilter}
    `).get(campaign ? [campaign] : []);

    // Conversions that match tracked links (only sources that have actual links created and clicked)
    const trackedStats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM clicks c JOIN links l ON c.link_id = l.id ${linkFilter}) as tracked_clicks,
        (
          SELECT COUNT(*) 
          FROM conversions c
          WHERE LOWER(c.utm_source) IN (SELECT DISTINCT LOWER(utm_source) FROM links ${linkFilter})
          ${campaign ? 'AND c.utm_campaign = ?' : ''}
        ) as tracked_conversions
    `).get(...params, ...(campaign ? [campaign] : []));

    const totalClicksNum = clicksSummary.recorded_clicks || linksSummary.total_clicks || 0;
    const totalConvNum = convSummary?.total_conversions || 0;
    const trackedClicksNum = trackedStats?.tracked_clicks || linksSummary.total_clicks || 0;
    const trackedConvNum = trackedStats?.tracked_conversions || 0;
    
    // Pure rate of tracked channels: tracked leads / tracked clicks
    const convRate = trackedClicksNum > 0 ? Number(((trackedConvNum / trackedClicksNum) * 100).toFixed(2)) : 0;

    // Total sends summary (from GHL / automation webhooks)
    const sendsSummary = db.prepare(`
      SELECT COALESCE(SUM(ls.quantity), 0) as total_sends
      FROM link_sends ls
      LEFT JOIN links l ON ls.link_id = l.id
      ${linkFilter}
    `).get(...params);

    const totalSendsNum = sendsSummary?.total_sends || 0;

    // Funnel per shortened link: Enviados (GHL) -> Abiertos (Clics) -> Registros Reales (Leads)
    const realLinkConditions = ["l.slug NOT LIKE '__direct_%'", "l.slug != '__landing_direct'"];
    const funnelParams = [];
    if (linkId) {
      realLinkConditions.push('l.id = ?');
      funnelParams.push(linkId);
    } else if (campaign) {
      realLinkConditions.push('l.campaign_name = ?');
      funnelParams.push(campaign);
    }

    const rawLinkFunnel = db.prepare(`
      SELECT
        l.id,
        l.slug,
        l.channel_name,
        l.campaign_name,
        l.utm_source,
        l.utm_medium,
        l.utm_campaign,
        l.utm_content,
        l.utm_term,
        COALESCE((SELECT SUM(ls.quantity) FROM link_sends ls WHERE ls.link_id = l.id OR LOWER(ls.slug) = LOWER(l.slug)), l.sends_count, 0) as sends,
        COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id), l.clicks_count, 0) as clicks,
        (
          SELECT COUNT(*)
          FROM conversions conv
          WHERE LOWER(COALESCE(conv.utm_source, '')) = LOWER(COALESCE(l.utm_source, ''))
            AND (l.utm_medium IS NULL OR l.utm_medium = '' OR LOWER(COALESCE(conv.utm_medium, '')) = LOWER(l.utm_medium))
            AND (l.utm_campaign IS NULL OR l.utm_campaign = '' OR LOWER(COALESCE(conv.utm_campaign, '')) = LOWER(l.utm_campaign))
            AND (l.utm_content IS NULL OR l.utm_content = '' OR LOWER(COALESCE(conv.utm_content, '')) = LOWER(l.utm_content))
            AND (l.utm_term IS NULL OR l.utm_term = '' OR LOWER(COALESCE(conv.utm_term, '')) = LOWER(l.utm_term))
        ) as conversions
      FROM links l
      WHERE ${realLinkConditions.join(' AND ')}
      ORDER BY sends DESC, clicks DESC, conversions DESC
      LIMIT 100
    `).all(...funnelParams);

    const linkFunnel = rawLinkFunnel.map(row => {
      const sends = Number(row.sends) || 0;
      const clicks = Number(row.clicks) || 0;
      const conversions = Number(row.conversions) || 0;
      return {
        ...row,
        shortUrl: `${BASE_DOMAIN}/${row.slug}`,
        sends,
        clicks,
        conversions,
        open_rate: sends > 0 ? Number(((clicks / sends) * 100).toFixed(1)) : null,
        click_to_lead_rate: clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(1)) : null,
        send_to_lead_rate: sends > 0 ? Number(((conversions / sends) * 100).toFixed(1)) : null
      };
    });

    const summary = {
      total_links: linksSummary.total_links,
      total_sends: totalSendsNum,
      total_clicks: totalClicksNum,
      unique_visitors: clicksSummary.unique_visitors || 0,
      total_conversions: totalConvNum,
      unique_leads: convSummary?.unique_leads || 0,
      tracked_clicks: trackedClicksNum,
      tracked_conversions: trackedConvNum,
      conversion_rate: convRate
    };

    // Conversions by UTM Source (and comparison with clicks)
    const convBySource = db.prepare(`
      SELECT 
        COALESCE(utm_source, 'directo') as source,
        COUNT(*) as conversions,
        COUNT(DISTINCT email) as unique_leads
      FROM conversions
      ${convFilter}
      GROUP BY source
      ORDER BY conversions DESC
    `).all(campaign ? [campaign] : []);

    // Conversions by UTM Medium
    const convByMedium = db.prepare(`
      SELECT 
        COALESCE(utm_medium, 'ninguno') as medium,
        COUNT(*) as conversions,
        COUNT(DISTINCT email) as unique_leads
      FROM conversions
      ${convFilter}
      GROUP BY medium
      ORDER BY conversions DESC
    `).all(campaign ? [campaign] : []);

    // Conversions by UTM Content (Which specific message converted)
    const convByContent = db.prepare(`
      SELECT 
        COALESCE(utm_content, 'sin_contenido') as content,
        COUNT(*) as conversions,
        COUNT(DISTINCT email) as unique_leads
      FROM conversions
      ${convFilter}
      GROUP BY content
      ORDER BY conversions DESC
    `).all(campaign ? [campaign] : []);

    // Recent 20 leads
    const recentLeads = db.prepare(`
      SELECT id, nombre, email, evento, utm_source, utm_medium, utm_campaign, utm_content, timestamp
      FROM conversions
      ${convFilter}
      ORDER BY id DESC
      LIMIT 20
    `).all(campaign ? [campaign] : []);

    // Clicks by UTM Source (if c.utm_source exists from tracker, prioritize it over generic synthetic link)
    const bySource = db.prepare(`
      SELECT 
        COALESCE(COALESCE(c.utm_source, l.utm_source), 'directo') as source, 
        COUNT(c.id) as clicks
      FROM clicks c
      LEFT JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY source
      ORDER BY clicks DESC
      LIMIT 10
    `).all(...params);

    // Clicks by UTM Medium
    const byMedium = db.prepare(`
      SELECT 
        COALESCE(COALESCE(c.utm_medium, l.utm_medium), 'ninguno') as medium, 
        COUNT(c.id) as clicks
      FROM clicks c
      LEFT JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY medium
      ORDER BY clicks DESC
      LIMIT 10
    `).all(...params);

    // Clicks by UTM Content (Which specific message or ad won)
    const byContent = db.prepare(`
      SELECT 
        COALESCE(COALESCE(l.utm_content, c.utm_content), 'sin_contenido') as content,
        COALESCE(l.channel_name, 'Landing Directo') as channel_name,
        COUNT(c.id) as clicks
      FROM clicks c
      LEFT JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY content, channel_name
      ORDER BY clicks DESC
      LIMIT 15
    `).all(...params);

    // Clicks by Country
    const byCountry = db.prepare(`
      SELECT 
        country, 
        COUNT(c.id) as clicks
      FROM clicks c
      LEFT JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY country
      ORDER BY clicks DESC
      LIMIT 10
    `).all(...params);

    // Clicks by Device Type
    const byDevice = db.prepare(`
      SELECT 
        device_type, 
        COUNT(c.id) as clicks
      FROM clicks c
      LEFT JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY device_type
      ORDER BY clicks DESC
    `).all(...params);

    // Clicks by Date / Timeline (last 30 days)
    const timeline = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', c.timestamp) as date, 
        COUNT(c.id) as clicks,
        COUNT(DISTINCT c.ip_hash) as unique_clicks
      FROM clicks c
      LEFT JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY date
      ORDER BY date ASC
      LIMIT 30
    `).all(...params);

    res.json({
      success: true,
      summary,
      linkFunnel,
      bySource,
      byMedium,
      byContent,
      byCountry,
      byDevice,
      timeline,
      convBySource,
      convByMedium,
      convByContent,
      recentLeads
    });
  } catch (error) {
    console.error('[Analytics API]', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend static build if running in combined container
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

// For SPA routing
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/r/')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Omnya UTM Shortener & Analytics Server Running`);
  console.log(`URL: ${BASE_DOMAIN}`);
  console.log(`Port: ${PORT}`);
  console.log(`====================================================`);
});
