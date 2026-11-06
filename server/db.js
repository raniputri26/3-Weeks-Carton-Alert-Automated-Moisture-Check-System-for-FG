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
      export_date DATE,
      total_pairs INTEGER,
      total_ctn INTEGER,
      status TEXT DEFAULT 'WAITING_SI', -- WAITING_SI / WATCHING / ALERTED / CHECKED / SKIPPED / EXPORTED
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
      images TEXT,
      FOREIGN KEY (po_number) REFERENCES po_data(po_number)
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_stats_snapshot (
      date_str TEXT PRIMARY KEY,
      stats_json TEXT
    );
  `);

  try {
    // Add export_date column for existing databases (will throw error if already exists)
    db.run(`ALTER TABLE po_data ADD COLUMN export_date DATE;`);
    console.log('Migrated DB: Added export_date column');
  } catch (e) {}

  try {
    db.run(`CREATE TABLE IF NOT EXISTS daily_stats_snapshot (date_str TEXT PRIMARY KEY, stats_json TEXT);`);
  } catch (e) {}

  try {
    db.run(`ALTER TABLE moisture_checks ADD COLUMN images TEXT;`);
    console.log('Migrated DB: Added images column to moisture_checks');
  } catch (e) {}

  try {
    // Auto-fix any corrupt 2001 dates caused by legacy string parsing
    db.run(`
      UPDATE po_data SET si_date = REPLACE(si_date, '2001-', '2026-') WHERE si_date LIKE '2001-%';
      UPDATE po_data SET start_in_fg = REPLACE(start_in_fg, '2001-', '2026-') WHERE start_in_fg LIKE '2001-%';
      UPDATE po_data SET po_closing_date = REPLACE(po_closing_date, '2001-', '2026-') WHERE po_closing_date LIKE '2001-%';
      UPDATE po_data SET export_date = REPLACE(export_date, '2001-', '2026-') WHERE export_date LIKE '2001-%';
    `);
    console.log('✅ Migrated DB: Cleaned up legacy 2001 dates');
  } catch (e) {}

  try {
    // Migration for backdating is removed to prevent affecting newly added Moisture 2 checks.
    // Fix the accidentally backdated Moisture 2 check for H174564 (id 20)
    db.run(`UPDATE moisture_checks SET check_date = '2026-10-08 09:00:00' WHERE id = 20 AND po_number = 'H174564'`);


    // New migration for EXPORT DATE updates based on user screenshot
    const exportUpdates = [
      { po: 'C135238', date: '2026-10-06 00:00:00' },
      { po: 'U146407', date: '2026-10-06 00:00:00' },
      { po: 'U141252', date: '2026-10-05 00:00:00' },
      { po: '7877610', date: '2026-10-06 00:00:00' },
      { po: '7877604', date: '2026-10-06 00:00:00' },
      { po: '7875319', date: '2026-10-07 00:00:00' },
      { po: '7874735', date: '2026-10-02 00:00:00' }
    ];
    let exportUpdatesCount = 0;
    exportUpdates.forEach(update => {
      const existing = queryGet(`SELECT id FROM po_data WHERE po_number = ?`, [update.po]);
      if (existing) {
        db.run(`UPDATE po_data SET export_date = ?, status = 'EXPORTED' WHERE po_number = ?`, [update.date, update.po]);
        exportUpdatesCount++;
      }
    });
    if (exportUpdatesCount > 0) {
      console.log(`✅ Migrated DB: Updated export date and EXPORTED status for ${exportUpdatesCount} POs`);
    }
  } catch (e) {
    console.error('Error adjusting check dates:', e);
  }

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
      qty_order, start_in_fg, po_closing_date, si_date, export_date, status
    ) VALUES (
      ?, ?, ?, ?, ?, 
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(po_number) DO UPDATE SET
      article = excluded.article,
      market = excluded.market,
      customer = excluded.customer,
      warehouse = excluded.warehouse,
      qty_order = excluded.qty_order,
      start_in_fg = excluded.start_in_fg,
      po_closing_date = excluded.po_closing_date,
      si_date = CASE 
        WHEN (po_data.si_date IS NULL OR po_data.si_date = '' OR po_data.si_date < '2020') AND excluded.si_date IS NOT NULL 
        THEN excluded.si_date 
        ELSE po_data.si_date 
      END,
      export_date = excluded.export_date,
      status = excluded.status
  `, [
    poData.po_number, poData.article, poData.market, poData.customer, poData.warehouse,
    poData.qty_order, poData.start_in_fg, poData.po_closing_date, poData.si_date, poData.export_date, poData.status
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
    WHERE po_number = ? AND (si_date IS NULL OR si_date = '' OR si_date < '2020')
  `, [si_date, po_number]);
}

function getPOsByStatus(status) {
  return queryAll(`SELECT * FROM po_data WHERE status = ?`, [status]);
}

function getWatchingPOsReadyForAlert() {
  return queryAll(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM moisture_checks mc WHERE mc.po_number = p.po_number) as check_count
    FROM po_data p
    WHERE p.status IN ('WATCHING', 'CHECKED')
    AND p.si_date IS NOT NULL 
    AND p.si_date != ''
    AND (p.export_date IS NULL OR p.export_date = '')
    AND (julianday('now') - julianday(p.si_date)) >= (
      ((SELECT COUNT(*) FROM moisture_checks mc WHERE mc.po_number = p.po_number) + 1) * ?
    )
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
  let checkDate = data.check_date;
  if (!checkDate) {
    checkDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
  } else if (checkDate.length === 10) {
    checkDate += ' 09:00:00';
  }
  
  const imagesJson = data.images && data.images.length > 0 ? JSON.stringify(data.images) : null;
  
  queryRun(`
    INSERT INTO moisture_checks (po_number, checked_by, check_date, moisture_value, result, remarks, images)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [data.po_number, data.checked_by, checkDate, data.moisture_value, result, data.remarks || '', imagesJson]);
  
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

function getDashboardStats(filterParams = {}) {
  let dateFilter = "";
  const type = filterParams.type || '';
  const val = (filterParams.value || '').replace(/'/g, '');

  if (type === 'DAY') {
      // val = 'YYYY-MM-DD' or fall back to today
      const day = val || "strftime('%Y-%m-%d', 'now', 'localtime')";
      dateFilter = val
        ? ` AND start_in_fg LIKE '${day}%' `
        : " AND start_in_fg LIKE strftime('%Y-%m-%d', 'now', 'localtime') || '%' ";
  } else if (type === 'WEEK') {
      // WEEK uses start/end range computed on frontend
      const start = (filterParams.start || '').replace(/'/g, '');
      const end = (filterParams.end || '').replace(/'/g, '');
      if (start && end) {
          dateFilter = ` AND start_in_fg >= '${start}' AND start_in_fg <= '${end} 23:59:59' `;
      } else {
          dateFilter = " AND start_in_fg >= date('now', '-7 days', 'localtime') ";
      }
  } else if (type === 'MONTH') {
      // val = 'YYYY-MM' or fall back to current month
      const month = val || "strftime('%Y-%m', 'now', 'localtime')";
      dateFilter = val
        ? ` AND start_in_fg LIKE '${month}%' `
        : " AND start_in_fg LIKE strftime('%Y-%m', 'now', 'localtime') || '%' ";
  } else if (type === 'RANGE') {
      const start = (filterParams.start || '').replace(/'/g, '');
      const end = (filterParams.end || '').replace(/'/g, '');
      if (start && end) {
          dateFilter = ` AND start_in_fg >= '${start}' AND start_in_fg <= '${end} 23:59:59' `;
      }
  }

  // Build export_date filter from ex_ prefixed params
  let exportDateFilter = "";
  const exType = (filterParams.ex_type || '');
  const exVal = (filterParams.ex_value || '').replace(/'/g, '');

  if (exType === 'DAY') {
      exportDateFilter = exVal
        ? ` AND export_date LIKE '${exVal}%' `
        : ` AND export_date LIKE strftime('%Y-%m-%d', 'now', 'localtime') || '%' `;
  } else if (exType === 'WEEK') {
      const exStart = (filterParams.ex_start || '').replace(/'/g, '');
      const exEnd = (filterParams.ex_end || '').replace(/'/g, '');
      if (exStart && exEnd) {
          exportDateFilter = ` AND export_date >= '${exStart}' AND export_date <= '${exEnd} 23:59:59' `;
      }
  } else if (exType === 'MONTH') {
      exportDateFilter = exVal
        ? ` AND export_date LIKE '${exVal}%' `
        : ` AND export_date LIKE strftime('%Y-%m', 'now', 'localtime') || '%' `;
  } else if (exType === 'RANGE') {
      const exStart = (filterParams.ex_start || '').replace(/'/g, '');
      const exEnd = (filterParams.ex_end || '').replace(/'/g, '');
      if (exStart && exEnd) {
          exportDateFilter = ` AND export_date >= '${exStart}' AND export_date <= '${exEnd} 23:59:59' `;
      }
  }

  const rows = queryAll(`SELECT status, COUNT(*) as count FROM po_data WHERE 1=1 ${dateFilter} ${exportDateFilter} GROUP BY status`);
  const stats = {
    TOTAL: 0,
    WAITING_SI: 0,
    WATCHING: 0,
    ALERTED: 0,
    CHECKED: 0,
    OVERDUE: 0,
    SKIPPED: 0,
    EXPORTED: 0
  };
  
  for (const row of rows) {
    if (row.status !== 'CHECKED') {
      stats[row.status] = row.count;
    }
    stats.TOTAL += row.count;
  }
  
  const checkedRow = queryGet(`
    SELECT COUNT(DISTINCT mc.po_number) as checked_count 
    FROM moisture_checks mc 
    JOIN po_data p ON mc.po_number = p.po_number 
    WHERE 1=1 ${dateFilter} ${exportDateFilter}
  `);
  stats.CHECKED = checkedRow ? checkedRow.checked_count : 0;
  
  return stats;
}

function snapshotCurrentStats() {
  const stats = getDashboardStats();
  // Get date in local timezone YYYY-MM-DD
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  const dateStr = new Date(today.getTime() - offset).toISOString().split('T')[0];
  
  queryRun(`
    INSERT INTO daily_stats_snapshot (date_str, stats_json) VALUES (?, ?)
    ON CONFLICT(date_str) DO UPDATE SET stats_json = excluded.stats_json
  `, [dateStr, JSON.stringify(stats)]);
}

function getTrendStats(query = {}) {
  const current = getDashboardStats(query);
  
  const today = new Date();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 7);
  const offset = targetDate.getTimezoneOffset() * 60000;
  const targetStr = new Date(targetDate.getTime() - offset).toISOString().split('T')[0];
  
  let pastRow = queryGet(`
    SELECT * FROM daily_stats_snapshot 
    WHERE date_str <= ? 
    ORDER BY date_str DESC LIMIT 1
  `, [targetStr]);
  
  if (!pastRow) {
    pastRow = queryGet(`SELECT * FROM daily_stats_snapshot ORDER BY date_str ASC LIMIT 1`);
  }
  
  let trend = {
    TOTAL: 0, WAITING_SI: 0, WATCHING: 0, ALERTED: 0, CHECKED: 0, OVERDUE: 0, EXPORTED: 0
  };
  
  if (pastRow) {
    try {
      const pastStats = JSON.parse(pastRow.stats_json);
      for (const key in trend) {
        const curVal = current[key] || 0;
        const pastVal = pastStats[key] || 0;
        if (pastVal === 0) {
           trend[key] = curVal > 0 ? 100 : 0;
        } else {
           trend[key] = Math.round(((curVal - pastVal) / pastVal) * 100);
        }
      }
    } catch(e) {}
  }
  
  // Implicitly snapshot the stats whenever they are fetched to ensure we have data for tomorrow
  snapshotCurrentStats();
  
  return { current, trend };
}

function getAllPOs(statusFilter = null, searchTerm = null, filterParams = {}) {
  let dateFilter = "";
  const type = filterParams.type || '';
  const val = (filterParams.value || '').replace(/'/g, '');

  if (type === 'DAY') {
      dateFilter = val
        ? ` AND start_in_fg LIKE '${val}%' `
        : " AND start_in_fg LIKE strftime('%Y-%m-%d', 'now', 'localtime') || '%' ";
  } else if (type === 'WEEK') {
      const start = (filterParams.start || '').replace(/'/g, '');
      const end = (filterParams.end || '').replace(/'/g, '');
      if (start && end) {
          dateFilter = ` AND start_in_fg >= '${start}' AND start_in_fg <= '${end} 23:59:59' `;
      } else {
          dateFilter = " AND start_in_fg >= date('now', '-7 days', 'localtime') ";
      }
  } else if (type === 'MONTH') {
      dateFilter = val
        ? ` AND start_in_fg LIKE '${val}%' `
        : " AND start_in_fg LIKE strftime('%Y-%m', 'now', 'localtime') || '%' ";
  } else if (type === 'RANGE') {
      const start = (filterParams.start || '').replace(/'/g, '');
      const end = (filterParams.end || '').replace(/'/g, '');
      if (start && end) {
          dateFilter = ` AND start_in_fg >= '${start}' AND start_in_fg <= '${end} 23:59:59' `;
      }
  }

  // Build export_date filter from ex_ prefixed params
  let exportDateFilter = "";
  const exType = (filterParams.ex_type || '');
  const exVal = (filterParams.ex_value || '').replace(/'/g, '');

  if (exType === 'DAY') {
      exportDateFilter = exVal
        ? ` AND p.export_date LIKE '${exVal}%' `
        : ` AND p.export_date LIKE strftime('%Y-%m-%d', 'now', 'localtime') || '%' `;
  } else if (exType === 'WEEK') {
      const exStart = (filterParams.ex_start || '').replace(/'/g, '');
      const exEnd = (filterParams.ex_end || '').replace(/'/g, '');
      if (exStart && exEnd) {
          exportDateFilter = ` AND p.export_date >= '${exStart}' AND p.export_date <= '${exEnd} 23:59:59' `;
      }
  } else if (exType === 'MONTH') {
      exportDateFilter = exVal
        ? ` AND p.export_date LIKE '${exVal}%' `
        : ` AND p.export_date LIKE strftime('%Y-%m', 'now', 'localtime') || '%' `;
  } else if (exType === 'RANGE') {
      const exStart = (filterParams.ex_start || '').replace(/'/g, '');
      const exEnd = (filterParams.ex_end || '').replace(/'/g, '');
      if (exStart && exEnd) {
          exportDateFilter = ` AND p.export_date >= '${exStart}' AND p.export_date <= '${exEnd} 23:59:59' `;
      }
  }

  let query = `
    SELECT p.*, 
      (SELECT COUNT(*) FROM cartons c WHERE c.po_number = p.po_number) as total_ctn_db,
      (SELECT MAX(a.sent_at) FROM alerts a WHERE a.po_number = p.po_number) as last_alert_date,
      (SELECT mc.moisture_value FROM moisture_checks mc WHERE mc.po_number = p.po_number ORDER BY mc.check_date DESC LIMIT 1) as moisture_value,
      (SELECT mc.result FROM moisture_checks mc WHERE mc.po_number = p.po_number ORDER BY mc.check_date DESC LIMIT 1) as moisture_result,
      (SELECT COUNT(*) FROM moisture_checks mc WHERE mc.po_number = p.po_number) as check_count
    FROM po_data p
    WHERE 1=1
    ${dateFilter}
    ${exportDateFilter}
  `;
  const params = [];
  
  if (statusFilter && statusFilter !== 'ALL') {
    if (statusFilter === 'CHECKED') {
      query += ` AND (SELECT COUNT(*) FROM moisture_checks mc WHERE mc.po_number = p.po_number) > 0`;
    } else {
      query += ` AND p.status = ?`;
      params.push(statusFilter);
    }
  }
  
  if (searchTerm) {
    query += ` AND (p.po_number LIKE ? OR p.article LIKE ? OR p.market LIKE ? OR p.customer LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term, term, term);
  }
  
  if (statusFilter === 'EXPORTED') {
    query += ` ORDER BY p.export_date DESC, p.id DESC`;
  } else if (statusFilter === 'WAITING_SI') {
    query += ` ORDER BY p.start_in_fg DESC, p.id DESC`;
  } else if (statusFilter === 'ALERTED' || statusFilter === 'OVERDUE') {
    query += ` ORDER BY p.si_date ASC, p.id DESC`; // Oldest first for urgent alerts
  } else if (statusFilter === 'ALL' || !statusFilter) {
    query += ` ORDER BY COALESCE(p.export_date, p.si_date, p.start_in_fg) DESC, p.id DESC`;
  } else {
    query += ` ORDER BY p.si_date DESC, p.id DESC`;
  }
  
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
  getTrendStats,
  snapshotCurrentStats,
  getAllPOs,
  getPODetail,
  getSystemConfig,
  setSystemConfig,
  getLastUploadInfo,
  saveUploadInfo
};
