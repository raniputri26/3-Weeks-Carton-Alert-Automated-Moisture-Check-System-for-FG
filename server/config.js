const path = require('path');

module.exports = {
  FONNTE_TOKEN: 'qxovJQ74ZADaXDKV5FF9',
  WA_GROUP_ID: '120363412038093515@g.us',
  MOISTURE_THRESHOLD: 15,
  ALERT_DAYS: 21,
  REMINDER_DAYS: 3,
  CRON_SCHEDULE: '0 8 * * *',
  PORT: 3000,
  EXCEL_SHEET_NAME: '090034 FG In Scan History',
  DB_PATH: path.join(__dirname, '..', 'data', 'moisture_alert.db'),
  UPLOAD_DIR: path.join(__dirname, '..', 'uploads')
};
