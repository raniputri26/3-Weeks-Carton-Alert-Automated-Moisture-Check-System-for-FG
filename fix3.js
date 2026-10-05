const fs = require('fs');
let c = fs.readFileSync('public/js/app.js', 'utf8');
c += `
function toggleFilter(status) {
    if (currentFilter === status) {
        currentFilter = '';
    } else {
        currentFilter = status;
    }
    if (els.filterSelect) els.filterSelect.value = currentFilter;
    loadPOs();
    const tbl = document.querySelector(".table-responsive") || document.querySelector("table");
    if(tbl) tbl.scrollIntoView({behavior: "smooth", block: "start"});
}
`;
fs.writeFileSync('public/js/app.js', c);
