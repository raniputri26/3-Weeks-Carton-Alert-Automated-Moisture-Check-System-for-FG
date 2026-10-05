const fs = require('fs');

// 1. Add endpoint to dashboard.js
let dash = fs.readFileSync('server/routes/dashboard.js', 'utf8');
const exportCode = `
const xlsx = require('xlsx');

router.get('/export', (req, res) => {
  try {
    const status = req.query.status;
    const search = req.query.search ? req.query.search.toLowerCase() : '';
    
    let pos = db.getAllPOs(status);
    
    if (search) {
      pos = pos.filter(po => 
        (po.po_number && po.po_number.toLowerCase().includes(search)) ||
        (po.article && po.article.toLowerCase().includes(search)) ||
        (po.customer && po.customer.toLowerCase().includes(search))
      );
    }
    
    // Convert to flat format for Excel
    const dataForExcel = pos.map(po => {
      // Calculate age like in frontend
      let age = '-';
      if (po.si_date) {
        const si = new Date(po.si_date);
        const today = new Date();
        const diffTime = Math.abs(today - si);
        age = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }
      return {
        'PO NO.': po.po_number || '',
        'ARTICLE': po.article || '',
        'MARKET': po.market || '',
        'CUSTOMER': po.customer || '',
        'STATUS': po.status || '',
        'DUE / AGE (Days)': age,
        'FG IN (SI)': po.si_date || 'Not Set',
        'MOISTURE': po.moisture_value ? po.moisture_value + '%' : '-',
        'TOTAL CTN': po.total_ctn || 0
      };
    });
    
    const ws = xlsx.utils.json_to_sheet(dataForExcel);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "POs");
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Moisture_Alert_Export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
    
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
`;
dash = dash.replace('module.exports = router;', exportCode + '\nmodule.exports = router;');
fs.writeFileSync('server/routes/dashboard.js', dash);

// 2. Add Export button to HTML
let html = fs.readFileSync('public/index.html', 'utf8');
const btn = `
<button class="btn-outline" onclick="exportExcel()" style="margin-right: 10px; border-color: var(--c-primary); color: var(--c-primary);">
    <i data-lucide="download" style="width: 16px; height: 16px; margin-right: 6px;"></i> Export Excel
</button>
`;
html = html.replace('<button class="btn-primary" onclick="document.getElementById(\'excelUpload\').click()">', btn + '<button class="btn-primary" onclick="document.getElementById(\'excelUpload\').click()">');
// bump css
html = html.replace(/v=\d+/, 'v=' + Date.now());
fs.writeFileSync('public/index.html', html);

// 3. Add exportExcel to app.js
let js = fs.readFileSync('public/js/app.js', 'utf8');
js += `
function exportExcel() {
    let url = API_BASE + '/dashboard/export?';
    if (currentFilter) url += 'status=' + currentFilter + '&';
    if (currentSearch) url += 'search=' + currentSearch;
    window.open(url, '_blank');
}
`;
fs.writeFileSync('public/js/app.js', js);
