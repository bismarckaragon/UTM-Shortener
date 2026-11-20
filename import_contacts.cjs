import fs from 'fs';
import path from 'path';

// Usage:
// node import_contacts.cjs <SERVER_URL> <TOKEN> [CSV_FILE]
// e.g.: node import_contacts.cjs https://go.juditcatala.com YOUR_ADMIN_TOKEN

const SERVER_URL = process.argv[2] || 'http://localhost:5000';
const TOKEN = process.argv[3];
const CSV_FILE = process.argv[4] || path.join(__dirname, '../Export_Contacts_BF 2026_Nov_2026_6_30_AM.csv');

if (!TOKEN) {
  console.error('Uso: node import_contacts.cjs <SERVER_URL> <ADMIN_TOKEN> [CSV_FILE]');
  process.exit(1);
}

if (!fs.existsSync(CSV_FILE)) {
  console.error('No se encuentra el archivo CSV:', CSV_FILE);
  process.exit(1);
}

console.log('Leyendo archivo:', CSV_FILE);
const content = fs.readFileSync(CSV_FILE, 'utf8');
const lines = content.split('\n');

const conversions = [];
const sourcesCount = {};

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
  let match;
  const row = [];
  while ((match = regex.exec(line)) !== null) {
    let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
    row.push(val);
  }

  const firstName = row[1] || '';
  const lastName = row[2] || '';
  const fullName = (firstName + ' ' + lastName).trim();
  const email = row[4]?.trim().toLowerCase();
  const tagsStr = row[6] || '';
  const rawSource = (row[7] || '').trim().toLowerCase();

  if (!email) continue;

  const tags = tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  let source = rawSource;
  let medium = 'directo';
  let campaign = null;
  let contentTag = null;
  let variante = null;

  if (source === 'meta') {
    medium = 'paid';
  } else if (source === 'whatsapp') {
    medium = 'social'; // o grupos
  } else if (source === 'newsletter') {
    medium = 'email';
  } else if (source === 'qr') {
    medium = 'offline';
  }

  for (const t of tags) {
    if (t === 'black_friday_a' || t === 'black_friday_b') {
      variante = t;
    } else if (t.startsWith('bf2026') || t.startsWith('bf26-tt-abo')) {
      campaign = t;
    } else if (t.startsWith('ad ') || t.startsWith('mensaje') || t.startsWith('sin-data')) {
      contentTag = t;
    }
  }

  sourcesCount[source] = (sourcesCount[source] || 0) + 1;

  conversions.push({
    email,
    nombre: fullName || 'Contacto BF',
    evento: 'Black Friday 2026',
    lista: 'captacion_historica',
    variante,
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign || 'bf2026',
    utm_content: contentTag,
    utm_term: null,
    fecha: new Date().toISOString()
  });
}

console.log(`Procesados ${conversions.length} contactos.`);
console.log('Distribución:', sourcesCount);

// Enviar en batches de 100
async function upload() {
  const batchSize = 100;
  let totalUploaded = 0;

  for (let i = 0; i < conversions.length; i += batchSize) {
    const batch = conversions.slice(i, i + batchSize);
    console.log(`Enviando lote ${i + 1} a ${Math.min(i + batchSize, conversions.length)}...`);

    const res = await fetch(`${SERVER_URL}/api/conversions/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ conversions: batch })
    });

    const json = await res.json();
    if (!res.ok) {
      console.error('Error al subir lote:', json);
      process.exit(1);
    }
    totalUploaded += json.count || batch.length;
  }

  console.log(`✅ ¡Éxito! Total de ${totalUploaded} contactos importados a la base de datos.`);
}

upload().catch(err => {
  console.error('Error en carga:', err);
});
