const parser = require('./server/excelParser');
const db = require('./server/db');

async function run() {
  await db.initDB();
  const stats = parser.parseFile('Doc/Carton Tracking (01 Oktober 2026) - Copy.xlsx');
  console.log('Parsed:', stats);
  db.saveDatabase();
  console.log('Saved DB to disk.');
}
run();
