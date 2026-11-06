const fs = require('fs');
let code = fs.readFileSync('server/excelParser.js', 'utf8');

const regex = /if \(typeof excelDate === 'string'\) \{[\s\S]*?return null;\s*\}/;
const newCode = `if (typeof excelDate === 'string') {
    let cleanStr = excelDate.trim();
    if (cleanStr === '') return null;

    const match = cleanStr.match(/(\\d{1,2})\\/(\\d{1,2})/);
    if (match) {
      cleanStr = match[1] + '/' + match[2] + '/' + new Date().getFullYear();
    } else {
      cleanStr = cleanStr.replace(/[a-zA-Z]+/g, '').trim();
    }

    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      if (d.getFullYear() < 2020) d.setFullYear(new Date().getFullYear());
      const offset = d.getTimezoneOffset() * 60000;
      const localD = new Date(d.getTime() - offset);
      return localD.toISOString().split('T')[0];
    }
    return null;
  }`;

code = code.replace(regex, newCode);
fs.writeFileSync('server/excelParser.js', code);
