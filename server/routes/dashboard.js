const express = require('express');
const router = express.Router();
const db = require('../db');
const alertEngine = require('../alertEngine');
const reminderEngine = require('../reminderEngine');

router.get('/stats', (req, res) => {
  try {
    const stats = db.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/pos', (req, res) => {
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

module.exports = router;
