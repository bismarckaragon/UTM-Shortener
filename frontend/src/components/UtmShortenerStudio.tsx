import React, { useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Download,
  Sparkles,
  CheckSquare,
  Square,
  Scissors
} from 'lucide-react';

interface ChannelPreset {
  id: string;
  name: string;
  category: 'social' | 'search' | 'email' | 'other';
  source: string;
  medium: string;
  enabled: boolean;
  count?: number;
  customItems?: string;
  variationType?: 'content' | 'medium';
}

const DEFAULT_CHANNELS: ChannelPreset[] = [
  // Redes Sociales
  { id: 'fb_feed', name: 'Facebook Ads (Feed)', category: 'social', source: 'facebook', medium: 'paid_social', enabled: true, count: 1, variationType: 'content' },
  { id: 'fb_story', name: 'Facebook Stories', category: 'social', source: 'facebook', medium: 'story', enabled: false, count: 1, variationType: 'content' },
  { id: 'ig_feed', name: 'Instagram Ads (Feed)', category: 'social', source: 'instagram', medium: 'paid_social', enabled: true, count: 1, variationType: 'content' },
  { id: 'ig_story', name: 'Instagram Stories', category: 'social', source: 'instagram', medium: 'story', enabled: true, count: 1, variationType: 'content' },
  { id: 'ig_reels', name: 'Instagram Reels', category: 'social', source: 'instagram', medium: 'reel', enabled: true, count: 1, variationType: 'content' },
  { id: 'tiktok_ads', name: 'TikTok Ads', category: 'social', source: 'tiktok', medium: 'paid_social', enabled: true, count: 1, variationType: 'content' },
  { id: 'youtube_ads', name: 'YouTube Ads', category: 'social', source: 'youtube', medium: 'video_ad', enabled: false, count: 1, variationType: 'content' },

  // Google
  { id: 'google_search', name: 'Google Search Ads (CPC)', category: 'search', source: 'google', medium: 'cpc', enabled: true, count: 1, variationType: 'content' },
  { id: 'google_pmax', name: 'Google Performance Max', category: 'search', source: 'google', medium: 'pmax', enabled: false, count: 1, variationType: 'content' },

  // Email y WhatsApp
  { id: 'email_newsletter', name: 'Email Newsletter', category: 'email', source: 'newsletter', medium: 'email', enabled: true, count: 1, variationType: 'content' },
  { id: 'whatsapp_msg', name: 'WhatsApp Grupos / Mensajes', category: 'email', source: 'whatsapp', medium: 'grupos_viejos', enabled: true, count: 5, customItems: 'mensaje1, mensaje2, mensaje3, mensaje4, mensaje5', variationType: 'content' },
  { id: 'sms_campaign', name: 'SMS Difusión', category: 'email', source: 'sms', medium: 'sms', enabled: false, count: 1, variationType: 'content' }
];

interface GeneratedResultItem {
  id: string;
  channelName: string;
  fullUrl: string;
  shortUrl?: string;
  slug?: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
}

export const UtmShortenerStudio: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignContent, setCampaignContent] = useState('');
  const [campaignTerm, setCampaignTerm] = useState('');
  const [autoShorten, setAutoShorten] = useState(true);

  const [channels, setChannels] = useState<ChannelPreset[]>(() => {
    const saved = localStorage.getItem('omnya_standalone_channels');
    return saved ? JSON.parse(saved) : DEFAULT_CHANNELS;
  });

  const [results, setResults] = useState<GeneratedResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const toggleChannel = (id: string) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const updateChannel = (id: string, updates: Partial<ChannelPreset>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const selectAll = (enabled: boolean) => {
    setChannels(prev => prev.map(c => ({ ...c, enabled })));
  };

  const buildUrl = (dest: string, source: string, medium: string, campaign: string, content?: string, term?: string) => {
    let clean = dest.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = 'https://' + clean;
    try {
      const u = new URL(clean);
      if (source) u.searchParams.set('utm_source', source.toLowerCase().replace(/\s+/g, '_'));
      if (medium) u.searchParams.set('utm_medium', medium.toLowerCase().replace(/\s+/g, '_'));
      if (campaign) u.searchParams.set('utm_campaign', campaign.toLowerCase().replace(/\s+/g, '_'));
      if (content && content.trim()) u.searchParams.set('utm_content', content.toLowerCase().replace(/\s+/g, '_'));
      if (term && term.trim()) u.searchParams.set('utm_term', term.toLowerCase().replace(/\s+/g, '_'));
      return u.toString();
    } catch {
      return clean;
    }
  };

  const handleGenerateAndShorten = async () => {
    if (!baseUrl.trim() || !campaignName.trim()) {
      alert('Ingresa la URL de destino y el nombre de la campaña.');
      return;
    }

    const active = channels.filter(c => c.enabled);
    if (active.length === 0) {
      alert('Selecciona al menos un canal.');
      return;
    }

    setLoading(true);
    const preparedItems: any[] = [];

    active.forEach(c => {
      const count = Math.max(1, c.count || 1);
      const customList = c.customItems ? c.customItems.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
      const total = Math.max(count, customList.length);
      const varType = c.variationType || 'content';

      if (total === 1) {
        const effContent = customList[0] || campaignContent;
        const full = buildUrl(baseUrl, c.source, c.medium, campaignName, effContent, campaignTerm);
        preparedItems.push({
          channelName: c.name,
          destinationUrl: full,
          utm_source: c.source,
          utm_medium: c.medium,
          utm_campaign: campaignName,
          utm_content: effContent
        });
      } else {
        for (let i = 1; i <= total; i++) {
          const customLabel = customList[i - 1] || `mensaje${i}`;
          const med = varType === 'medium' ? customLabel : c.medium;
          const con = varType === 'content' ? customLabel : campaignContent;
          const full = buildUrl(baseUrl, c.source, med, campaignName, con, campaignTerm);
          preparedItems.push({
            channelName: `${c.name} (#${i}: ${customLabel})`,
            destinationUrl: full,
            utm_source: c.source,
            utm_medium: med,
            utm_campaign: campaignName,
            utm_content: con
          });
        }
      }
    });

    if (autoShorten) {
      try {
        const res = await fetch('/api/links/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: preparedItems, campaignName })
        });
        const data = await res.json();
        if (data.data) {
          setResults(data.data.map((d: any) => ({
            id: String(d.id),
            channelName: d.channelName,
            fullUrl: d.destinationUrl,
            shortUrl: d.shortUrl,
            slug: d.slug,
            source: d.utm_source,
            medium: d.utm_medium,
            campaign: campaignName,
            content: d.utm_content
          })));
        }
      } catch (err) {
        console.error(err);
        alert('Error al conectar con el servidor de acortado.');
      } finally {
        setLoading(false);
      }
    } else {
      setResults(preparedItems.map((p, idx) => ({
        id: String(idx),
        channelName: p.channelName,
        fullUrl: p.destinationUrl,
        source: p.utm_source,
        medium: p.utm_medium,
        campaign: campaignName,
        content: p.utm_content
      })));
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    const text = results.map(r => `${r.channelName}:\n${r.shortUrl || r.fullUrl}`).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExportCsv = () => {
    const headers = ['Canal', 'Enlace Corto', 'URL Larga con UTMs', 'Fuente', 'Medio', 'Campaña', 'Contenido'];
    const rows = results.map(r => [
      `"${r.channelName}"`,
      `"${r.shortUrl || ''}"`,
      `"${r.fullUrl}"`,
      `"${r.source}"`,
      `"${r.medium}"`,
      `"${r.campaign}"`,
      `"${r.content || ''}"`
    ]);
    const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `utms_${campaignName || 'campana'}.csv`;
    link.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      {/* Configuration Card */}
      <div className="glass-card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Scissors size={22} color="var(--primary-hover)" />
            <span>Generador Masivo de UTMs & Acortador 1-Clic</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Configura tu campaña y genera enlaces cortos con analítica integrada al instante.
          </p>
        </div>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              URL Destino (Landing page) *
            </label>
            <input
              type="text"
              placeholder="https://app.juditcatala.com/registro-bf"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Campaña (utm_campaign) *
            </label>
            <input
              type="text"
              placeholder="ej. bf2026, lanzamiento_marzo"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Contenido Base (utm_content) (Opcional)
            </label>
            <input
              type="text"
              placeholder="ej. video_v1, gancho_precio"
              value={campaignContent}
              onChange={e => setCampaignContent(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Audiencia / Keyword (utm_term) (Opcional)
            </label>
            <input
              type="text"
              placeholder="ej. retargeting, publico_frio"
              value={campaignTerm}
              onChange={e => setCampaignTerm(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        {/* Channels Section */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Canales a generar ({channels.filter(c => c.enabled).length} seleccionados)</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => selectAll(true)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>Todos</button>
              <button onClick={() => selectAll(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>Ninguno</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
            {channels.map(channel => (
              <div
                key={channel.id}
                style={{
                  background: channel.enabled ? 'rgba(124, 58, 237, 0.12)' : 'rgba(255,255,255,0.02)',
                  border: channel.enabled ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div onClick={() => toggleChannel(channel.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  {channel.enabled ? <CheckSquare size={16} color="var(--primary-hover)" /> : <Square size={16} color="var(--text-muted)" />}
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: channel.enabled ? '#fff' : 'var(--text-secondary)' }}>{channel.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>source: {channel.source} | medium: {channel.medium}</div>
                  </div>
                </div>

                {channel.enabled && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                        <span>Cantidad:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={channel.count || 1}
                          onChange={e => updateChannel(channel.id, { count: parseInt(e.target.value) || 1 })}
                          style={{ width: '50px', padding: '2px 4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px', textAlign: 'center' }}
                        />
                        <span style={{ color: 'var(--text-muted)' }}>URLs</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem' }}>
                        <span>Variar:</span>
                        <select
                          value={channel.variationType || 'content'}
                          onChange={e => updateChannel(channel.id, { variationType: e.target.value as any })}
                          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', color: 'var(--secondary)', borderRadius: '4px', fontSize: '0.7rem' }}
                        >
                          <option value="content">utm_content</option>
                          <option value="medium">utm_medium</option>
                        </select>
                      </div>
                    </div>

                    {(channel.count && channel.count > 1) && (
                      <input
                        type="text"
                        placeholder="Nombres separados por comas (ej. mensaje1, mensaje2...)"
                        value={channel.customItems || ''}
                        onChange={e => updateChannel(channel.id, { customItems: e.target.value })}
                        style={{ width: '100%', padding: '4px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px', fontSize: '0.72rem' }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={autoShorten}
              onChange={e => setAutoShorten(e.target.checked)}
              style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <span>Acortar enlaces automáticamente y activar métricas</span>
          </label>

          <button
            onClick={handleGenerateAndShorten}
            disabled={loading}
            style={{
              padding: '12px 26px',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <Sparkles size={16} />
            <span>{loading ? 'Generando y acortando...' : 'Generar y Acortar Todas (1 Clic)'}</span>
          </button>
        </div>
      </div>

      {/* Results Card */}
      {results.length > 0 && (
        <div className="glass-card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Enlaces Listos ({results.length})</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>Campaña: {campaignName}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCopyAll} style={{ background: copiedAll ? 'var(--success)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {copiedAll ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedAll ? '¡Copiadas!' : 'Copiar Todas'}</span>
              </button>
              <button onClick={handleExportCsv} style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid var(--secondary)', color: 'var(--secondary)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={14} />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {results.map(item => (
              <div key={item.id} style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>{item.channelName}</span>
                    {item.content && (
                      <span style={{ fontSize: '0.72rem', background: 'rgba(236,72,153,0.15)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '4px' }}>
                        {item.content}
                      </span>
                    )}
                  </div>
                  {item.shortUrl ? (
                    <div style={{ fontFamily: 'monospace', color: 'var(--secondary-hover)', fontSize: '0.85rem' }}>{item.shortUrl}</div>
                  ) : (
                    <div style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.75rem', wordBreak: 'break-all' }}>{item.fullUrl}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleCopy(item.shortUrl || item.fullUrl, item.id)}
                    style={{ background: copiedId === item.id ? 'var(--success)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    {copiedId === item.id ? 'Copiado' : 'Copiar'}
                  </button>
                  {item.shortUrl && (
                    <a href={item.shortUrl} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '6px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
