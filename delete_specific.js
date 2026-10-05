const Database = require('better-sqlite3');
const db = new Database('data/moisture_alert.db');

const posToDelete = db.prepare("SELECT po_number FROM po_data WHERE status = 'ALERTED' AND po_number NOT IN ('H171641', '7879207')").all();

let count = 0;
for (const p of posToDelete) {
    db.prepare('DELETE FROM cartons WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM alerts WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM moisture_checks WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM po_data WHERE po_number = ?').run(p.po_number);
    count++;
}

console.log('Deleted ' + count + ' ALERTED POs, excluded H171641 and 7879207.');
