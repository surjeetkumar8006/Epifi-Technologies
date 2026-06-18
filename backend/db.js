import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const mongoUri = process.env.MONGO_URI;

let useJsonFallback = false;
const JSON_DB_PATH = path.join(process.cwd(), 'db.json');

// Define MongoDB Schemas
const monitorSchema = new mongoose.Schema({
  url: { type: String, unique: true, required: true },
  name: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const healthCheckSchema = new mongoose.Schema({
  monitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true },
  statusCode: { type: Number },
  responseTimeMs: { type: Number },
  isUp: { type: Boolean, required: true },
  errorMessage: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const Monitor = mongoose.models.Monitor || mongoose.model('Monitor', monitorSchema);
const HealthCheck = mongoose.models.HealthCheck || mongoose.model('HealthCheck', healthCheckSchema);

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
  try {
    console.log('Connecting to MongoDB Atlas...');
    // Enable connection timeout limits
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('MongoDB connection established successfully.');
  } catch (err) {
    console.error('MongoDB connection failed. Error:', err.message);
    console.warn('⚠️ WARNING: Falling back to local JSON file database...');
    useJsonFallback = true;
    initJsonFileDb();
  }
}

// --- DATABASE OPERATIONS INTERFACE ---

// 1. Get all monitors
export async function getMonitors() {
  if (useJsonFallback) {
    const db = readJsonDb();
    return [...db.monitors].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    const monitors = await Monitor.find().sort({ createdAt: -1 });
    return monitors.map(m => ({
      id: m._id.toString(),
      url: m.url,
      name: m.name,
      created_at: m.createdAt
    }));
  }
}

// 2. Find monitor by URL
export async function getMonitorByUrl(url) {
  if (useJsonFallback) {
    const db = readJsonDb();
    return db.monitors.find(m => m.url === url) || null;
  } else {
    const m = await Monitor.findOne({ url });
    return m ? { id: m._id.toString(), url: m.url, name: m.name, created_at: m.createdAt } : null;
  }
}

// 3. Find monitor by ID
export async function getMonitorById(id) {
  if (useJsonFallback) {
    const db = readJsonDb();
    return db.monitors.find(m => m.id === id) || null;
  } else {
    try {
      const m = await Monitor.findById(id);
      return m ? { id: m._id.toString(), url: m.url, name: m.name, created_at: m.createdAt } : null;
    } catch (_) {
      return null;
    }
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
    const m = await new Monitor({ url, name }).save();
    return { id: m._id.toString(), url: m.url, name: m.name, created_at: m.createdAt };
  }
}

// 5. Delete a monitor (and its health checks cascade)
export async function deleteMonitor(id) {
  if (useJsonFallback) {
    const db = readJsonDb();
    const monitorIdx = db.monitors.findIndex(m => m.id === id);
    if (monitorIdx === -1) return null;
    
    const [deletedMonitor] = db.monitors.splice(monitorIdx, 1);
    db.health_checks = db.health_checks.filter(c => c.monitor_id !== id);
    writeJsonDb(db);
    return deletedMonitor;
  } else {
    try {
      const m = await Monitor.findByIdAndDelete(id);
      if (!m) return null;
      await HealthCheck.deleteMany({ monitorId: id });
      return { id: m._id.toString(), url: m.url, name: m.name, created_at: m.createdAt };
    } catch (_) {
      return null;
    }
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
    try {
      const c = await new HealthCheck({
        monitorId,
        statusCode,
        responseTimeMs,
        isUp,
        errorMessage
      }).save();
      return {
        id: c._id.toString(),
        monitor_id: c.monitorId.toString(),
        status_code: c.statusCode,
        response_time_ms: c.responseTimeMs,
        is_up: c.isUp,
        error_message: c.errorMessage,
        timestamp: c.timestamp
      };
    } catch (err) {
      console.error('Error adding MongoDB health check:', err);
    }
  }
}

// 7. Get the last 10 health checks for all monitors
export async function getLatestChecksForAllMonitors() {
  if (useJsonFallback) {
    const db = readJsonDb();
    const checksMap = {};
    
    db.health_checks.forEach(check => {
      if (!checksMap[check.monitor_id]) {
        checksMap[check.monitor_id] = [];
      }
      checksMap[check.monitor_id].push(check);
    });

    const resultChecks = [];
    Object.keys(checksMap).forEach(monitorId => {
      const sorted = [...checksMap[monitorId]].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      resultChecks.push(...sorted.slice(-10));
    });

    return resultChecks;
  } else {
    // MongoDB Aggregation: grouping health_checks by monitorId and extracting top 10 latest checks
    const checksGrouped = await HealthCheck.aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$monitorId',
          checks: { $push: '$$ROOT' }
        }
      },
      {
        $project: {
          checks: { $slice: ['$checks', 10] }
        }
      }
    ]);

    const result = [];
    checksGrouped.forEach(group => {
      // Sort checks ascending for chronological UI charts
      const reversed = [...group.checks].reverse();
      reversed.forEach(c => {
        result.push({
          id: c._id.toString(),
          monitor_id: c.monitorId.toString(),
          status_code: c.statusCode,
          response_time_ms: c.responseTimeMs,
          is_up: c.isUp,
          error_message: c.errorMessage,
          timestamp: c.timestamp
        });
      });
    });

    return result;
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
    try {
      const checks = await HealthCheck.find({ monitorId })
        .sort({ timestamp: -1 })
        .limit(limit);
      return checks.map(c => ({
        id: c._id.toString(),
        monitor_id: c.monitorId.toString(),
        status_code: c.statusCode,
        response_time_ms: c.responseTimeMs,
        is_up: c.isUp,
        error_message: c.errorMessage,
        timestamp: c.timestamp
      }));
    } catch (_) {
      return [];
    }
  }
}
