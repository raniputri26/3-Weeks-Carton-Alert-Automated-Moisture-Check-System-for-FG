const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');
const card = `
<div class="stat-card" onclick="toggleFilter('CHECKED')" style="cursor:pointer;" title="Click to filter">
    <div class="stat-header">
        <div class="stat-icon-wrap" style="background:#e6fae6; color:#2d8a2d;">
            <i data-lucide="check-circle"></i>
        </div>
        <span class="stat-trend trend-up" style="color:var(--c-success)"><i data-lucide="trending-up"></i> +3%</span>
    </div>
    <div class="stat-data">
        <span class="stat-label">Checked</span>
        <strong class="stat-value" id="stat-checked">0</strong>
    </div>
    <div class="stat-chart line-chart-2"></div>
</div>
`;
c = c.replace('<div class="stat-card" onclick="toggleFilter(\'OVERDUE\')"', card + '<div class="stat-card" onclick="toggleFilter(\'OVERDUE\')"');
c = c.replace(/v=\d+/, 'v=' + Date.now());
fs.writeFileSync('public/index.html', c);
