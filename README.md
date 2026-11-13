# Omnya UTM Generator & Link Shortener with Analytics

Herramienta independiente y optimizada para la creación masiva de enlaces con parámetros UTM, acortador de URLs integrado y visualización de analíticas en tiempo real.

---

## 🚀 Características Principales

1. **Generador Masivo 1-Clic:** Genera todas las variaciones de UTM de una campaña completa (WhatsApp, Facebook Ads, Google Ads, TikTok, Email) de forma instantánea.
2. **Soporte para múltiples mensajes/variaciones:** Crea 10, 20 o 50 mensajes de WhatsApp o anuncios (`utm_content=mensaje1`, `mensaje2`, etc.) en un solo formulario.
3. **Acortador Inteligente Automático:** Transforma URLs largas con UTMs en enlaces cortos (ej. `https://link.tudominio.com/aB3x9`).
4. **Redirección Ultrarrápida (302):** El backend redirige en milisegundos y procesa las analíticas en segundo plano sin ralentizar la experiencia del usuario.
5. **Dashboard de Analíticas sin Cookies:**
   - Clics totales y visitantes únicos.
   - Rendimiento por canal (`utm_source`) y por medio (`utm_medium`).
   - Mensajes/creativos ganadores (`utm_content`).
   - Detección de dispositivos (Móvil vs Escritorio) y país de procedencia.
6. **Diseñado para Coolify:** Incluye `Dockerfile` multicapa y `docker-compose.yml` listos para desplegar en tu VPS con tu propio dominio o subdominio.

---

## 🛠️ Estructura del Proyecto

```
omnya-utm-shortener/
├── backend/                  # Servidor Express, redirección y SQLite
│   ├── server.js
│   ├── db.js
│   └── package.json
├── frontend/                 # Interfaz React + Vite + Lucide
│   ├── src/
│   │   ├── components/
│   │   │   ├── UtmShortenerStudio.tsx   # Generador y acortador masivo
│   │   │   ├── LinkManager.tsx          # Gestor de enlaces y clics
│   │   │   └── AnalyticsDashboard.tsx   # Gráficos y analíticas
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── Dockerfile                # Dockerfile de producción multicapa
├── docker-compose.yml        # Configuración para Coolify / Docker
└── README.md
```

---

## 🌐 Despliegue en Coolify (VPS)

1. **Crea un nuevo repositorio en GitHub** (ej. `omnya-utm-shortener`).
2. Sube el contenido de la carpeta `omnya-utm-shortener` a ese repositorio:
   ```bash
   cd omnya-utm-shortener
   git init
   git add .
   git commit -m "Initial commit - UTM Shortener App"
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
3. **En tu panel de Coolify:**
   - Haz clic en **+ New Resource** $\rightarrow$ **Application** $\rightarrow$ **Public/Private GitHub Repository**.
   - Selecciona el repositorio.
   - En **Build Pack**, Coolify detectará automáticamente el `Dockerfile`.
   - En **Domains**, escribe tu dominio o subdominio (ej. `link.juditcatala.com` o `go.omnyaventures.com`).
   - En **Environment Variables**, configura:
     ```env
     PORT=4000
     BASE_DOMAIN=https://link.juditcatala.com
     DATA_DIR=/app/backend/data
     ```
   - En **Persistent Storage / Volumes**, añade un volumen para conservar la base de datos de SQLite en reinicios:
     - **Destination Path:** `/app/backend/data`
   - Haz clic en **Deploy**.

---

## 💻 Ejecución Local (Desarrollo)

### 1. Iniciar el Backend
```bash
cd backend
npm install
npm run dev
# Corre en http://localhost:4000
```

### 2. Iniciar el Frontend
```bash
cd frontend
npm install
npm run dev
# Corre en http://localhost:3000 con proxy automático al backend
```
