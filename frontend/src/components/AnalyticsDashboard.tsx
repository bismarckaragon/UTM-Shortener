import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Globe,
  Smartphone,
  MousePointerClick,
  TrendingUp,
  RefreshCw,
  Layers
} from 'lucide-react';

interface AnalyticsData {
  summary: {
    total_links: number;
    total_clicks: number;
    unique_visitors: number;
  };
  bySource: { source: string; clicks: number }[];
  byMedium: { medium: string; clicks: number }[];
  byContent: { content: string; channel_name: string; clicks: number }[];
  byCountry: { country: string; clicks: number }[];
  byDevice: { device_type: string; clicks: number }[];
  timeline: { date: string; clicks: number; unique_clicks: number }[];
}

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/analytics');
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
    fetchAnalytics();
  }, []);

  const totalClicks = data?.summary.total_clicks || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      {/* Header */}
      <div className="glass-card" style={{ padding: '24px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={24} color="var(--secondary)" />
            <span>Panel de Analítica y Rendimiento</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Métricas de clics en tiempo real desglosadas por canal, mensaje y ubicación geográfica.
          </p>
        </div>

        <button
          onClick={fetchAnalytics}
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
          <span>Actualizar Datos</span>
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: '8px', color: 'var(--error)', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Clics Totales</span>
            <MousePointerClick size={20} color="var(--primary-hover)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.total_clicks ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Redirecciones registradas
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Visitantes Únicos</span>
            <TrendingUp size={20} color="var(--secondary)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.unique_visitors ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Dispositivos / IPs únicas
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Enlaces Creados</span>
            <Layers size={20} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
            {data?.summary.total_links ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            UTMs acortadas activas
          </div>
        </div>
      </div>

      {/* Detailed Breakdown Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Clicks by Source */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} color="var(--secondary)" />
            <span>Rendimiento por Canal (utm_source)</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data?.bySource && data.bySource.length > 0 ? (
              data.bySource.map(item => {
                const pct = totalClicks > 0 ? Math.round((item.clicks / totalClicks) * 100) : 0;
                return (
                  <div key={item.source}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.source}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.clicks} clics ({pct}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--secondary))' }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                Sin datos de clics aún.
              </div>
            )}
          </div>
        </div>

        {/* Clicks by Content (Messages) */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} color="var(--accent)" />
            <span>Mensajes / Creativos Ganadores (utm_content)</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data?.byContent && data.byContent.length > 0 ? (
              data.byContent.map((item, idx) => {
                const pct = totalClicks > 0 ? Math.round((item.clicks / totalClicks) * 100) : 0;
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.content} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({item.channel_name})</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.clicks} clics</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                Sin datos de contenido aún.
              </div>
            )}
          </div>
        </div>

        {/* Devices */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone size={18} color="var(--primary-hover)" />
            <span>Dispositivos</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data?.byDevice && data.byDevice.length > 0 ? (
              data.byDevice.map(item => {
                const pct = totalClicks > 0 ? Math.round((item.clicks / totalClicks) * 100) : 0;
                return (
                  <div key={item.device_type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.device_type}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.clicks} ({pct}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)' }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                Sin datos de dispositivos aún.
              </div>
            )}
          </div>
        </div>

        {/* Countries */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} color="var(--secondary)" />
            <span>Países Principales</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data?.byCountry && data.byCountry.length > 0 ? (
              data.byCountry.map(item => {
                const pct = totalClicks > 0 ? Math.round((item.clicks / totalClicks) * 100) : 0;
                return (
                  <div key={item.country}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.country}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.clicks} ({pct}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--secondary)' }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                Sin datos de países aún.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
