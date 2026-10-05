const db = require('./db');
const fonnte = require('./fonnte');
const config = require('./config');

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function calculateDays(startDate) {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  const diffTime = Math.abs(now - start);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

async function checkAndSendReminders() {
  console.log('Running reminder engine check...');
  const overduePOs = db.getAlertedPOsOverdue();
  
  if (overduePOs.length === 0) {
    console.log('No POs overdue for reminder today.');
    return;
  }
  
  console.log(`Found ${overduePOs.length} PO(s) overdue for reminder.`);
  
  for (const po of overduePOs) {
    const cartons = db.getCartonsForPO(po.po_number);
    const days = calculateDays(po.si_date);
    const overdueDays = calculateDays(po.last_alert);
    
    const message = `🔴 *REMINDER - MOISTURE CHECK*
━━━━━━━━━━━━━━━━━━━━━━━

📋 *PO#:* ${po.po_number} | ${po.article || '-'}
📦 *${cartons.length} CTN:* ${cartons.slice(0, 10).join(', ')}${cartons.length > 10 ? '...' : ''}
📅 *FG In:* ${po.start_in_fg ? formatDate(po.start_in_fg) : '-'}
📅 *SI Date:* ${formatDate(po.si_date)}
⏰ *Usia dari SI:* ${days} hari
⚠️ *Sudah ${overdueDays} hari belum di-check!*

❌ Belum ada update moisture check!
Mohon segera check.

📊 http://localhost:${config.PORT}
━━━━━━━━━━━━━━━━━━━━━━━`;

    const success = await fonnte.sendToGroup(message);
    
    if (success) {
      db.updatePOStatus(po.po_number, 'OVERDUE');
      db.logAlert(po.po_number, 'REMINDER');
      console.log(`Reminder sent for PO: ${po.po_number}`);
    }
    
    // Add small delay between messages if sending multiple
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

module.exports = {
  checkAndSendReminders
};
