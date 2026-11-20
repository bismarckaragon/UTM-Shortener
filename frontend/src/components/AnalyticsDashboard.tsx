import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Globe,
  Smartphone,
  MousePointerClick,
  TrendingUp,
  RefreshCw,
  Layers,
  UserCheck,
  Percent,
  Webhook,
  Copy,
  Check,
  Send,
  FolderKanban,
  Plus
} from 'lucide-react';

interface CampaignGroupItem {
  id: string;
  name: string;
  utm_campaigns: string;
  links_count?: number;
  clicks_count?: number;
  conversions_count?: number;
}

interface LinkFunnelItem {
  id: number;
  slug: string;
  shortUrl: string;
  channel_name: string | null;
  campaign_name: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  sends: number;
  clicks: number;
  conversions: number;
  open_rate: number | null;
  click_to_lead_rate: number | null;
  send_to_lead_rate: number | null;
}

interface AnalyticsData {
  summary: {
    total_links: number;
    total_sends?: number;
    total_clicks: number;
    unique_visitors: number;
    total_conversions: number;
    unique_leads: number;
    tracked_clicks?: number;
    tracked_conversions?: number;
    conversion_rate: number;
  };
  linkFunnel?: LinkFunnelItem[];
  bySource: { source: string; clicks: number }[];
  byMedium: { medium: string; clicks: number }[];
  byContent: { content: string; channel_name: string; clicks: number }[];
  byCountry: { country: string; clicks: number }[];
  byDevice: { device_type: string; clicks: number }[];
  timeline: { date: string; clicks: number; unique_clicks: number }[];
  convBySource: { source: string; conversions: number; unique_leads: number }[];
  convByMedium: { medium: string; conversions: number; unique_leads: number }[];
  convByContent: { content: string; conversions: number; unique_leads: number }[];
  recentLeads: {
    id: number;
    nombre: string;
    email: string;
    evento: string;
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
    timestamp: string;
  }[];
}

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedSendWebhook, setCopiedSendWebhook] = useState(false);
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const [onlyWithSends, setOnlyWithSends] = useState(false);

  // Campaign Grouping state
  const [campaigns, setCampaigns] = useState<CampaignGroupItem[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampName, setNewCampName] = useState('');
  const [newCampUtms, setNewCampUtms] = useState('');
  const [savingCamp, setSavingCamp] = useState(false);

  const webhookUrl = `${window.location.origin}/api/webhook/conversion`;
  const sendWebhookUrl = `${window.location.origin}/api/webhook/send`;

  const fetchCampaigns = async () => {
    const token = localStorage.getItem('omnya_shortener_token') || '';
    try {
      const res = await fetch('/api/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.data) setCampaigns(json.data);
    } catch (err) {
      console.error('Error cargando campañas:', err);
    }
  };

  const fetchAnalytics = async (groupOverride?: string) => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('omnya_shortener_token') || '';
    const activeGroup = groupOverride !== undefined ? groupOverride : selectedCampaign;
    const qs = activeGroup && activeGroup !== 'all' ? `?campaignGroup=${encodeURIComponent(activeGroup)}` : '';
    try {
      const res = await fetch(`/api/analytics${qs}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error cargando métricas');
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchAnalytics('all');
  }, []);

  const handleCampaignChange = (val: string) => {
    setSelectedCampaign(val);
    fetchAnalytics(val);
  };

  const handleCreateCampaign = async () => {
    if (!newCampName.trim()) {
      alert('Escribe un nombre para la campaña (ej. Venta Black Friday 2026).');
      return;
    }
    setSavingCamp(true);
    const token = localStorage.getItem('omnya_shortener_token') || '';
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newCampName.trim(),
          utm_campaigns: newCampUtms.trim()
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error creando campaña');
      setNewCampName('');
      setNewCampUtms('');
      setShowNewCampaign(false);
      await fetchCampaigns();
      if (json.data?.id) {
        setSelectedCampaign(json.data.id);
        fetchAnalytics(json.data.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error creando campaña');
    } finally {
      setSavingCamp(false);
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleCopySendWebhook = () => {
    navigator.clipboard.writeText(`${sendWebhookUrl}?slug=TU_SLUG`);
    setCopiedSendWebhook(true);
    setTimeout(() => setCopiedSendWebhook(false), 2000);
  };

  const funnelRows = (data?.linkFunnel || []).filter(item => !onlyWithSends || item.sends > 0);

  // Build combined source list (clicks + conversions + conversion rate)
  const allSources = Array.from(new Set([
    ...(data?.bySource?.map(s => s.source) || []),
    ...(data?.convBySource?.map(c => c.source) || [])
  ]));

  const sourceComparison = allSources.map(src => {
    const clickObj = data?.bySource?.find(s => s.source.toLowerCase() === src.toLowerCase());
    const convObj = data?.convBySource?.find(c => c.source.toLowerCase() === src.toLowerCase());
    const clicks = clickObj ? clickObj.clicks : 0;
    const convs = convObj ? convObj.conversions : 0;
    const rate = clicks > 0 ? Number(((convs / clicks) * 100).toFixed(1)) : null;
    return { source: src, clicks, convs, rate };
  }).sort((a, b) => b.convs - a.convs || b.clicks - a.clicks);

  // Build combined medium list
  const allMediums = Array.from(new Set([
    ...(data?.byMedium?.map(m => m.medium) || []),
    ...(data?.convByMedium?.map(c => c.medium) || [])
  ]));

  const mediumComparison = allMediums.map(med => {
    const clickObj = data?.byMedium?.find(m => m.medium.toLowerCase() === med.toLowerCase());
    const convObj = data?.convByMedium?.find(c => c.medium.toLowerCase() === med.toLowerCase());
    const clicks = clickObj ? clickObj.clicks : 0;
    const convs = convObj ? convObj.conversions : 0;
    const rate = clicks > 0 ? Number(((convs / clicks) * 100).toFixed(1)) : null;
    return { medium: med, clicks, convs, rate };
  }).sort((a, b) => b.convs - a.convs || b.clicks - a.clicks);

  // Build combined content / message list
  const allContents = Array.from(new Set([
    ...(data?.byContent?.map(c => c.content) || []),
    ...(data?.convByContent?.map(c => c.content) || [])
  ]));

  const contentComparison = allContents.map(con => {
    const clickObj = data?.byContent?.find(c => c.content.toLowerCase() === con.toLowerCase());
    const convObj = data?.convByContent?.find(c => c.content.toLowerCase() === con.toLowerCase());
    const clicks = clickObj ? clickObj.clicks : 0;
    const convs = convObj ? convObj.conversions : 0;
    const channel = clickObj?.channel_name || '';
    const rate = clicks > 0 ? Number(((convs / clicks) * 100).toFixed(1)) : null;
    return { content: con, channel, clicks, convs, rate };
  }).sort((a, b) => b.convs - a.convs || b.clicks - a.clicks);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      {/* Header */}
      <div className="glass-card" style={{ padding: '24px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={24} color="var(--secondary)" />
            <span>Panel de Analítica: Clics vs Registros Reales</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Compara el rendimiento de tus enlaces UTM con las conversiones que llegan desde n8n en tiempo real.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Campaign Group Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 10px' }}>
            <FolderKanban size={15} color="var(--primary-hover)" />
            <select
              value={selectedCampaign}
              onChange={(e) => handleCampaignChange(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '0.84rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                padding: '4px 2px'
              }}
            >
              <option value="all" style={{ background: '#0f172a', color: '#fff' }}>Todas las campañas</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id} style={{ background: '#0f172a', color: '#fff' }}>
                  {c.name} ({c.conversions_count ?? 0} leads)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowNewCampaign(!showNewCampaign)}
            style={{
              background: 'rgba(124, 58, 237, 0.15)',
              border: '1px solid var(--primary)',
              color: '#c4b5fd',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>Nueva Campaña</span>
          </button>

          <button
            onClick={() => setShowWebhookGuide(!showWebhookGuide)}
            style={{
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid var(--secondary)',
              color: 'var(--secondary)',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Webhook size={14} />
            <span>Webhooks (n8n / GHL)</span>
          </button>

          <button
            onClick={() => { fetchCampaigns(); fetchAnalytics(); }}
            disabled={loading}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border-color)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Create New Campaign Drawer */}
      {showNewCampaign && (
        <div className="glass-card" style={{ padding: '18px 24px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, color: '#fff', fontSize: '0.96rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderKanban size={16} color="var(--primary-hover)" />
            <span>Crear Nueva Campaña / Etapa</span>
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Nombre de la Campaña / Etapa *
              </label>
              <input
                type="text"
                placeholder="ej. Venta Black Friday 2026"
                value={newCampName}
                onChange={e => setNewCampName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                utm_campaign asociados (opcional, separados por coma)
              </label>
              <input
                type="text"
                placeholder="ej. bf2026_venta, venta-bf-ads"
                value={newCampUtms}
                onChange={e => setNewCampUtms(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleCreateCampaign}
                disabled={savingCamp}
                style={{
                  background: 'var(--primary)',
                  border: 'none',
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                {savingCamp ? 'Guardando...' : 'Crear Campaña'}
              </button>
              <button
                onClick={() => setShowNewCampaign(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  padding: '9px 14px',
                  borderRadius: '6px',
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Guide Drawer */}
      {showWebhookGuide && (
        <div className="glass-card" style={{ padding: '20px 24px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--secondary)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={16} color="var(--primary-hover)" />
                <span>1. Webhook de Envíos desde GoHighLevel (GHL Workflows)</span>
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>● Endpoint Activo</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
              En tu Workflow de GHL, agrega una acción <strong>Webhook (POST)</strong> justo cuando envíes el mensaje con el link acortado. Puedes pasar el slug en la URL (<code>?slug=tu-slug</code>) o en <strong>Custom Data</strong> enviando <code>slug</code> o <code>link</code> (la URL corta completa):
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <code style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#a5b4fc', fontFamily: 'monospace', fontSize: '0.84rem' }}>
                POST {sendWebhookUrl}?slug=TU_SLUG
              </code>
              <button
                onClick={handleCopySendWebhook}
                style={{
                  background: copiedSendWebhook ? 'var(--success)' : 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem'
                }}
              >
                {copiedSendWebhook ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedSendWebhook ? 'Copiado' : 'Copiar URL'}</span>
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Webhook size={16} color="var(--secondary)" />
                <span>2. Webhook de Registros desde n8n (Conversiones)</span>
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>● Endpoint Activo</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
              En tu flujo de n8n, agrega un nodo <strong>HTTP Request</strong> justo después de que alguien llena el formulario para enviar el JSON a esta URL:
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <code style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--secondary-hover)', fontFamily: 'monospace', fontSize: '0.84rem' }}>
                POST {webhookUrl}
              </code>
              <button
                onClick={handleCopyWebhook}
                style={{
                  background: copiedWebhook ? 'var(--success)' : 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem'
                }}
              >
                {copiedWebhook ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedWebhook ? 'Copiado' : 'Copiar URL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: '8px', color: 'var(--error)', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Main KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '20px', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', color: '#a5b4fc' }}>Links Enviados (GHL)</span>
            <Send size={18} color="#a5b4fc" />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.total_sends ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Señales recibidas desde workflows
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Clics Totales</span>
            <MousePointerClick size={18} color="var(--primary-hover)" />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.total_clicks ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {data?.summary.unique_visitors ?? 0} visitantes únicos
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--success)' }}>Registros Reales (Leads)</span>
            <UserCheck size={18} color="var(--success)" />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.total_conversions ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {data?.summary.unique_leads ?? 0} correos únicos recibidos
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--secondary)' }}>Conv. Enlaces Rastreados</span>
            <Percent size={18} color="var(--secondary)" />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.conversion_rate ?? 0}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {data?.summary.tracked_conversions ?? 0} leads de {data?.summary.tracked_clicks ?? data?.summary.total_clicks ?? 0} clics rastreados
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Enlaces Activos</span>
            <Layers size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.total_links ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            UTMs rastreadas en el sistema
          </div>
        </div>
      </div>

      {/* Funnel por Enlace: Enviados (GHL) vs Abiertos (Clics) vs Registros Reales */}
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={18} color="#a5b4fc" />
              <span>Embudo por Link Acortado: Enviados (GHL) → Abiertos (Clics) → Registros</span>
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
              Compara cuántas veces se disparó cada enlace en tus automatizaciones frente a cuántas veces se abrió y cuántos leads generó.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={onlyWithSends}
              onChange={(e) => setOnlyWithSends(e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            <span>Solo enlaces con envíos GHL</span>
          </label>
        </div>

        {funnelRows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '22px 0' }}>
            {onlyWithSends
              ? 'Aún no hay enlaces con envíos registrados desde GHL. Configura el webhook POST /api/webhook/send en tu workflow.'
              : 'Aún no hay enlaces acortados creados.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.73rem' }}>
                  <th style={{ padding: '10px 12px' }}>ENLACE / UTMs</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>ENVIADOS (GHL)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>ABIERTOS (CLICS)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>% APERTURA</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>REGISTROS</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>CONV. CLIC→LEAD</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>CONV. ENVÍO→LEAD</th>
                </tr>
              </thead>
              <tbody>
                {funnelRows.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 12px' }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        /{item.slug}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {[item.utm_source, item.utm_medium, item.utm_content].filter(Boolean).join(' · ') || item.channel_name || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: item.sends > 0 ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.04)',
                        color: item.sends > 0 ? '#a5b4fc' : 'var(--text-muted)',
                        padding: '3px 10px',
                        borderRadius: '10px',
                        fontWeight: 700
                      }}>
                        {item.sends}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 600, color: '#fff' }}>
                      {item.clicks}
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: item.open_rate !== null && item.open_rate >= 20 ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.05)',
                        color: item.open_rate !== null && item.open_rate >= 20 ? 'var(--secondary)' : 'var(--text-muted)',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        {item.open_rate !== null ? `${item.open_rate}%` : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>
                      {item.conversions}
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: item.click_to_lead_rate !== null && item.click_to_lead_rate >= 20 ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                        color: item.click_to_lead_rate !== null && item.click_to_lead_rate >= 20 ? 'var(--success)' : 'var(--text-muted)',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        {item.click_to_lead_rate !== null ? `${item.click_to_lead_rate}%` : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: item.send_to_lead_rate !== null && item.send_to_lead_rate >= 10 ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                        color: item.send_to_lead_rate !== null && item.send_to_lead_rate >= 10 ? 'var(--success)' : 'var(--text-muted)',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        {item.send_to_lead_rate !== null ? `${item.send_to_lead_rate}%` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Comparisons Section: Clics vs Registros por Canal & Medio */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* Canales (utm_source) */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} color="var(--secondary)" />
            <span>Conversión por Canal (utm_source)</span>
          </h3>

          {sourceComparison.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
              Aún no hay clics ni registros registrados.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sourceComparison.map(item => (
                <div key={item.source} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{item.source}</span>
                    <span style={{ fontSize: '0.8rem', color: item.rate !== null ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600, background: item.rate !== null ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                      {item.rate !== null ? `${item.rate}% conv.` : 'N/A (sin clics)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    <span>{item.clicks} clics</span>
                    <strong style={{ color: 'var(--success)' }}>{item.convs} registros reales</strong>
                  </div>
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, item.rate ?? (item.convs > 0 ? 100 : 0))}%`, height: '100%', background: 'linear-gradient(90deg, var(--secondary), var(--success))' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Medios (utm_medium) */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} color="var(--primary-hover)" />
            <span>Conversión por Medio (utm_medium)</span>
          </h3>

          {mediumComparison.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
              Sin datos de medios registrados aún.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {mediumComparison.map(item => (
                <div key={item.medium} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{item.medium}</span>
                    <span style={{ fontSize: '0.8rem', color: item.rate !== null ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600, background: item.rate !== null ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                      {item.rate !== null ? `${item.rate}% conv.` : 'N/A (sin clics)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    <span>{item.clicks} clics</span>
                    <strong style={{ color: 'var(--success)' }}>{item.convs} registros reales</strong>
                  </div>
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, item.rate ?? (item.convs > 0 ? 100 : 0))}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--success))' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mensajes Ganadores (utm_content) */}
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={18} color="var(--accent)" />
          <span>Efectividad de Mensajes y Creativos (utm_content)</span>
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
          Descubre cuál mensaje exacto de WhatsApp, email o anuncio trajo la mayor cantidad de registros reales.
        </p>

        {contentComparison.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
            Sin datos de contenido aún.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <th style={{ padding: '10px 12px' }}>MENSAJE / CREATIVO (utm_content)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>CLICS</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>REGISTROS REALES</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>TASA DE CONVERSIÓN</th>
                </tr>
              </thead>
              <tbody>
                {contentComparison.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 12px', fontWeight: 600, color: '#fff' }}>
                      <span style={{ background: 'rgba(236,72,153,0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', marginRight: '8px' }}>
                        {item.content}
                      </span>
                      {item.channel && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({item.channel})</span>}
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {item.clicks}
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>
                      {item.convs}
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: item.rate !== null && item.rate > 20 ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                        color: item.rate !== null && item.rate > 20 ? 'var(--success)' : 'var(--text-muted)',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        {item.rate !== null ? `${item.rate}%` : 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Leads Table */}
      {data?.recentLeads && data.recentLeads.length > 0 && (
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={18} color="var(--success)" />
            <span>Últimos Registros Recibidos desde el Formulario (En Vivo)</span>
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <th style={{ padding: '10px 12px' }}>NOMBRE</th>
                  <th style={{ padding: '10px 12px' }}>EMAIL</th>
                  <th style={{ padding: '10px 12px' }}>CANAL / MEDIO</th>
                  <th style={{ padding: '10px 12px' }}>MENSAJE (utm_content)</th>
                  <th style={{ padding: '10px 12px' }}>EVENTO</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>FECHA</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLeads.map(lead => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#fff' }}>{lead.nombre || 'Anónimo'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--secondary-hover)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{lead.email}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {lead.utm_source || 'directo'} / {lead.utm_medium || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {lead.utm_content ? (
                        <span style={{ background: 'rgba(236,72,153,0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {lead.utm_content}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{lead.evento || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(lead.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Devices & Countries footer info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone size={16} color="var(--primary-hover)" />
            <span>Dispositivos de los Clics</span>
          </h4>
          {data?.byDevice?.map(item => (
            <div key={item.device_type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{item.device_type}</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{item.clicks} clics</span>
            </div>
          ))}
        </div>

        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} color="var(--secondary)" />
            <span>Países Principales de los Clics</span>
          </h4>
          {data?.byCountry?.map(item => (
            <div key={item.country} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{item.country}</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{item.clicks} clics</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
