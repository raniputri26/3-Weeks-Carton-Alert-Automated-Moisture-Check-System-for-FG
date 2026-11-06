const fs = require('fs');
let code = fs.readFileSync('server/excelParser.js', 'utf8');

// Replace the date parsing logic to strictly extract dates and ignore random words like REJECT
const oldLogic = `      let cleanStr = excelDate.replace(/PASSED/i, '').trim();
      if (/^\\d{1,2}\\/\\d{1,2}$/.test(cleanStr)) {
        cleanStr += '/' + new Date().getFullYear();
      }
      const ts = Date.parse(cleanStr);
      if (!isNaN(ts)) return new Date(ts).toISOString().split('T')[0];
      if (excelDate.trim() === '') return null;
      return null;`;

const newLogic = `      let cleanStr = excelDate.trim();
      // Extract MM/DD or DD/MM from strings like "REJECT 09/25"
      const match = cleanStr.match(/(\\d{1,2})\\/(\\d{1,2})/);
      if (match) {
        // If it's just MM/DD, append current year
        cleanStr = match[1] + '/' + match[2] + '/' + new Date().getFullYear();
      } else {
        // Remove words like PASSED, REJECT, etc to avoid insane Date.parse behavior
        cleanStr = cleanStr.replace(/[a-zA-Z]+/g, '').trim();
      }
      
      const ts = Date.parse(cleanStr);
      if (!isNaN(ts)) {
        const d = new Date(ts);
        // Prevent insane dates (like year 2001) by forcing current year if year < 2020
        if (d.getFullYear() < 2020) d.setFullYear(new Date().getFullYear());
        return d.toISOString().split('T')[0];
      }
      return null;`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('server/excelParser.js', code);
console.log('Fixed excelParser.js date parsing!');
