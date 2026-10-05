const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const config = require('./config');

let db;
let SQL;

/**
 * Initialize database - create tables if not exist
 * sql.js is async for init (loading WASM), but after that queries are synchronous
 */
async function initDB() {
  const dataDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(config.DB_PATH)) {
    const fileBuffer = fs.readFileSync(config.DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS po_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      article TEXT,
      market TEXT,
      customer TEXT,
      warehouse TEXT,
      qty_order INTEGER,
      start_in_fg DATE,
      po_closing_date DATE,
      si_date DATE,                    -- ⭐ TRIGGER: countdown 21 hari mulai dari sini
      total_pairs INTEGER,
      total_ctn INTEGER,
      status TEXT DEFAULT 'WAITING_SI', -- WAITING_SI / WATCHING / ALERTED / CHECKED / SKIPPED
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cartons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL,
      ctn_number INTEGER NOT NULL,
      scan_date DATETIME,
      qty_in INTEGER,
      UNIQUE(po_number, ctn_number),
      FOREIGN KEY (po_number) REFERENCES po_data(po_number)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL,
      alert_type TEXT DEFAULT 'FIRST',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      fonnte_status TEXT,
      FOREIGN KEY (po_number) REFERENCES po_data(po_number)
    );

    CREATE TABLE IF NOT EXISTS moisture_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL,
      checked_by TEXT NOT NULL,
      check_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      moisture_value REAL,
      result TEXT,
      remarks TEXT,
      FOREIGN KEY (po_number) REFERENCES po_data(po_number)
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  saveDatabase();
  console.log('✅ Database initialized at', config.DB_PATH);
}

/** Save database to disk (sql.js works in-memory, needs manual save) */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.DB_PATH, buffer);
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

// ──────────────────────────────────────
// Helper: run sql.js queries like better-sqlite3
// ──────────────────────────────────────

/** Run a query and return all rows as array of objects */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/** Run a query and return first row as object (or null) */
function queryGet(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Run INSERT/UPDATE/DELETE and return changes info */
function queryRun(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  saveDatabase();
  return { changes };
}

// ──────────────────────────────────────
// PO Data Functions
// ──────────────────────────────────────

function upsertPO(poData) {
  return queryRun(`
    INSERT INTO po_data (
      po_number, article, market, customer, warehouse, 
      qty_order, start_in_fg, po_closing_date, si_date, status
    ) VALUES (
      ?, ?, ?, ?, ?, 
      ?, ?, ?, ?, ?
    )
    ON CONFLICT(po_number) DO UPDATE SET
      article = excluded.article,
      market = excluded.market,
      customer = excluded.customer,
      warehouse = excluded.warehouse,
      qty_order = excluded.qty_order,
      start_in_fg = excluded.start_in_fg,
      po_closing_date = excluded.po_closing_date
  `, [
    poData.po_number, poData.article, poData.market, poData.customer, poData.warehouse,
    poData.qty_order, poData.start_in_fg, poData.po_closing_date, poData.si_date, poData.status
  ]);
}

function insertCarton(po_number, ctn_number, scan_date) {
  try {
    return queryRun(`
      INSERT OR IGNORE INTO cartons (po_number, ctn_number, scan_date)
      VALUES (?, ?, ?)
    `, [po_number, ctn_number, scan_date]);
  } catch (e) {
    // Duplicate — expected behavior
    return { changes: 0 };
  }
}

function updateSIDate(po_number, si_date) {
  return queryRun(`
    UPDATE po_data 
    SET si_date = ?, status = 'WATCHING' 
    WHERE po_number = ? AND (si_date IS NULL OR si_date = '')
  `, [si_date, po_number]);
}

function getPOsByStatus(status) {
  return queryAll(`SELECT * FROM po_data WHERE status = ?`, [status]);
}

function getWatchingPOsReadyForAlert() {
  return queryAll(`
    SELECT * FROM po_data 
    WHERE status = 'WATCHING' 
    AND si_date IS NOT NULL 
    AND si_date != ''
    AND (julianday('now') - julianday(si_date)) >= ?
  `, [config.ALERT_DAYS]);
}

function getAlertedPOsOverdue() {
  return queryAll(`
    SELECT p.*, MAX(a.sent_at) as last_alert
    FROM po_data p
    LEFT JOIN alerts a ON p.po_number = a.po_number
    WHERE p.status = 'ALERTED'
    GROUP BY p.po_number
    HAVING (julianday('now') - julianday(last_alert)) >= ?
  `, [config.REMINDER_DAYS]);
}

function updatePOStatus(po_number, status) {
  return queryRun(`UPDATE po_data SET status = ? WHERE po_number = ?`, [status, po_number]);
}

function logAlert(po_number, alert_type) {
  return queryRun(`INSERT INTO alerts (po_number, alert_type) VALUES (?, ?)`, [po_number, alert_type]);
}

function saveMoistureCheck(data) {
  const result = data.moisture_value >= config.MOISTURE_THRESHOLD ? 'FAIL' : 'PASS';
  
  queryRun(`
    INSERT INTO moisture_checks (po_number, checked_by, moisture_value, result, remarks)
    VALUES (?, ?, ?, ?, ?)
  `, [data.po_number, data.checked_by, data.moisture_value, result, data.remarks || '']);
  
  updatePOStatus(data.po_number, 'CHECKED');
  
  return result;
}

function getCartonsForPO(po_number) {
  return queryAll(
    `SELECT ctn_number FROM cartons WHERE po_number = ? ORDER BY ctn_number ASC`,
    [po_number]
  ).map(c => c.ctn_number);
}

// ──────────────────────────────────────
// Dashboard Functions
// ──────────────────────────────────────

function getDashboardStats() {
  const rows = queryAll(`SELECT status, COUNT(*) as count FROM po_data GROUP BY status`);
  const stats = {
    TOTAL: 0,
    WAITING_SI: 0,
    WATCHING: 0,
    ALERTED: 0,
    CHECKED: 0,
    OVERDUE: 0,
    SKIPPED: 0
  };
  
  for (const row of rows) {
    stats[row.status] = row.count;
    stats.TOTAL += row.count;
  }
  
  return stats;
}

function getAllPOs(statusFilter = null, searchTerm = null) {
  let query = `
    SELECT p.*, 
      (SELECT COUNT(*) FROM cartons c WHERE c.po_number = p.po_number) as total_ctn_db,
      (SELECT MAX(a.sent_at) FROM alerts a WHERE a.po_number = p.po_number) as last_alert_date,
      (SELECT mc.moisture_value FROM moisture_checks mc WHERE mc.po_number = p.po_number ORDER BY mc.check_date DESC LIMIT 1) as moisture_value,
      (SELECT mc.result FROM moisture_checks mc WHERE mc.po_number = p.po_number ORDER BY mc.check_date DESC LIMIT 1) as moisture_result
    FROM po_data p
    WHERE 1=1
  `;
  const params = [];
  
  if (statusFilter && statusFilter !== 'ALL') {
    query += ` AND p.status = ?`;
    params.push(statusFilter);
  }
  
  if (searchTerm) {
    query += ` AND (p.po_number LIKE ? OR p.article LIKE ? OR p.market LIKE ? OR p.customer LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term, term, term);
  }
  
  query += ` ORDER BY p.id DESC`;
  
  return queryAll(query, params);
}

function getPODetail(po_number) {
  const po = queryGet(`SELECT * FROM po_data WHERE po_number = ?`, [po_number]);
  if (!po) return null;
  
  po.cartons = getCartonsForPO(po_number);
  po.checks = queryAll(
    `SELECT * FROM moisture_checks WHERE po_number = ? ORDER BY check_date DESC`,
    [po_number]
  );
  po.alert_history = queryAll(
    `SELECT * FROM alerts WHERE po_number = ? ORDER BY sent_at DESC`,
    [po_number]
  );
  
  return po;
}

// ──────────────────────────────────────
// System Config Functions
// ──────────────────────────────────────

function getSystemConfig(key) {
  const row = queryGet(`SELECT value FROM system_config WHERE key = ?`, [key]);
  return row ? row.value : null;
}

function setSystemConfig(key, value) {
  return queryRun(`
    INSERT INTO system_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `, [key, value]);
}

function getLastUploadInfo() {
  return {
    timestamp: getSystemConfig('last_upload_time'),
    stats: getSystemConfig('last_upload_stats')
  };
}

function saveUploadInfo(stats) {
  setSystemConfig('last_upload_time', new Date().toISOString());
  setSystemConfig('last_upload_stats', JSON.stringify(stats));
}

module.exports = {
  initDB,
  getDB,
  saveDatabase,
  upsertPO,
  insertCarton,
  updateSIDate,
  getPOsByStatus,
  getWatchingPOsReadyForAlert,
  getAlertedPOsOverdue,
  updatePOStatus,
  logAlert,
  saveMoistureCheck,
  getCartonsForPO,
  getDashboardStats,
  getAllPOs,
  getPODetail,
  getSystemConfig,
  setSystemConfig,
  getLastUploadInfo,
  saveUploadInfo
};
