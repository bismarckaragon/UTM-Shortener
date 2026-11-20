import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data folder path (can be mapped in Docker/Coolify volume)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'shortener.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance concurrent writes
db.pragma('journal_mode = WAL');

export function initDb() {
  // Table for shortened links
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      destination_url TEXT NOT NULL,
      campaign_name TEXT,
      channel_name TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      utm_term TEXT,
      clicks_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
    CREATE INDEX IF NOT EXISTS idx_links_campaign ON links(campaign_name);
  `);

  // Table for click events / analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER,
      slug TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_hash TEXT,
      country TEXT,
      city TEXT,
      device_type TEXT,
      browser TEXT,
      os TEXT,
      referer TEXT,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON clicks(link_id);
    CREATE INDEX IF NOT EXISTS idx_clicks_timestamp ON clicks(timestamp);
  `);

  // Ensure new tracking columns exist BEFORE creating indexes on them
  try {
    const clickCols = db.prepare("PRAGMA table_info(clicks)").all().map(c => c.name);
    if (!clickCols.includes('utm_source')) {
      db.exec(`
        ALTER TABLE clicks ADD COLUMN utm_source TEXT;
        ALTER TABLE clicks ADD COLUMN utm_medium TEXT;
        ALTER TABLE clicks ADD COLUMN utm_campaign TEXT;
        ALTER TABLE clicks ADD COLUMN utm_content TEXT;
        ALTER TABLE clicks ADD COLUMN utm_term TEXT;
      `);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clicks_utm_source ON clicks(utm_source);`);
  } catch (e) {
    console.warn('[DB Migration Warning]', e.message);
  }

  // Table for form conversions / leads webhook
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      nombre TEXT,
      evento TEXT,
      lista TEXT,
      variante TEXT,
      pagina TEXT,
      referrer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      utm_term TEXT,
      fbclid TEXT,
      zona_horaria TEXT,
      posible_bot INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      raw_payload TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conversions_campaign ON conversions(utm_campaign);
    CREATE INDEX IF NOT EXISTS idx_conversions_source ON conversions(utm_source);
    CREATE INDEX IF NOT EXISTS idx_conversions_medium ON conversions(utm_medium);
    CREATE INDEX IF NOT EXISTS idx_conversions_content ON conversions(utm_content);
    CREATE INDEX IF NOT EXISTS idx_conversions_timestamp ON conversions(timestamp);
  `);

  // Table for link send events (e.g. from GoHighLevel workflows webhook)
  db.exec(`
    CREATE TABLE IF NOT EXISTS link_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER,
      slug TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      contact_id TEXT,
      contact_email TEXT,
      contact_name TEXT,
      workflow_name TEXT,
      channel TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      raw_payload TEXT,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_link_sends_link_id ON link_sends(link_id);
    CREATE INDEX IF NOT EXISTS idx_link_sends_slug ON link_sends(slug);
    CREATE INDEX IF NOT EXISTS idx_link_sends_timestamp ON link_sends(timestamp);
  `);

  // Gracefully add sends_count column to links table if it doesn't exist
  try {
    const linkCols = db.prepare("PRAGMA table_info(links)").all().map(c => c.name);
    if (!linkCols.includes('sends_count')) {
      db.exec(`ALTER TABLE links ADD COLUMN sends_count INTEGER DEFAULT 0;`);
    }
  } catch (e) {
    console.warn('[DB Migration Warning - links.sends_count]', e.message);
  }

  // Table for channel presets (so channels persist on the server for any user/device)
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'other',
      source TEXT NOT NULL,
      medium TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      count INTEGER DEFAULT 1,
      custom_items TEXT DEFAULT '',
      variation_type TEXT DEFAULT 'content',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default presets if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM channel_presets').get();
  if (count.c === 0) {
    const insertPreset = db.prepare(`
      INSERT INTO channel_presets (id, name, category, source, medium, enabled, count, custom_items, variation_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaults = [
      ['whatsapp_viejos', 'WhatsApp Grupos Viejos', 'email', 'whatsapp', 'grupos_viejos', 1, 5, 'mensaje1, mensaje2, mensaje3, mensaje4, mensaje5', 'content'],
      ['whatsapp_nuevos', 'WhatsApp Grupos Nuevos', 'email', 'whatsapp', 'grupos_nuevos', 1, 5, 'mensaje1, mensaje2, mensaje3, mensaje4, mensaje5', 'content'],
      ['whatsapp_directo', 'WhatsApp 1 a 1 / Directo', 'email', 'whatsapp', 'directo', 0, 1, '', 'content'],
      ['fb_feed', 'Facebook Ads (Feed)', 'social', 'facebook', 'paid_social', 1, 1, '', 'content'],
      ['fb_story', 'Facebook Stories', 'social', 'facebook', 'story', 0, 1, '', 'content'],
      ['ig_feed', 'Instagram Ads (Feed)', 'social', 'instagram', 'paid_social', 1, 1, '', 'content'],
      ['ig_story', 'Instagram Stories', 'social', 'instagram', 'story', 1, 1, '', 'content'],
      ['ig_reels', 'Instagram Reels', 'social', 'instagram', 'reel', 1, 1, '', 'content'],
      ['tiktok_ads', 'TikTok Ads', 'social', 'tiktok', 'paid_social', 1, 1, '', 'content'],
      ['google_search', 'Google Search Ads (CPC)', 'search', 'google', 'cpc', 1, 1, '', 'content'],
      ['google_pmax', 'Google Performance Max', 'search', 'google', 'pmax', 0, 1, '', 'content'],
      ['email_newsletter', 'Email Newsletter', 'email', 'newsletter', 'email', 0, 1, '', 'content'],
      ['sms_campaign', 'SMS Difusión', 'email', 'sms', 'sms', 0, 1, '', 'content']
    ];

    const insertTx = db.transaction((rows) => {
      for (const r of rows) insertPreset.run(...r);
    });
    insertTx(defaults);
  }

  // One-time tracked migrations table (guarantees each data fix runs strictly ONCE)
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    const migName = 'move_initial_groups_conversions_to_social_v1';
    const alreadyRan = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(migName);
    if (!alreadyRan) {
      const moved = db.prepare(`UPDATE conversions SET utm_medium = 'social' WHERE LOWER(utm_medium) IN ('grupos_nuevos', 'grupos_viejos')`).run();
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migName);
      console.log(`[DB Migration] ${migName}: movidos ${moved.changes} registros a 'social' para iniciar grupos_nuevos y grupos_viejos en 0.`);
    }
  } catch (e) {
    console.warn('[DB Migration Warning]', e.message);
  }

  // Clean up ONLY broken test clicks tagged as 'direct' or 'directo' from earlier tracker experiments
  try {
    db.prepare(`DELETE FROM clicks WHERE slug = 'landing_tracker' AND (utm_source IS NULL OR utm_source IN ('direct', 'directo'))`).run();
    db.prepare(`DELETE FROM links WHERE slug IN ('__landing_direct', '__direct_directo_ninguno', '__direct_direct_direct')`).run();
  } catch (e) {
    // Ignore if not present
  }

  console.log(`[DB] SQLite database initialized at ${dbPath}`);
}

export default db;
