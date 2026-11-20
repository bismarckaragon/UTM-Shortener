import React, { useState, useEffect } from 'react';
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Search,
  MousePointerClick,
  CheckSquare,
  Square,
  FolderKanban
} from 'lucide-react';

interface CampaignGroupItem {
  id: string;
  name: string;
}

interface LinkItem {
  id: number;
  slug: string;
  shortUrl: string;
  destination_url: string;
  campaign_name: string;
  campaign_group?: string;
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
  const [campaigns, setCampaigns] = useState<CampaignGroupItem[]>([]);
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('all');
  const [moveTargetCampaign, setMoveTargetCampaign] = useState<string>('');
  const [_loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCampaigns = async () => {
    const token = localStorage.getItem('omnya_shortener_token') || '';
    try {
      const res = await fetch('/api/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.data) {
        setCampaigns(json.data);
        if (json.data.length > 0 && !moveTargetCampaign) {
          setMoveTargetCampaign(json.data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLinks = async (groupOverride?: string) => {
    setLoading(true);
    const token = localStorage.getItem('omnya_shortener_token') || '';
    const activeGroup = groupOverride !== undefined ? groupOverride : selectedCampaignFilter;
    const qs = activeGroup && activeGroup !== 'all' ? `?campaignGroup=${encodeURIComponent(activeGroup)}` : '';
    try {
      const res = await fetch(`/api/links${qs}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.data) setLinks(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchLinks('all');
  }, []);

  const handleFilterChange = (val: string) => {
    setSelectedCampaignFilter(val);
    setSelectedIds([]);
    fetchLinks(val);
  };

  const handleAssignCampaignSelected = async () => {
    if (selectedIds.length === 0 || !moveTargetCampaign) return;
    const token = localStorage.getItem('omnya_shortener_token') || '';
    try {
      const res = await fetch('/api/links/assign-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedIds, campaignGroup: moveTargetCampaign })
      });
      const json = await res.json();
      if (json.success) {
        setSelectedIds([]);
        fetchLinks();
      } else {
        alert(json.error || 'Error moviendo enlaces');
      }
    } catch (e) {
      alert('Error de conexión');
    }
  };

  const getCampaignLabel = (groupId?: string) => {
    if (!groupId) return 'Sin campaña';
    return campaigns.find(c => c.id === groupId)?.name || groupId;
  };

  const handleCopy = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar este enlace acortado?')) return;
    const token = localStorage.getItem('omnya_shortener_token') || '';
    try {
      await fetch(`/api/links/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setLinks(prev => prev.filter(l => l.id !== id));
      setSelectedIds(prev => prev.filter(i => i !== id));
    } catch (e) {
      alert('Error eliminando enlace');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`¿Seguro que deseas eliminar los ${selectedIds.length} enlaces seleccionados? Esta acción no se puede deshacer.`)) return;

    setIsDeleting(true);
    const token = localStorage.getItem('omnya_shortener_token') || '';
    try {
      const res = await fetch('/api/links/delete-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedIds })
      });
      const data = await res.json();
      if (data.success) {
        setLinks(prev => prev.filter(l => !selectedIds.includes(l.id)));
        setSelectedIds([]);
      } else {
        alert(data.error || 'Error al eliminar enlaces.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al conectar con el servidor.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(l => l.id));
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {selectedIds.length > 0 && (
            <>
              {campaigns.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(124, 58, 237, 0.12)', border: '1px solid var(--primary)', borderRadius: '8px', padding: '4px 8px' }}>
                  <select
                    value={moveTargetCampaign}
                    onChange={(e) => setMoveTargetCampaign(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                  >
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id} style={{ background: '#0f172a', color: '#fff' }}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignCampaignSelected}
                    style={{
                      background: 'var(--primary)',
                      border: 'none',
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Mover ({selectedIds.length})
                  </button>
                </div>
              )}

              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--error)',
                  color: 'var(--error)',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={16} />
                <span>{isDeleting ? 'Eliminando...' : `Eliminar Seleccionados (${selectedIds.length})`}</span>
              </button>
            </>
          )}

          {/* Campaign Group Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 10px' }}>
            <FolderKanban size={15} color="var(--primary-hover)" />
            <select
              value={selectedCampaignFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '0.84rem',
                outline: 'none',
                cursor: 'pointer',
                padding: '4px 2px'
              }}
            >
              <option value="all" style={{ background: '#0f172a', color: '#fff' }}>Todas las campañas</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id} style={{ background: '#0f172a', color: '#fff' }}>{c.name}</option>
              ))}
            </select>
          </div>

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
                <th style={{ padding: '12px 14px', width: '40px', textAlign: 'center' }}>
                  <div onClick={toggleSelectAll} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                    {selectedIds.length > 0 && selectedIds.length === filtered.length ? (
                      <CheckSquare size={16} color="var(--primary-hover)" />
                    ) : (
                      <Square size={16} color="var(--text-muted)" />
                    )}
                  </div>
                </th>
                <th style={{ padding: '12px 14px' }}>ENLACE CORTO</th>
                <th style={{ padding: '12px 14px' }}>CANAL / CAMPAÑA</th>
                <th style={{ padding: '12px 14px' }}>CONTENIDO (utm_content)</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>CLICS</th>
                <th style={{ padding: '12px 14px' }}>DESTINO FINAL</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: isSelected ? 'rgba(124, 58, 237, 0.08)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div onClick={() => toggleSelectOne(item.id)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                        {isSelected ? (
                          <CheckSquare size={16} color="var(--primary-hover)" />
                        ) : (
                          <Square size={16} color="var(--text-muted)" />
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code style={{ color: 'var(--secondary-hover)', fontWeight: 600, fontSize: '0.9rem' }}>
                          /{item.slug}
                        </code>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{item.channel_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span>{item.campaign_name}</span>
                        {item.campaign_group && (
                          <span style={{ background: 'rgba(124, 58, 237, 0.18)', color: '#c4b5fd', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600 }}>
                            {getCampaignLabel(item.campaign_group)}
                          </span>
                        )}
                      </div>
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
