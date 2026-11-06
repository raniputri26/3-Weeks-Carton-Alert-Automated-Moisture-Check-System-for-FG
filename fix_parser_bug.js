const fs = require('fs');
let code = fs.readFileSync('server/excelParser.js', 'utf8');

// Fix parseExcelDate to return null for empty or invalid dates instead of returning the original truthy string
code = code.replace("return excelDate;", "return null;");
code = code.replace("if (typeof excelDate === 'string') {", "if (typeof excelDate === 'string') {\n      if (excelDate.trim() === '') return null;");

fs.writeFileSync('server/excelParser.js', code);
console.log('Fixed excelParser.js');
