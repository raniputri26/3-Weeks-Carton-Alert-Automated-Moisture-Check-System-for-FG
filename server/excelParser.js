const xlsx = require('xlsx');
const db = require('./db');

/**
 * Parse Excel date — handles both serial numbers and string dates
 */
function parseExcelDate(excelDate) {
  if (!excelDate) return null;
  if (typeof excelDate === 'number') {
    const d = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  if (typeof excelDate === 'string') {
    let cleanStr = excelDate.replace(/PASSED/i, '').trim();
    if (/^\d{1,2}\/\d{1,2}$/.test(cleanStr)) {
      cleanStr += '/' + new Date().getFullYear();
    }
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      const offset = d.getTimezoneOffset() * 60000;
      const localD = new Date(d.getTime() - offset);
      return localD.toISOString().split('T')[0];
    }
    return excelDate;
  }
  return null;
}

/**
 * Parse Excel file and import data into database
 * Handles: PO grouping, dedup (PO+CTN), SI DATE update
 */
function parseFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = require('./config').EXCEL_SHEET_NAME;
  
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan. Sheets available: ${workbook.SheetNames.join(', ')}`);
  }
  
  const rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });
  
  let stats = {
    newPOs: 0,
    updatedSIDates: 0,
    newCartons: 0,
    skippedCartons: 0,
    totalRows: rawData.length
  };
  
  // Group rows by PO number
  const poGroups = {};
  
  rawData.forEach(row => {
    const po = row['PO'] || row['PO Number'] || row['PO#'];
    if (!po) return;
    
    const poStr = po.toString().trim();
    
    if (!poGroups[poStr]) {
      poGroups[poStr] = {
        po_number: poStr,
        article: row['ARTICLE'] || null,
        market: row['MARKET'] || null,
        customer: row['CUSTOMER'] || null,
        warehouse: row['WAREHOUSE'] || null,
        qty_order: parseInt(row['QTY ORDER']) || null,
        start_in_fg: parseExcelDate(row['START IN FG']),
        si_date: parseExcelDate(row['SI DATE']),
        export_date: parseExcelDate(row['EXPORT DATE']),
        po_closing_date: parseExcelDate(row['PO# CLOSING DATE']),
        cartons: []
      };
    }
    
    // Also update SI DATE and EXPORT DATE if this row has it and existing group doesn't
    if (!poGroups[poStr].si_date && row['SI DATE']) {
      poGroups[poStr].si_date = parseExcelDate(row['SI DATE']);
    }
    if (!poGroups[poStr].export_date && row['EXPORT DATE']) {
      poGroups[poStr].export_date = parseExcelDate(row['EXPORT DATE']);
    }
    
    const ctn = row['NO. CTN'] || row['NO.CTN'] || row['CTN'];
    if (ctn) {
      poGroups[poStr].cartons.push({
        ctn_number: parseInt(ctn),
        scan_date: parseExcelDate(row['SCAN DATE'])
      });
    }
  });
  
  // Process each PO group
  for (const po_number in poGroups) {
    const data = poGroups[po_number];
    
    // Determine initial status based on si_date and export_date
    let status = data.si_date ? 'WATCHING' : 'WAITING_SI';
    if (data.export_date) status = 'EXPORTED';
    
    // Check if PO already exists in DB
    const existing = db.getPODetail(po_number);
    
    if (!existing) {
      // New PO — insert
      db.upsertPO({
        po_number: data.po_number,
        article: data.article,
        market: data.market,
        customer: data.customer,
        warehouse: data.warehouse,
        qty_order: data.qty_order,
        start_in_fg: data.start_in_fg,
        po_closing_date: data.po_closing_date,
        si_date: data.si_date,
        export_date: data.export_date,
        status: status
      });
      stats.newPOs++;
    } else {
      // Existing PO — check if SI DATE needs update
      if (data.si_date && (!existing.si_date || existing.si_date !== data.si_date)) {
        db.updateSIDate(po_number, data.si_date);
        stats.updatedSIDates++;
      }
      
      // Update other metadata (but preserve existing status unless WAITING_SI → WATCHING, or if EXPORT DATE comes in)
      let newStatus = existing.status;
      if (existing.status === 'WAITING_SI' && data.si_date) newStatus = 'WATCHING';
      if (data.export_date) newStatus = 'EXPORTED';

      db.upsertPO({
        po_number: data.po_number,
        article: data.article,
        market: data.market,
        customer: data.customer,
        warehouse: data.warehouse,
        qty_order: data.qty_order,
        start_in_fg: data.start_in_fg,
        po_closing_date: data.po_closing_date,
        si_date: data.si_date || existing.si_date,
        export_date: data.export_date || existing.export_date,
        status: newStatus
      });
    }
    
    // Insert cartons (dedup by PO + CTN)
    for (const ctn of data.cartons) {
      if (!ctn.ctn_number && ctn.ctn_number !== 0) continue;
      const res = db.insertCarton(po_number, ctn.ctn_number, ctn.scan_date);
      if (res.changes > 0) {
        stats.newCartons++;
      } else {
        stats.skippedCartons++;
      }
    }
  }
  
  // Save upload info
  db.saveUploadInfo(stats);
  
  console.log(`📊 Upload complete:`, stats);
  return stats;
}

module.exports = {
  parseFile,
  parseExcelDate
};
