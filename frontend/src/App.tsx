import { useState, useEffect } from 'react';
import { UtmShortenerStudio } from './components/UtmShortenerStudio.tsx';
import { LinkManager } from './components/LinkManager.tsx';
import { AnalyticsDashboard } from './components/AnalyticsDashboard.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { Link2, Scissors, BarChart3, LogOut, ShieldCheck } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('omnya_shortener_token'));
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'create' | 'links' | 'analytics'>('create');

  useEffect(() => {
    if (token) {
      fetch('/api/auth/check', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (!data.authenticated) {
            handleLogout();
          }
        })
        .catch(() => handleLogout())
        .finally(() => setCheckingAuth(false));
    } else {
      setCheckingAuth(false);
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('omnya_shortener_token');
    setToken(null);
  };

  if (checkingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0f19', color: 'var(--text-muted)' }}>
        Verificando sesión...
      </div>
    );
  }

  if (!token) {
    return <LoginScreen onLoginSuccess={(newToken) => setToken(newToken)} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header style={{
        background: 'rgba(19, 28, 49, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '16px 36px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            padding: '8px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Scissors size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
              Omnya <span style={{ color: 'var(--secondary)' }}>UTM & Shortener</span>
            </h1>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('create')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: activeTab === 'create' ? 'var(--primary-glow)' : 'transparent',
              color: activeTab === 'create' ? 'var(--primary-hover)' : 'var(--text-secondary)',
              border: activeTab === 'create' ? '1px solid var(--primary)' : '1px solid transparent',
              cursor: 'pointer'
            }}
          >
            <Scissors size={16} />
            <span>Crear y Acortar</span>
          </button>

          <button
            onClick={() => setActiveTab('links')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: activeTab === 'links' ? 'var(--primary-glow)' : 'transparent',
              color: activeTab === 'links' ? 'var(--primary-hover)' : 'var(--text-secondary)',
              border: activeTab === 'links' ? '1px solid var(--primary)' : '1px solid transparent',
              cursor: 'pointer'
            }}
          >
            <Link2 size={16} />
            <span>Mis Enlaces</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: activeTab === 'analytics' ? 'var(--primary-glow)' : 'transparent',
              color: activeTab === 'analytics' ? 'var(--primary-hover)' : 'var(--text-secondary)',
              border: activeTab === 'analytics' ? '1px solid var(--primary)' : '1px solid transparent',
              cursor: 'pointer'
            }}
          >
            <BarChart3 size={16} />
            <span>Analítica</span>
          </button>
        </nav>

        {/* User / Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--success)' }}>
            <ShieldCheck size={16} />
            <span>Admin</span>
          </div>

          <button
            onClick={handleLogout}
            title="Cerrar Sesión"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--error)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <LogOut size={14} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '35px', maxWidth: '1350px', width: '100%', margin: '0 auto' }}>
        {activeTab === 'create' && <UtmShortenerStudio />}
        {activeTab === 'links' && <LinkManager />}
        {activeTab === 'analytics' && <AnalyticsDashboard />}
      </main>
    </div>
  );
}
