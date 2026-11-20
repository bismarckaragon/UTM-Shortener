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
    const link = db.prepare('SELECT id, destination_url, clicks_count FROM links WHERE slug = ?').get(slug);

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

        // Insert click record
        db.prepare(`
          INSERT INTO clicks (link_id, slug, ip_hash, country, city, device_type, browser, os, referer)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(link.id, slug, ipHashed, country, city, deviceType, browser, os, referer);
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
  res.setHeader('Cache-Control', 'public, max-age=3600');
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

      if (navigator.sendBeacon) {
        navigator.sendBeacon('${BASE_DOMAIN}/api/track', JSON.stringify(data));
      } else {
        fetch('${BASE_DOMAIN}/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
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
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    
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
        const geo = geoip.lookup(rawIp);
        const country = geo ? geo.country : 'Desconocido';
        const city = geo ? geo.city : 'Desconocido';

        const source = data.utm_source ? data.utm_source.toLowerCase().trim() : 'directo';
        const medium = data.utm_medium ? data.utm_medium.toLowerCase().trim() : 'ninguno';
        const campaign = data.utm_campaign ? data.utm_campaign.toLowerCase().trim() : null;
        const content = data.utm_content ? data.utm_content.toLowerCase().trim() : null;
        const term = data.utm_term ? data.utm_term.toLowerCase().trim() : null;
        const referer = data.referrer || req.headers['referer'] || 'Directo / Ads';

        db.prepare(`
          INSERT INTO clicks (
            link_id, slug, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            ip_hash, country, city, device_type, browser, os, referer
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          null,
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
    const conditions = [];

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

    // Conversions that match tracked links (to calculate realistic conversion rate without inflating external untracked traffic)
    const trackedConvSummary = db.prepare(`
      SELECT COUNT(*) as tracked_conversions
      FROM conversions c
      WHERE EXISTS (
        SELECT 1 FROM links l 
        WHERE LOWER(l.utm_source) = LOWER(c.utm_source)
        ${campaign ? 'AND l.campaign_name = ?' : ''}
      )
    `).get(campaign ? [campaign] : []);

    const totalClicksNum = clicksSummary.recorded_clicks || linksSummary.total_clicks || 0;
    const totalConvNum = convSummary?.total_conversions || 0;
    const trackedConvNum = trackedConvSummary?.tracked_conversions || 0;
    
    // Accurate rate: conversions from channels with tracked links / total clicks
    const convRate = totalClicksNum > 0 ? Number(((trackedConvNum / totalClicksNum) * 100).toFixed(2)) : 0;

    const summary = {
      total_links: linksSummary.total_links,
      total_clicks: totalClicksNum,
      unique_visitors: clicksSummary.unique_visitors || 0,
      total_conversions: totalConvNum,
      unique_leads: convSummary?.unique_leads || 0,
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

    // Clicks by UTM Source (including both shortener links and landing tracker)
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
        COALESCE(COALESCE(c.utm_content, l.utm_content), 'sin_contenido') as content,
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
