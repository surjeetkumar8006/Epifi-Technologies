import { useState, useEffect } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  const [monitors, setMonitors] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  
  // Theme state: dark or light
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // Sync theme attribute to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Toggle theme handler
  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch all monitors
  const fetchMonitors = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/monitors`);
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      const data = await response.json();
      setMonitors(data);
      setLastUpdated(new Date());
      setSecondsSinceUpdate(0);
      setError(null);
    } catch (err) {
      console.error('Error fetching monitors:', err);
      setError('Could not connect to the backend server. Please verify it is running.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch monitors on mount and set up 15s interval
  useEffect(() => {
    fetchMonitors();
    const interval = setInterval(fetchMonitors, 15000);
    return () => clearInterval(interval);
  }, []);

  // Update "seconds since update" counter every second
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsSinceUpdate(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle adding a new monitor
  const handleAddMonitor = async (e) => {
    e.preventDefault();
    if (!urlInput) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/monitors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: urlInput,
          name: nameInput,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create monitor');
      }

      setUrlInput('');
      setNameInput('');
      fetchMonitors();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle deleting a monitor
  const handleDeleteMonitor = async (id) => {
    if (!window.confirm('Are you sure you want to remove this URL from monitoring?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/monitors/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete monitor');
      }

      fetchMonitors();
    } catch (err) {
      setError(err.message);
    }
  };

  // Helper to format timestamps
  const formatLocalTime = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Sparkline paths generator (returns stroke line, filled area, and the last point)
  const getSparklinePaths = (history) => {
    if (!history || history.length < 2) return { linePath: '', areaPath: '', lastPoint: null };
    
    // Sort history chronologically
    const sortedHistory = [...history].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const latencies = sortedHistory.map(h => h.response_time_ms || 0);
    
    const max = Math.max(...latencies, 100); // Scale relative to max, min 100ms
    const min = Math.min(...latencies, 0);
    const range = max - min || 1;
    
    const width = 290;
    const height = 54;
    const padding = 6;
    
    const points = latencies.map((val, idx) => {
      const x = (idx / (latencies.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 2 * padding) - padding;
      return { x, y };
    });
    
    // Line path definition
    const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    
    // Closed area path definition
    const areaPath = `${linePath} L ${width.toFixed(1)} ${height.toFixed(1)} L 0 ${height.toFixed(1)} Z`;
    
    return { 
      linePath, 
      areaPath, 
      lastPoint: points[points.length - 1] 
    };
  };

  // Stats calculation
  const totalMonitors = monitors.length;
  const activeMonitors = monitors.filter(m => m.is_up === true).length;
  const downMonitors = monitors.filter(m => m.is_up === false).length;
  
  const upPercent = totalMonitors > 0 
    ? Math.round((activeMonitors / totalMonitors) * 100) 
    : 100;

  const validResponseTimes = monitors
    .map(m => m.avg_response_time_ms)
    .filter(t => t !== null && t > 0);

  const overallAvgLatency = validResponseTimes.length > 0
    ? Math.round(validResponseTimes.reduce((sum, t) => sum + t, 0) / validResponseTimes.length)
    : 0;

  // Determine global system status banner details
  const getSystemStatus = () => {
    if (totalMonitors === 0) {
      return { text: 'No configured endpoints', type: 'warning' };
    }
    if (downMonitors > 0) {
      return { text: `${downMonitors} service${downMonitors > 1 ? 's' : ''} offline`, type: 'danger' };
    }
    return { text: 'All systems operational', type: 'success' };
  };

  const statusBanner = getSystemStatus();

  return (
    <div className="app-container">
      {/* Background glow effects */}
      <div className="bg-glow bg-glow-purple"></div>
      <div className="bg-glow bg-glow-blue"></div>

      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="title-row">
            <h1>
              <div className="logo-dot"></div>
              PULSE
            </h1>
            
            {/* Live Operational Status Banner */}
            <div className={`system-status-indicator ${statusBanner.type}`}>
              <div className="status-indicator-dot"></div>
              <span>{statusBanner.text}</span>
            </div>
          </div>
          <p className="subtitle">Real-time Service Availability Dashboard</p>
        </div>
        
        <div className="header-actions">
          {/* Theme Toggle Button */}
          <button 
            className="theme-toggle-btn" 
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          
          <div className="refresh-badge">
            <div className="refresh-spinner"></div>
            <span>
              {loading ? 'Refreshing...' : `Updated ${secondsSinceUpdate}s ago`}
            </span>
          </div>
        </div>
      </header>

      {/* Error alert banner */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button className="close-banner-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Stats summary panel */}
      <section className="stats-grid">
        <div className="stat-card glass-card primary">
          <div className="stat-card-top">
            <span className="stat-label">Total Services</span>
            <div className="stat-icon-wrapper purple">🖥️</div>
          </div>
          <span className="stat-value">{totalMonitors}</span>
          <span className="stat-card-desc">Registered endpoints</span>
          <div className="card-ambient-glow"></div>
        </div>
        <div className="stat-card glass-card success">
          <div className="stat-card-top">
            <span className="stat-label">Online Services</span>
            <div className="stat-icon-wrapper green">🟢</div>
          </div>
          <span className="stat-value">{activeMonitors} <span className="stat-pct">({upPercent}%)</span></span>
          <span className="stat-card-desc">Healthy active nodes</span>
          <div className="card-ambient-glow"></div>
        </div>
        <div className="stat-card glass-card danger">
          <div className="stat-card-top">
            <span className="stat-label">Offline Services</span>
            <div className="stat-icon-wrapper red">🚨</div>
          </div>
          <span className="stat-value" style={{ color: downMonitors > 0 ? 'var(--danger)' : 'inherit' }}>
            {downMonitors}
          </span>
          <span className="stat-card-desc">Requiring attention</span>
          <div className="card-ambient-glow"></div>
        </div>
        <div className="stat-card glass-card warning">
          <div className="stat-card-top">
            <span className="stat-label">Avg Latency</span>
            <div className="stat-icon-wrapper amber">⏱️</div>
          </div>
          <span className="stat-value">{overallAvgLatency} <span className="latency-unit">ms</span></span>
          <span className="stat-card-desc">Across operational pings</span>
          <div className="card-ambient-glow"></div>
        </div>
      </section>

      {/* Register monitor form */}
      <section className="form-card glass-card">
        <h3 className="form-title">➕ Add New Endpoint</h3>
        <form onSubmit={handleAddMonitor} className="add-monitor-form">
          <div className="input-group">
            <label htmlFor="url">URL Address</label>
            <input
              id="url"
              type="url"
              className="input-field"
              placeholder="https://example.com"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="name">Display Name (Optional)</label>
            <input
              id="name"
              type="text"
              className="input-field"
              placeholder="e.g. Example Domain"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </div>
          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Registering...' : 'Monitor URL'}
          </button>
        </form>
      </section>

      {/* Monitors grid list */}
      <section className="monitors-section">
        <div className="section-header">
          <h2>Endpoints Status</h2>
        </div>

        {totalMonitors === 0 ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">🌐</div>
            <h3>No URLs monitored</h3>
            <p>Enter a URL above to start logging metrics and uptime statistics.</p>
          </div>
        ) : (
          <div className="monitors-grid">
            {monitors.map((monitor) => {
              const hasHistory = monitor.history && monitor.history.length >= 2;
              const { linePath, areaPath, lastPoint } = hasHistory ? getSparklinePaths(monitor.history) : { linePath: '', areaPath: '', lastPoint: null };
              const monitorThemeClass = monitor.is_up === true ? 'up-theme' : monitor.is_up === false ? 'down-theme' : 'pending-theme';
              
              // Calculate min/max latency from history
              const validPings = monitor.history ? monitor.history.map(h => h.response_time_ms).filter(t => t !== null && t > 0) : [];
              const minLatency = validPings.length > 0 ? Math.min(...validPings) : null;
              const maxLatency = validPings.length > 0 ? Math.max(...validPings) : null;
              
              return (
                <article key={monitor.id} className={`monitor-card glass-card ${monitorThemeClass}`}>
                  
                  {/* Card Header */}
                  <div className="monitor-card-header">
                    <div className="monitor-title-box">
                      <h3 className="monitor-name">{monitor.name}</h3>
                      <a
                        href={monitor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="monitor-url"
                      >
                        {monitor.url}
                      </a>
                    </div>
                    
                    {monitor.is_up === true && (
                      <div className="status-badge up">
                        <div className="status-dot"></div>
                        <span>Online</span>
                      </div>
                    )}
                    {monitor.is_up === false && (
                      <div className="status-badge down">
                        <div className="status-dot"></div>
                        <span>Offline</span>
                      </div>
                    )}
                    {monitor.is_up === null && (
                      <div className="status-badge pending">
                        <div className="status-dot"></div>
                        <span>Pending</span>
                      </div>
                    )}
                  </div>

                  {/* Response time */}
                  <div className="monitor-latency-box">
                    <div className="latency-main">
                      <span className="latency-value">
                        {monitor.avg_response_time_ms !== null ? monitor.avg_response_time_ms : '--'}
                      </span>
                      <span className="latency-unit">ms (avg)</span>
                    </div>
                    
                    {/* Min/Max indicators */}
                    {minLatency !== null && maxLatency !== null && (
                      <div className="latency-minmax">
                        <span>Min: {minLatency}ms</span>
                        <span className="minmax-sep">•</span>
                        <span>Max: {maxLatency}ms</span>
                      </div>
                    )}
                  </div>

                  {/* SVG Sparkline (Gradient Filled with Terminal Pulse Dot) */}
                  {hasHistory && (
                    <div className="sparkline-container">
                      <svg className="sparkline-svg" viewBox="0 0 290 54" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id={`glow-grad-${monitor.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={monitor.is_up ? 'var(--success)' : 'var(--primary)'} stopOpacity="0.32" />
                            <stop offset="100%" stopColor={monitor.is_up ? 'var(--success)' : 'var(--primary)'} stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        {/* Area */}
                        <path
                          className="sparkline-area"
                          d={areaPath}
                          fill={`url(#glow-grad-${monitor.id})`}
                        />
                        {/* Stroke Line */}
                        <path
                          className="sparkline-path"
                          d={linePath}
                          stroke={monitor.is_up ? 'var(--success)' : 'var(--primary)'}
                        />
                        {/* Terminating Pulsing Dot */}
                        {lastPoint && (
                          <circle
                            className="sparkline-pulse-dot"
                            cx={lastPoint.x}
                            cy={lastPoint.y}
                            r="3.5"
                            fill={monitor.is_up ? 'var(--success)' : 'var(--danger)'}
                          />
                        )}
                      </svg>
                    </div>
                  )}

                  {/* Visual history dots with section label */}
                  <div className="history-box">
                    <div className="history-box-label">Uptime History (Last 10 Checks)</div>
                    <div className="history-bar">
                      {/* Render up to 10 dots */}
                      {monitor.history.slice(-10).map((check) => {
                        const time = formatLocalTime(check.timestamp);
                        const tooltipText = check.is_up 
                          ? `Up: ${check.response_time_ms}ms at ${time}` 
                          : `Down: ${check.error_message || 'HTTP ' + check.status_code} at ${time}`;
                        
                        return (
                          <div
                            key={check.id}
                            className={`ping-dot ${check.is_up ? 'up' : 'down'}`}
                            data-tooltip={tooltipText}
                          />
                        );
                      })}
                      {/* Pad with empty dots if history is less than 10 */}
                      {Array.from({ length: Math.max(0, 10 - monitor.history.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="ping-dot" data-tooltip="No data yet" />
                      ))}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="monitor-card-footer">
                    <span>
                      Checked: {formatLocalTime(monitor.last_checked)}
                    </span>
                    <button
                      className="delete-btn"
                      onClick={() => handleDeleteMonitor(monitor.id)}
                      title="Remove Monitor"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Card bottom colored bar */}
                  <div className="card-bottom-accent"></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="app-footer">
        <span>Pulse Monitor</span>
        <span>•</span>
        <span>MVP Uptime Platform</span>
      </footer>
    </div>
  );
}

export default App;
