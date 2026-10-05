const Database = require('better-sqlite3');
const db = new Database('data/moisture_alert.db');
db.prepare("DELETE FROM cartons WHERE po_number IN (SELECT po_number FROM po_data WHERE status IN ('ALERTED', 'OVERDUE'))").run();
db.prepare("DELETE FROM alerts WHERE po_number IN (SELECT po_number FROM po_data WHERE status IN ('ALERTED', 'OVERDUE'))").run();
db.prepare("DELETE FROM po_data WHERE status IN ('ALERTED', 'OVERDUE')").run();
console.log("Deleted");
