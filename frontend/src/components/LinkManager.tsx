import React, { useState, useEffect } from 'react';
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Search,
  MousePointerClick
} from 'lucide-react';

interface LinkItem {
  id: number;
  slug: string;
  shortUrl: string;
  destination_url: string;
  campaign_name: string;
  channel_name: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  clicks_count: number;
  created_at: string;
}

export const LinkManager: React.FC = () => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [_loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/links');
      const json = await res.json();
      if (json.data) setLinks(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleCopy = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar este enlace acortado?')) return;
    try {
      await fetch(`/api/links/${id}`, { method: 'DELETE' });
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      alert('Error eliminando enlace');
    }
  };

  const filtered = links.filter(l => {
    const s = searchTerm.toLowerCase();
    return (
      l.slug.toLowerCase().includes(s) ||
      (l.campaign_name && l.campaign_name.toLowerCase().includes(s)) ||
      (l.channel_name && l.channel_name.toLowerCase().includes(s)) ||
      (l.utm_content && l.utm_content.toLowerCase().includes(s)) ||
      l.destination_url.toLowerCase().includes(s)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ padding: '24px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link2 size={24} color="var(--primary-hover)" />
            <span>Gestor de Enlaces Acortados ({links.length})</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Monitorea el total de clics en tiempo real y gestiona las redirecciones activas.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
            <input
              type="text"
              placeholder="Buscar por slug, campaña o canal..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                padding: '8px 14px 8px 36px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem',
                width: '280px'
              }}
            />
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '20px', overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No hay enlaces acortados creados todavía.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                <th style={{ padding: '12px 14px' }}>ENLACE CORTO</th>
                <th style={{ padding: '12px 14px' }}>CANAL / CAMPAÑA</th>
                <th style={{ padding: '12px 14px' }}>CONTENIDO (utm_content)</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>CLICS</th>
                <th style={{ padding: '12px 14px' }}>DESTINO FINAL</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ color: 'var(--secondary-hover)', fontWeight: 600, fontSize: '0.9rem' }}>
                        /{item.slug}
                      </code>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{item.channel_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.campaign_name}</div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {item.utm_content ? (
                      <span style={{ background: 'rgba(236, 72, 153, 0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {item.utm_content}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: item.clicks_count > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                      color: item.clicks_count > 0 ? 'var(--success)' : 'var(--text-muted)',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontWeight: 700
                    }}>
                      <MousePointerClick size={12} />
                      <span>{item.clicks_count}</span>
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', maxWidth: '250px' }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }} title={item.destination_url}>
                      {item.destination_url}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleCopy(item.shortUrl, item.id)}
                        style={{
                          background: copiedId === item.id ? 'var(--success)' : 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border-color)',
                          color: copiedId === item.id ? '#fff' : 'var(--text-primary)',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedId === item.id ? 'Copiado' : 'Copiar'}</span>
                      </button>

                      <a
                        href={item.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-muted)',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Probar enlace corto"
                      >
                        <ExternalLink size={12} />
                      </a>

                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          padding: '6px',
                          cursor: 'pointer'
                        }}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
