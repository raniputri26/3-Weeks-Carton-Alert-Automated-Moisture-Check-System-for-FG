const fs = require('fs');

let dash = fs.readFileSync('server/routes/dashboard.js', 'utf8');

// I will just replace the map function
const oldMap = `const dataForExcel = pos.map(po => {
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
    });`;

const newMap = `const dataForExcel = pos.map(po => {
      // Calculate age like in frontend
      let age = '-';
      if (po.si_date) {
        const si = new Date(po.si_date);
        const today = new Date();
        const diffTime = Math.abs(today - si);
        age = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }
      
      // Get carton numbers
      const cartons = db.getCartonsForPO(po.po_number) || [];
      const ctnList = cartons.map(c => c.ctn_number).join(', ');
      
      return {
        'PO NO.': po.po_number || '',
        'ARTICLE': po.article || '',
        'MARKET': po.market || '',
        'CUSTOMER': po.customer || '',
        'STATUS': po.status || '',
        'DUE / AGE (Days)': age,
        'FG IN (SI)': po.si_date || 'Not Set',
        'MOISTURE': po.moisture_value ? po.moisture_value + '%' : '-',
        'TOTAL CTN': po.total_ctn_db || cartons.length || 0,
        'CARTON NUMBERS': ctnList
      };
    });`;

dash = dash.replace(oldMap, newMap);
fs.writeFileSync('server/routes/dashboard.js', dash);
