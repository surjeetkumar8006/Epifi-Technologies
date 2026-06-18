import express from 'express';
import cors from 'cors';
import { 
  initDb, 
  getMonitors, 
  getMonitorByUrl, 
  getMonitorById, 
  addMonitor, 
  deleteMonitor, 
  addHealthCheck, 
  getLatestChecksForAllMonitors, 
  getHealthChecksForMonitor 
} from './db.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper to validate URLs
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Ping a single monitor and store the result
async function pingMonitor(monitor) {
  const { id, url } = monitor;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'UptimeMonitorMVP/1.0',
      },
    });

    const responseTimeMs = Math.round(performance.now() - startTime);
    clearTimeout(timeoutId);

    const isUp = response.status >= 200 && response.status < 400;
    
    // Save check
    await addHealthCheck(id, response.status, responseTimeMs, isUp, null);
    console.log(`[PING SUCCESS] ${url} - Status: ${response.status} - Time: ${responseTimeMs}ms`);
  } catch (err) {
    clearTimeout(timeoutId);
    const responseTimeMs = Math.round(performance.now() - startTime);
    const errorMessage = err.name === 'AbortError' ? 'Request timed out (10s)' : err.message;

    // Save check
    await addHealthCheck(id, null, responseTimeMs, false, errorMessage);
    console.log(`[PING FAILED] ${url} - Error: ${errorMessage} - Time: ${responseTimeMs}ms`);
  }
}

// Ping all registered monitors
async function pingAllMonitors() {
  try {
    const monitors = await getMonitors();
    if (monitors.length === 0) return;

    console.log(`Starting ping cycle for ${monitors.length} monitors...`);
    // Ping all in parallel
    await Promise.all(monitors.map(monitor => pingMonitor(monitor)));
    console.log('Ping cycle completed.');
  } catch (err) {
    console.error('Error running ping cycle:', err);
  }
}

// --- API ENDPOINTS ---

// 1. Get all monitors with their latest status and last 10 checks
app.get('/api/monitors', async (req, res) => {
  try {
    const monitors = await getMonitors();

    if (monitors.length === 0) {
      return res.json([]);
    }

    // Get checks for all monitors (max last 10 each)
    const checks = await getLatestChecksForAllMonitors();

    // Group checks by monitor_id
    const checksMap = {};
    checks.forEach(check => {
      if (!checksMap[check.monitor_id]) {
        checksMap[check.monitor_id] = [];
      }
      checksMap[check.monitor_id].push({
        id: check.id,
        status_code: check.status_code,
        response_time_ms: check.response_time_ms,
        is_up: check.is_up,
        error_message: check.error_message,
        timestamp: check.timestamp,
      });
    });

    // Format response
    const dashboardData = monitors.map(monitor => {
      const monitorChecks = checksMap[monitor.id] || [];
      const latestCheck = monitorChecks[monitorChecks.length - 1] || null;
      
      const upChecks = monitorChecks.filter(c => c.response_time_ms !== null);
      const avgResponseTime = upChecks.length > 0
        ? Math.round(upChecks.reduce((sum, c) => sum + c.response_time_ms, 0) / upChecks.length)
        : null;

      return {
        id: monitor.id,
        url: monitor.url,
        name: monitor.name || monitor.url,
        created_at: monitor.created_at,
        is_up: latestCheck ? latestCheck.is_up : null,
        last_checked: latestCheck ? latestCheck.timestamp : null,
        last_status_code: latestCheck ? latestCheck.status_code : null,
        last_error: latestCheck ? latestCheck.error_message : null,
        avg_response_time_ms: avgResponseTime,
        history: monitorChecks,
      };
    });

    res.json(dashboardData);
  } catch (err) {
    console.error('Error fetching monitors:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Add a new monitor
app.post('/api/monitors', async (req, res) => {
  const { url, name } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL format. Must start with http:// or https://' });
  }

  try {
    const existing = await getMonitorByUrl(url);
    if (existing) {
      return res.status(400).json({ error: 'URL is already being monitored' });
    }

    const displayName = name && name.trim() !== '' ? name.trim() : new URL(url).hostname;
    const newMonitor = await addMonitor(url, displayName);

    // Immediately trigger a check
    pingMonitor(newMonitor);

    res.status(201).json(newMonitor);
  } catch (err) {
    console.error('Error adding monitor:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Delete a monitor
app.delete('/api/monitors/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await deleteMonitor(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Monitor not found' });
    }
    res.json({ message: 'Monitor deleted successfully', monitor: deleted });
  } catch (err) {
    console.error('Error deleting monitor:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Get detailed history for a specific monitor
app.get('/api/monitors/:id/history', async (req, res) => {
  const { id } = req.params;

  try {
    const monitor = await getMonitorById(id);
    if (!monitor) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    const history = await getHealthChecksForMonitor(id, 100);

    res.json({
      monitor,
      history,
    });
  } catch (err) {
    console.error('Error fetching monitor history:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- SERVER STARTUP ---

async function start() {
  await initDb();

  app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });

  // Run initial ping cycle
  pingAllMonitors();

  // Ping every 60 seconds
  setInterval(pingAllMonitors, 60000);
}

start();
