const db = require('better-sqlite3')('data/moisture_alert.db');
const pos = db.prepare('SELECT po_number FROM po_data WHERE status = ?').all('ALERTED');
for(const p of pos) {
    db.prepare('DELETE FROM cartons WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM alerts WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM moisture_checks WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM po_data WHERE po_number = ?').run(p.po_number);
}
console.log('Deleted ' + pos.length + ' ALERTED POs');
const pos2 = db.prepare('SELECT po_number FROM po_data WHERE status = ?').all('OVERDUE');
for(const p of pos2) {
    db.prepare('DELETE FROM cartons WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM alerts WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM moisture_checks WHERE po_number = ?').run(p.po_number);
    db.prepare('DELETE FROM po_data WHERE po_number = ?').run(p.po_number);
}
console.log('Deleted ' + pos2.length + ' OVERDUE POs');
