const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', (req, res) => {
  try {
    const { po_number, checked_by, moisture_value, remarks } = req.body;
    
    if (!po_number || !checked_by || moisture_value === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    const result = db.saveMoistureCheck({
      po_number,
      checked_by,
      moisture_value: parseFloat(moisture_value),
      remarks: remarks || ''
    });
    
    res.json({ 
      success: true, 
      message: 'Moisture check saved successfully',
      result: result
    });
  } catch (error) {
    console.error('Error saving moisture check:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:poNumber', (req, res) => {
  try {
    const poNumber = req.params.poNumber;
    const poDetail = db.getPODetail(poNumber);
    const checks = poDetail ? poDetail.checks : [];
    
    res.json({ success: true, data: checks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
