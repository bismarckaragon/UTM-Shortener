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

app.use(cors());
app.use(express.json());

// Initialize SQLite DB
initDb();

// Helper to anonymize IP for privacy
function hashIp(ip) {
  if (!ip) return 'anon';
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'omnya_salt')).digest('hex').substring(0, 16);
}

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

// Healthcheck for Coolify
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Create single or batch links
app.post('/api/links/batch', (req, res) => {
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
app.get('/api/links', (req, res) => {
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
app.delete('/api/links/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete multiple links in bulk
app.post('/api/links/delete-batch', (req, res) => {
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
app.get('/api/channels', (req, res) => {
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

app.post('/api/channels', (req, res) => {
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

app.delete('/api/channels/:id', (req, res) => {
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
app.get('/api/analytics', (req, res) => {
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

    // Total links and total clicks
    const summary = db.prepare(`
      SELECT 
        COUNT(DISTINCT l.id) as total_links,
        COALESCE(SUM(l.clicks_count), 0) as total_clicks,
        COUNT(DISTINCT c.ip_hash) as unique_visitors
      FROM links l
      LEFT JOIN clicks c ON c.link_id = l.id
      ${linkFilter}
    `).get(...params);

    // Clicks by UTM Source
    const bySource = db.prepare(`
      SELECT 
        COALESCE(l.utm_source, 'directo') as source, 
        COUNT(c.id) as clicks
      FROM clicks c
      JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY source
      ORDER BY clicks DESC
      LIMIT 10
    `).all(...params);

    // Clicks by UTM Medium
    const byMedium = db.prepare(`
      SELECT 
        COALESCE(l.utm_medium, 'ninguno') as medium, 
        COUNT(c.id) as clicks
      FROM clicks c
      JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY medium
      ORDER BY clicks DESC
      LIMIT 10
    `).all(...params);

    // Clicks by UTM Content (Which specific message or ad won)
    const byContent = db.prepare(`
      SELECT 
        COALESCE(l.utm_content, 'sin_contenido') as content,
        l.channel_name,
        COUNT(c.id) as clicks
      FROM clicks c
      JOIN links l ON c.link_id = l.id
      ${linkFilter}
      GROUP BY content, l.channel_name
      ORDER BY clicks DESC
      LIMIT 15
    `).all(...params);

    // Clicks by Country
    const byCountry = db.prepare(`
      SELECT 
        country, 
        COUNT(c.id) as clicks
      FROM clicks c
      JOIN links l ON c.link_id = l.id
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
      JOIN links l ON c.link_id = l.id
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
      JOIN links l ON c.link_id = l.id
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
      timeline
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
