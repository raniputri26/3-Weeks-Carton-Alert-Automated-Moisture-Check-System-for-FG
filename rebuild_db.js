const parser = require('./server/excelParser');
const db = require('./server/db');
const alertEngine = require('./server/alertEngine');

async function run() {
  await db.initDB();
  db.getDB().run("DELETE FROM po_data");
  db.getDB().run("DELETE FROM cartons");
  const stats = parser.parseFile('Doc/Carton Tracking (01 Oktober 2026) - Copy.xlsx');
  console.log('Parsed:', stats);
  
  // Run alert engine to promote WATCHING -> ALERTED
  await alertEngine.checkAndSendAlerts();
  
  db.saveDatabase();
  console.log('Rebuilt DB, ran alerts, and saved.');
}
run();
