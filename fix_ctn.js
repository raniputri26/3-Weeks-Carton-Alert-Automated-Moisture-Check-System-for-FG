const fs = require('fs');
let dash = fs.readFileSync('server/routes/dashboard.js', 'utf8');
dash = dash.replace('const ctnList = cartons.map(c => c.ctn_number).join(\', \');', 'const ctnList = cartons.join(\', \');');
fs.writeFileSync('server/routes/dashboard.js', dash);
