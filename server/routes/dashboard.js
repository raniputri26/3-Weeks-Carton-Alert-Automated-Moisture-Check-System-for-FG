const express = require('express');
const router = express.Router();
const db = require('../db');
const alertEngine = require('../alertEngine');
const reminderEngine = require('../reminderEngine');

router.get('/stats', (req, res) => {
  try {
    const statsData = db.getTrendStats(req.query);
    res.json({ success: true, data: statsData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/pos', (req, res) => {
  try {
    const status = req.query.status;
    const search = req.query.search ? req.query.search.toLowerCase() : '';
    
    let pos = db.getAllPOs(status, null, req.query);
    
    if (search) {
      pos = pos.filter(po => 
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        (po.article && po.article.toLowerCase().includes(search)) ||
        (po.customer && po.customer.toLowerCase().includes(search))
      );
    }
    
    res.json({ success: true, data: pos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/po/:poNumber', (req, res) => {
  try {
    const poNumber = req.params.poNumber;
    const detail = db.getPODetail(poNumber);
    
    if (!detail) {
      return res.status(404).json({ success: false, message: 'PO not found' });
    }
    
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/trigger-alerts', async (req, res) => {
  try {
    // Run asynchronously to not block the UI
    setTimeout(async () => {
      try {
        console.log('[MANUAL TRIGGER] Running checkAndSendAlerts...');
        await alertEngine.checkAndSendAlerts();
        console.log('[MANUAL TRIGGER] Running checkAndSendReminders...');
        await reminderEngine.checkAndSendReminders();
        console.log('[MANUAL TRIGGER] Completed.');
      } catch (err) {
        console.error('[MANUAL TRIGGER] Error:', err);
      }
    }, 100);
    
    res.json({ success: true, message: 'Alerts triggered successfully in background. Please check WhatsApp shortly.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


const xlsx = require('xlsx');

router.get('/export', (req, res) => {
  try {
    const status = req.query.status;
    const search = req.query.search ? req.query.search.toLowerCase() : '';
    
    let pos = db.getAllPOs(status);
    
    if (search) {
      pos = pos.filter(po => 
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        (po.article && po.article.toLowerCase().includes(search)) ||
        (po.customer && po.customer.toLowerCase().includes(search))
      );
    }
    
    // Convert to flat format for Excel
    const dataForExcel = pos.map(po => {
      // Calculate age like in frontend
      let age = '-';
      if (po.si_date) {
        const si = new Date(po.si_date);
        const today = new Date();
        const diffTime = Math.abs(today - si);
        age = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }
      
      // Get carton numbers
      const cartons = db.getCartonsForPO(po.po_number) || [];
      const ctnList = cartons.join(', ');
      
      return {
        'PO NO.': po.po_number || '',
        'ARTICLE': po.article || '',
        'MARKET': po.market || '',
        'CUSTOMER': po.customer || '',
        'STATUS': po.status || '',
        'DUE / AGE (Days)': age,
        'FG IN (SI)': po.si_date || 'Not Set',
        'EXPORT DATE': po.export_date || '-',
        'MOISTURE': po.moisture_value ? po.moisture_value + '%' : '-',
        'TOTAL CTN': po.total_ctn_db || cartons.length || 0,
        'CARTON NUMBERS': ctnList
      };
    });
    
    const ws = xlsx.utils.json_to_sheet(dataForExcel);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "POs");
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Moisture_Alert_Export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
    
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/analytics', (req, res) => {
  try {
    const rawDB = db.getDB();
    
    let dateFilterFG = "";
    let dateFilterCheck = "";
    let dateFilterExport = "";
    
    const type = req.query.type || 'MONTH';
    if (type === 'DAY') {
        dateFilterFG = " AND start_in_fg LIKE strftime('%Y-%m-%d', 'now', 'localtime') || '%' ";
        dateFilterCheck = " AND check_date LIKE strftime('%Y-%m-%d', 'now', 'localtime') || '%' ";
        dateFilterExport = " AND export_date LIKE strftime('%Y-%m-%d', 'now', 'localtime') || '%' ";
    } else if (type === 'WEEK') {
        dateFilterFG = " AND start_in_fg >= date('now', '-7 days', 'localtime') ";
        dateFilterCheck = " AND check_date >= date('now', '-7 days', 'localtime') ";
        dateFilterExport = " AND export_date >= date('now', '-7 days', 'localtime') ";
    } else if (type === 'MONTH') {
        dateFilterFG = " AND start_in_fg LIKE strftime('%Y-%m', 'now', 'localtime') || '%' ";
        dateFilterCheck = " AND check_date LIKE strftime('%Y-%m', 'now', 'localtime') || '%' ";
        dateFilterExport = " AND export_date LIKE strftime('%Y-%m', 'now', 'localtime') || '%' ";
    } else if (type === 'RANGE') {
        const start = req.query.start;
        const end = req.query.end;
        if (start && end) {
            // escape quotes in start/end just in case
            const safeStart = start.replace(/'/g, '');
            const safeEnd = end.replace(/'/g, '');
            dateFilterFG = ` AND start_in_fg >= '${safeStart}' AND start_in_fg <= '${safeEnd} 23:59:59' `;
            dateFilterCheck = ` AND check_date >= '${safeStart}' AND check_date <= '${safeEnd} 23:59:59' `;
            dateFilterExport = ` AND export_date >= '${safeStart}' AND export_date <= '${safeEnd} 23:59:59' `;
        }
    }
    
    // 1. POs FG In
    const fgInMonth = rawDB.exec(`
      SELECT COUNT(*) as count FROM po_data 
      WHERE 1=1 ${dateFilterFG}
    `);
    const fgInMonthCount = fgInMonth[0] ? fgInMonth[0].values[0][0] : 0;
    
    // 2. Waiting SI
    const waitingSI = rawDB.exec(`SELECT COUNT(*) FROM po_data WHERE status = 'WAITING_SI' ${dateFilterFG}`);
    const waitingSICount = waitingSI[0] ? waitingSI[0].values[0][0] : 0;
    
    // 3. > 3 Weeks Old
    const over3Weeks = rawDB.exec(`
      SELECT COUNT(*) FROM po_data 
      WHERE si_date IS NOT NULL AND si_date != '' 
      AND (export_date IS NULL OR export_date = '')
      AND (julianday('now') - julianday(si_date)) >= 21
      ${dateFilterFG}
    `);
    const over3WeeksCount = over3Weeks[0] ? over3Weeks[0].values[0][0] : 0;
    
    // 4. Exported total
    const exported = rawDB.exec(`SELECT COUNT(*) FROM po_data WHERE (status = 'EXPORTED' OR export_date IS NOT NULL) ${dateFilterExport}`);
    const exportedCount = exported[0] ? exported[0].values[0][0] : 0;
    
    // 5. Pass vs Fail Ratio
    const checks = rawDB.exec(`
      SELECT result, COUNT(*) FROM moisture_checks WHERE 1=1 ${dateFilterCheck} GROUP BY result
    `);
    let passCount = 0; let failCount = 0;
    if (checks[0]) {
      checks[0].values.forEach(row => {
        if (row[0] === 'PASS') passCount = row[1];
        if (row[0] === 'FAIL') failCount = row[1];
      });
    }
    if (passCount === 0 && failCount === 0) { passCount = 1; failCount = 0; }
    
    // 6. Rejection by Market
    const marketFails = rawDB.exec(`
      SELECT p.market, COUNT(mc.id) 
      FROM po_data p 
      JOIN moisture_checks mc ON p.po_number = mc.po_number 
      WHERE mc.result = 'FAIL' AND p.market IS NOT NULL ${dateFilterCheck}
      GROUP BY p.market
      ORDER BY COUNT(mc.id) DESC
      LIMIT 5
    `);
    let marketLabels = []; let marketData = [];
    if (marketFails[0]) {
      marketFails[0].values.forEach(row => {
        marketLabels.push(row[0] || 'Unknown');
        marketData.push(row[1]);
      });
    }
    if (marketLabels.length === 0) {
      marketLabels = ['No Fails']; marketData = [0];
    }
    
    // 7. Trend Chart
    const moistureTrend = rawDB.exec(`
      SELECT strftime('%Y-%m', check_date) as month, AVG(moisture_value) 
      FROM moisture_checks 
      WHERE 1=1 ${dateFilterCheck}
      GROUP BY month 
      ORDER BY month ASC 
      LIMIT 6
    `);
    let trendLabels = []; let trendData = [];
    if (moistureTrend[0]) {
      moistureTrend[0].values.forEach(row => {
        trendLabels.push(row[0]);
        trendData.push(Math.round(row[1] * 10) / 10);
      });
    }
    if (trendLabels.length === 0) {
      trendLabels = [new Date().toISOString().substring(0,7)]; trendData = [0];
    }
    
    res.json({
      success: true, 
      data: {
        metrics: {
          fgInMonth: fgInMonthCount,
          waitingSI: waitingSICount,
          over3Weeks: over3WeeksCount,
          exported: exportedCount
        },
        charts: {
          ratio: { pass: passCount, fail: failCount },
          market: { labels: marketLabels, data: marketData },
          trend: { labels: trendLabels, data: trendData }
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
