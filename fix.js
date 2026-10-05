const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');
let matches = ["''", "'WAITING_SI'", "'WATCHING'", "'ALERTED'", "'OVERDUE'"];
matches.forEach(m => {
    c = c.replace('<div class="stat-card">', '<div class="stat-card" onclick="toggleFilter(' + m + ')" style="cursor:pointer;" title="Click to filter">');
});
// bump css version to ensure reload if needed, or just let them refresh
c = c.replace(/v=\d+/, 'v=' + Date.now());
fs.writeFileSync('public/index.html', c);
