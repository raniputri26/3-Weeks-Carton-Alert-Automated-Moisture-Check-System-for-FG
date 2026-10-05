const express = require('express');
const cron = require('node-cron');
const path = require('path');
const db = require('./db');
const config = require('./config');
const alertEngine = require('./alertEngine');
const reminderEngine = require('./reminderEngine');

// Import routes
const uploadRoutes = require('./routes/upload');
const dashboardRoutes = require('./routes/dashboard');
const moistureCheckRoutes = require('./routes/moistureCheck');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Also serve img/ directory for logos
app.use('/img', express.static(path.join(__dirname, '..', 'img')));

// Setup routes
app.use('/api/upload', uploadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/moisture-check', moistureCheckRoutes);

// Setup cron job (Daily at 08:00 WIB / Asia/Jakarta)
cron.schedule(config.CRON_SCHEDULE, async () => {
  console.log(`[CRON] Running scheduled tasks at ${new Date().toISOString()}`);
  try {
    await alertEngine.checkAndSendAlerts();
    await reminderEngine.checkAndSendReminders();
  } catch (err) {
    console.error('[CRON] Error during scheduled tasks:', err);
  }
}, {
  scheduled: true,
  timezone: "Asia/Jakarta"
});

// Start server — async because initDB needs to load WASM
async function startServer() {
  try {
    // Init DB (async for sql.js WASM loading)
    await db.initDB();
    
    // Apply cutoff rules on startup
    alertEngine.applyCutoff();
    
    // Get local network IP
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    
    for (const name of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
          break;
        }
      }
    }
    
    app.listen(config.PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🏭 ════════════════════════════════════════');
      console.log('   FG Moisture Alert System');
      console.log('   Parkland Factory — New Balance');
      console.log('════════════════════════════════════════════');
      console.log(`🌐 Server running on:`);
      console.log(`   → Local:   http://localhost:${config.PORT}`);
      console.log(`   → Network: http://${localIp}:${config.PORT}`);
      console.log(`⏰ Cron: Daily at 08:00 WIB`);
      console.log(`💧 Moisture threshold: ≥ ${config.MOISTURE_THRESHOLD}% = FAIL`);
      console.log(`📅 Alert trigger: ${config.ALERT_DAYS} days from SI DATE`);
      console.log('════════════════════════════════════════════');
      console.log('');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
