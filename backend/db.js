import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/uptime_monitor';

let pool = null;
let useJsonFallback = false;
const JSON_DB_PATH = path.join(process.cwd(), 'db.json');

// Helper to initialize JSON DB file if missing
function initJsonFileDb() {
  if (!fs.existsSync(JSON_DB_PATH)) {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify({ monitors: [], health_checks: [] }, null, 2));
    console.log('Local JSON database file initialized at:', JSON_DB_PATH);
  }
}

// Read from JSON DB
function readJsonDb() {
  initJsonFileDb();
  try {
    const data = fs.readFileSync(JSON_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading JSON DB, returning empty schema:', err);
    return { monitors: [], health_checks: [] };
  }
}

// Write to JSON DB
function writeJsonDb(data) {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing to JSON DB:', err);
  }
}

// --- INITIALIZATION ---
export async function initDb() {
  pool = new Pool({ connectionString });
  
  // Try connecting with a 5-second timeout threshold (2 retries locally)
  let retries = 2;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('PostgreSQL database connection established successfully.');
      
      // Create PostgreSQL tables
      const createMonitorsTable = `
        CREATE TABLE IF NOT EXISTS monitors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          url TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;

      const createHealthChecksTable = `
        CREATE TABLE IF NOT EXISTS health_checks (
          id SERIAL PRIMARY KEY,
          monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
          status_code INTEGER,
          response_time_ms INTEGER,
          is_up BOOLEAN NOT NULL,
          error_message TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;

      await pool.query(createMonitorsTable);
      await pool.query(createHealthChecksTable);
      console.log('PostgreSQL database tables verified.');
      return;
    } catch (err) {
      console.log(`PostgreSQL connection failed. (${retries - 1} attempts left)`);
      retries -= 1;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  // Fallback to JSON file database
  console.warn('⚠️ WARNING: Could not connect to PostgreSQL. Falling back to local JSON file database...');
  useJsonFallback = true;
  initJsonFileDb();
}

// --- DATABASE OPERATIONS INTERFACE ---

// 1. Get all monitors
export async function getMonitors() {
  if (useJsonFallback) {
    const db = readJsonDb();
    // Sort descending by created_at
    return [...db.monitors].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    const result = await pool.query('SELECT * FROM monitors ORDER BY created_at DESC');
    return result.rows;
  }
}

// 2. Find monitor by URL
export async function getMonitorByUrl(url) {
  if (useJsonFallback) {
    const db = readJsonDb();
    return db.monitors.find(m => m.url === url) || null;
  } else {
    const result = await pool.query('SELECT * FROM monitors WHERE url = $1', [url]);
    return result.rows[0] || null;
  }
}

// 3. Find monitor by ID
export async function getMonitorById(id) {
  if (useJsonFallback) {
    const db = readJsonDb();
    return db.monitors.find(m => m.id === id) || null;
  } else {
    const result = await pool.query('SELECT * FROM monitors WHERE id = $1', [id]);
    return result.rows[0] || null;
  }
}

// 4. Add a new monitor
export async function addMonitor(url, name) {
  if (useJsonFallback) {
    const db = readJsonDb();
    const newMonitor = {
      id: crypto.randomUUID(),
      url,
      name,
      created_at: new Date().toISOString()
    };
    db.monitors.push(newMonitor);
    writeJsonDb(db);
    return newMonitor;
  } else {
    const result = await pool.query(
      'INSERT INTO monitors (url, name) VALUES ($1, $2) RETURNING *',
      [url, name]
    );
    return result.rows[0];
  }
}

// 5. Delete a monitor (and its health checks cascade)
export async function deleteMonitor(id) {
  if (useJsonFallback) {
    const db = readJsonDb();
    const monitorIdx = db.monitors.findIndex(m => m.id === id);
    if (monitorIdx === -1) return null;
    
    const [deletedMonitor] = db.monitors.splice(monitorIdx, 1);
    // Cascade delete health checks
    db.health_checks = db.health_checks.filter(c => c.monitor_id !== id);
    writeJsonDb(db);
    return deletedMonitor;
  } else {
    const result = await pool.query('DELETE FROM monitors WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}

// 6. Add a health check
export async function addHealthCheck(monitorId, statusCode, responseTimeMs, isUp, errorMessage) {
  if (useJsonFallback) {
    const db = readJsonDb();
    const newCheck = {
      id: db.health_checks.length > 0 ? Math.max(...db.health_checks.map(c => c.id)) + 1 : 1,
      monitor_id: monitorId,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      is_up: isUp,
      error_message: errorMessage,
      timestamp: new Date().toISOString()
    };
    db.health_checks.push(newCheck);
    writeJsonDb(db);
    return newCheck;
  } else {
    const result = await pool.query(
      `INSERT INTO health_checks (monitor_id, status_code, response_time_ms, is_up, error_message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [monitorId, statusCode, responseTimeMs, isUp, errorMessage]
    );
    return result.rows[0];
  }
}

// 7. Get the last 10 health checks for all monitors
export async function getLatestChecksForAllMonitors() {
  if (useJsonFallback) {
    const db = readJsonDb();
    const checksMap = {};
    
    // Group checks by monitor
    db.health_checks.forEach(check => {
      if (!checksMap[check.monitor_id]) {
        checksMap[check.monitor_id] = [];
      }
      checksMap[check.monitor_id].push(check);
    });

    const resultChecks = [];
    Object.keys(checksMap).forEach(monitorId => {
      // Sort checks by timestamp ascending for the frontend chart, but keep only the last 10
      const sorted = [...checksMap[monitorId]].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      resultChecks.push(...sorted.slice(-10));
    });

    return resultChecks;
  } else {
    const result = await pool.query(`
      WITH ranked_checks AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY monitor_id ORDER BY timestamp DESC) as rn
        FROM health_checks
      )
      SELECT * FROM ranked_checks WHERE rn <= 10 ORDER BY monitor_id, timestamp ASC
    `);
    return result.rows;
  }
}

// 8. Get detailed health checks history for a specific monitor
export async function getHealthChecksForMonitor(monitorId, limit = 100) {
  if (useJsonFallback) {
    const db = readJsonDb();
    return db.health_checks
      .filter(c => c.monitor_id === monitorId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  } else {
    const result = await pool.query(
      'SELECT * FROM health_checks WHERE monitor_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [monitorId, limit]
    );
    return result.rows;
  }
}
