const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Setup multer storage for QC images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(config.UPLOAD_DIR, 'qc_images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'qc-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

router.post('/', upload.array('images', 5), (req, res) => {
  try {
    const { po_number, checked_by, moisture_value, remarks, check_date } = req.body;
    
    if (!po_number || !checked_by || moisture_value === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    // Process uploaded images
    const images = req.files ? req.files.map(f => `/uploads/qc_images/${f.filename}`) : [];
    
    const result = db.saveMoistureCheck({
      po_number,
      checked_by,
      check_date: check_date || null,
      moisture_value: parseFloat(moisture_value),
      remarks: remarks || '',
      images: images
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
