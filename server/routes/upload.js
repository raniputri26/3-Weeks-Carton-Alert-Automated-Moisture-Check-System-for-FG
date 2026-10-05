const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const excelParser = require('../excelParser');
const db = require('../db');
const config = require('../config');

// Setup multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(config.UPLOAD_DIR)) {
      fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
    }
    cb(null, config.UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, 'fg-in-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

router.post('/', upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    const stats = excelParser.parseFile(filePath);
    
    // Optional: remove file after parsing
    // fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'File processed successfully',
      stats: stats
    });
  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/last', (req, res) => {
  try {
    const info = db.getLastUploadInfo();
    if (info && info.stats) {
      info.stats = JSON.parse(info.stats);
    }
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
