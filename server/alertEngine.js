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

async function checkAndSendAlerts() {
  console.log('Running alert engine check...');
  const posReady = db.getWatchingPOsReadyForAlert();
  
  if (posReady.length === 0) {
    console.log('No POs ready for alert today.');
    return;
  }
  
  console.log(`Found ${posReady.length} PO(s) ready for alert.`);
  
  let message = '';
  
  if (posReady.length === 1) {
    // Single PO Alert
    const po = posReady[0];
    const cartons = db.getCartonsForPO(po.po_number);
    const days = calculateDays(po.si_date);
    const weeks = Math.floor(days / 7);
    
    message = `🔔 *MOISTURE CHECK ALERT*
━━━━━━━━━━━━━━━━━━━━━━━

📋 *PO#:* ${po.po_number}
👟 *Article:* ${po.article || '-'}
🌍 *Market:* ${po.market || '-'}
🏪 *Customer:* ${po.customer || '-'}
🏭 *Warehouse:* ${po.warehouse || '-'}
📦 *Qty Order:* ${po.qty_order || '-'} pairs

📅 *FG In:* ${po.start_in_fg ? formatDate(po.start_in_fg) : '-'}
📅 *SI Date:* ${formatDate(po.si_date)}
⏰ *Usia dari SI:* ${days} hari (${weeks} minggu)

📦 *Carton Numbers (${cartons.length} CTN):*
${cartons.join(', ')}

⚠️ Mohon segera cek moisture.
<15% PASS ✅ | ≥15% FAIL ❌

📊 http://localhost:${config.PORT}
━━━━━━━━━━━━━━━━━━━━━━━
🏭 Parkland - NB Quality System`;

  } else {
    // Multi PO Alert
    message = `🔔 *MOISTURE CHECK ALERT - ${posReady.length} PO*
━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    posReady.forEach((po, index) => {
      const cartons = db.getCartonsForPO(po.po_number);
      const days = calculateDays(po.si_date);
      
      message += `${index + 1}️⃣ *PO#:* ${po.po_number} | ${po.article || '-'} | ${po.market || '-'}
   📦 ${cartons.length} CTN: ${cartons.slice(0, 10).join(', ')}${cartons.length > 10 ? '...' : ''}
   📅 FG In: ${po.start_in_fg ? formatDate(po.start_in_fg) : '-'}
   📅 SI Date: ${formatDate(po.si_date)} (${days} hari)\n\n`;
    });
    
    message += `⚠️ Mohon segera check moisture.
Threshold: < 15% PASS ✅ | ≥ 15% FAIL ❌

📊 http://localhost:${config.PORT}
━━━━━━━━━━━━━━━━━━━━━━━
🏭 Parkland - NB Quality System`;
  }
  
  const success = await fonnte.sendToGroup(message);
  
  if (success) {
    posReady.forEach(po => {
      db.updatePOStatus(po.po_number, 'ALERTED');
      db.logAlert(po.po_number, 'FIRST');
    });
    console.log('Alerts sent and logged successfully.');
  } else {
    console.error('Failed to send alerts via Fonnte.');
  }
}

function applyCutoff() {
  let startDate = db.getSystemConfig('system_start_date');
  if (!startDate) {
    startDate = new Date().toISOString().split('T')[0];
    db.setSystemConfig('system_start_date', startDate);
    console.log('Set system_start_date to:', startDate);
  }
  
  // Mark old POs as SKIPPED (si_date + 21 days < system_start_date)
  const cutoffDays = config.ALERT_DAYS;
  const posToSkip = db.getPOsByStatus('WATCHING').concat(db.getPOsByStatus('WAITING_SI'));
  let skippedCount = 0;
  
  for (const po of posToSkip) {
    if (po.si_date && po.si_date !== '') {
      const siDate = new Date(po.si_date);
      const alertDate = new Date(siDate);
      alertDate.setDate(alertDate.getDate() + cutoffDays);
      
      if (alertDate < new Date(startDate)) {
        db.updatePOStatus(po.po_number, 'SKIPPED');
        skippedCount++;
      }
    }
  }
  
  if (skippedCount > 0) {
    console.log(`Applied cutoff: Marked ${skippedCount} PO(s) as SKIPPED.`);
  }
}

module.exports = {
  checkAndSendAlerts,
  applyCutoff
};
