const API_BASE = '/api';

// State
let poDataList = [];
let currentFilter = '';
let currentSearch = '';
let currentPage = 1;
const ITEMS_PER_PAGE = 20;

// DOM Elements
const els = {
    stats: {
        total: document.getElementById('stat-total'),
        waitingSi: document.getElementById('stat-waiting-si'),
        watching: document.getElementById('stat-watching'),
        alerted: document.getElementById('stat-alerted'),
        checked: document.getElementById('stat-checked'),
        overdue: document.getElementById('stat-overdue'),
        skipped: document.getElementById('stat-skipped'),
    },
    tableBody: document.getElementById('poTableBody'),
    filterSelect: document.getElementById('filterStatus'),
    searchInput: document.getElementById('searchInput'),
    masterTableBody: document.getElementById('poMasterTableBody'),
    poMasterShowingText: document.getElementById('poMasterShowingText'),
    poMasterPagination: document.getElementById('poMasterPagination'),
    excelUpload: document.getElementById('excelUpload'),
    lastUploadInfo: document.getElementById('lastUploadInfo'),
    
    // Modals
    moistureModal: document.getElementById('moistureModal'),
    detailModal: document.getElementById('detailModal'),
    uploadResultModal: document.getElementById('uploadResultModal'),
    
    // Moisture Form
    moistureForm: document.getElementById('moistureForm'),
    mcPoNumber: document.getElementById('mc-po-number'),
    mcValue: document.getElementById('mc-value'),
    mcPreview: document.getElementById('mc-preview'),
    mcPoSummary: document.getElementById('mc-po-summary'),
    btnSubmitMc: document.getElementById('btnSubmitMc'),
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        window.location.href = '/login.html';
        return;
    }

    // Sidebar Toggle Logic
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggleBtn = document.getElementById('sidebarToggle');
    
    // Load saved state
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        });
    }

    // Update UI based on user role
    const headerTitle = document.querySelector('.header-titles h1');
    const profileName = document.querySelector('.user-info strong');
    const profileRole = document.querySelector('.user-info span');
    const profileAvatar = document.querySelector('.avatar img');
    
    if (currentUser === 'Yani') {
        if (headerTitle) headerTitle.textContent = 'Hello, Yani! 👋';
        if (profileName) profileName.textContent = 'Yani';
        if (profileRole) profileRole.textContent = 'QC Inspector';
        if (profileAvatar) profileAvatar.src = 'https://ui-avatars.com/api/?name=Y+N&background=e8efe9&color=456b49&bold=true';
    } else {
        if (headerTitle) headerTitle.textContent = 'Hello, PNP Team! 👋';
        if (profileName) profileName.textContent = 'PNP Team';
        if (profileRole) profileRole.textContent = 'Guest / Viewer';
        if (profileAvatar) profileAvatar.src = 'https://ui-avatars.com/api/?name=P+T&background=fce8db&color=b56a42&bold=true';
        
        // Hide upload data button for guest
        const uploadBtn = document.querySelector('label[for="excelUpload"]');
        if (uploadBtn) uploadBtn.style.display = 'none';
    }

    loadStats();
    loadPOs();
    loadLastUploadInfo();
    setupEventListeners();
    
    // Auto refresh every 30 seconds
    setInterval(() => {
        loadStats();
        loadPOs(false); // background refresh
    }, 30000);
});

function setupEventListeners() {
    els.filterSelect.addEventListener('change', (e) => {
        currentFilter = e.target.value;
        loadPOs();
    });

    els.searchInput.addEventListener('input', debounce((e) => {
        currentSearch = e.target.value;
        loadPOs();
    }, 300));

    els.excelUpload.addEventListener('change', handleExcelUpload);

    els.mcValue.addEventListener('input', updateMoisturePreview);
    
    els.moistureForm.addEventListener('submit', handleMoistureSubmit);

        // Global Date Filters
    const dateType = document.getElementById('global-date-type');
    
    const containerDay = document.getElementById('input-day-container');
    const containerWeek = document.getElementById('input-week-container');
    const containerMonth = document.getElementById('input-month-container');
    const containerRange = document.getElementById('global-date-inputs');
    
    const valDay = document.getElementById('global-day-value');
    const valWeek = document.getElementById('global-week-value');
    const valMonth = document.getElementById('global-month-value');
    const valStart = document.getElementById('global-start-date');
    const valEnd = document.getElementById('global-end-date');
    
    function refreshAllData() {
        loadStats();
        loadPOs();
        initCharts();
    }
    
    function updateDateUI() {
        if(!dateType) return;
        const v = dateType.value;
        containerDay.style.display = v === 'DAY' ? 'block' : 'none';
        containerWeek.style.display = v === 'WEEK' ? 'block' : 'none';
        containerMonth.style.display = v === 'MONTH' ? 'block' : 'none';
        containerRange.style.display = v === 'RANGE' ? 'flex' : 'none';
        
        // initialize defaults if empty
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        
        if (v === 'DAY' && !valDay.value) valDay.value = `${yyyy}-${mm}-${dd}`;
        if (v === 'MONTH' && !valMonth.value) valMonth.value = `${yyyy}-${mm}`;
        if (v === 'WEEK' && !valWeek.value) {
            // approximation for current week
            const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
            valWeek.value = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        }
    }

    if (dateType) {
        dateType.addEventListener('change', () => {
            updateDateUI();
            refreshAllData(); 
        });
    }
    
    [valDay, valWeek, valMonth].forEach(el => {
        if(el) el.addEventListener('change', refreshAllData);
    });
    
    if (valStart && valEnd) {
        valStart.addEventListener('change', () => { if(valEnd.value) refreshAllData(); });
        valEnd.addEventListener('change', () => { if(valStart.value) refreshAllData(); });
    }
    
    // Init UI
    if (dateType) updateDateUI();
} // Data Fetching

function getWeekDateRange(year, week) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    
    const start = new Date(ISOweekStart);
    const end = new Date(ISOweekStart);
    end.setDate(start.getDate() + 6);
    
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
}

function buildUrlWithDateFilters(basePath) {
    let url = `${API_BASE}${basePath}`;
    const typeEl = document.getElementById('global-date-type');
    
    let params = new URLSearchParams();
    if (typeEl && typeEl.value) {
        const v = typeEl.value;
        params.append('type', v);
        
        if (v === 'DAY') {
            const el = document.getElementById('global-day-value');
            if (el && el.value) params.append('value', el.value);
        } else if (v === 'MONTH') {
            const el = document.getElementById('global-month-value');
            if (el && el.value) params.append('value', el.value);
        } else if (v === 'WEEK') {
            const el = document.getElementById('global-week-value');
            if (el && el.value) {
                const parts = el.value.split('-W');
                if (parts.length === 2) {
                    const range = getWeekDateRange(parseInt(parts[0]), parseInt(parts[1]));
                    params.append('start', range.start);
                    params.append('end', range.end);
                }
            }
        } else if (v === 'RANGE') {
            const startEl = document.getElementById('global-start-date');
            const endEl = document.getElementById('global-end-date');
            if (startEl && startEl.value && endEl && endEl.value) {
                params.append('start', startEl.value);
                params.append('end', endEl.value);
            }
        }
    }
    const q = params.toString();
    if (q) {
        url += (url.includes('?') ? '&' : '?') + q;
    }
    return url;
}

async function loadStats() {
    try {
        const res = await fetch(buildUrlWithDateFilters('/dashboard/stats'));
        if (!res.ok) return;
        const responseData = await res.json();
        // New structure: { current: {...}, trend: {...} }
        const stats = responseData.data.current || responseData.data || {};
        const trend = responseData.data.trend || {};
        
        els.stats.total.textContent = stats.TOTAL || 0;
        els.stats.waitingSi.textContent = stats.WAITING_SI || 0;
        els.stats.watching.textContent = stats.WATCHING || 0;
        els.stats.alerted.textContent = stats.ALERTED || 0;
        els.stats.checked.textContent = stats.CHECKED || 0;
        els.stats.overdue.textContent = stats.OVERDUE || 0;
        
        const statExported = document.getElementById('stat-exported');
        if (statExported) statExported.textContent = stats.EXPORTED || 0;
        
        // Helper to update trend spans
        const updateTrendSpan = (id, percent, invertGoodBad = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            
            // Reinitialize lucide icons for dynamic updates
            let icon = 'minus';
            let colorCls = 'trend-neutral';
            let sign = '';
            
            if (percent > 0) {
                icon = 'trending-up';
                sign = '+';
                colorCls = invertGoodBad ? 'trend-down' : 'trend-up';
                // Override CSS text color for extreme cases where we used inline styles
                el.style.color = invertGoodBad ? 'var(--c-danger)' : 'var(--c-success)';
            } else if (percent < 0) {
                icon = 'trending-down';
                sign = ''; // negative already has sign
                colorCls = invertGoodBad ? 'trend-up' : 'trend-down';
                el.style.color = invertGoodBad ? 'var(--c-success)' : 'var(--c-danger)';
            } else {
                el.style.color = ''; // reset inline color
            }
            
            el.className = `stat-trend ${colorCls}`;
            el.innerHTML = `<i data-lucide="${icon}"></i> ${sign}${percent}%`;
        };

        updateTrendSpan('trend-total', trend.TOTAL || 0);
        updateTrendSpan('trend-waiting-si', trend.WAITING_SI || 0);
        updateTrendSpan('trend-watching', trend.WATCHING || 0);
        // Overdue and Alerted are bad, so going up is red (invert = true)
        updateTrendSpan('trend-alerted', trend.ALERTED || 0, true);
        updateTrendSpan('trend-overdue', trend.OVERDUE || 0, true);
        updateTrendSpan('trend-checked', trend.CHECKED || 0);
        updateTrendSpan('trend-exported', trend.EXPORTED || 0);

        if (window.lucide) window.lucide.createIcons();

        if (stats.SKIPPED > 0) {
            // we don't have card-skipped anymore in the new UI, so skip this safely
            const skippedCard = document.getElementById('card-skipped');
            if (skippedCard) {
                skippedCard.style.display = 'flex';
                els.stats.skipped.textContent = stats.SKIPPED;
            }
        }
    } catch (err) {
        console.error('Failed to load stats', err);
    }
}

async function loadPOs(showLoading = true) {
    if (showLoading) {
        els.tableBody.innerHTML = `<tr><td colspan="10" class="text-center loading-text">Loading data...</td></tr>`;
    }
    
    try {
        const query = new URLSearchParams();
        if (currentFilter) query.append('status', currentFilter);
        if (currentSearch) query.append('search', currentSearch);
        
        const res = await fetch(`${API_BASE}/dashboard/pos?${query.toString()}`);
        if (!res.ok) throw new Error('API Error');
        const responseData = await res.json();
        poDataList = responseData.data || [];
        
        currentPage = 1;
        renderPOTable();
    } catch (err) {
        console.error('Failed to load POs', err);
        if (showLoading) {
            els.tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-fail" style="padding: 3rem;">Failed to load data. Backend might be down.</td></tr>`;
        }
    }
}

async function loadLastUploadInfo() {
    try {
        const res = await fetch(`${API_BASE}/upload/last`);
        if (res.ok) {
            const data = await res.json();
            if (data.uploaded_at && els.lastUploadInfo) {
                const date = new Date(data.uploaded_at);
                els.lastUploadInfo.textContent = `Last upload: ${formatDateTime(date)}`;
            }
        }
    } catch (err) {
        console.error('Failed to load last upload info', err);
    }
}

// Rendering
function renderPOTable() {
    if (poDataList.length === 0) {
        els.tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:4rem; color:#888;">No records found.</td></tr>`;
        const showingText = document.getElementById('showingText');
        if (showingText) showingText.textContent = `Showing 0 results`;
        return;
    }

    const totalPages = Math.ceil(poDataList.length / ITEMS_PER_PAGE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentData = poDataList.slice(startIndex, endIndex);

    const mapStatus = {
        'WAITING_SI': { cls: 'badge-gray', txt: 'Waiting SI', icon: 'clock' },
        'WATCHING': { cls: 'badge-peach', txt: 'Watching', icon: 'eye' },
        'ALERTED': { cls: 'badge-rose', txt: 'Alerted', icon: 'alert-circle' },
        'CHECKED': { cls: 'badge-blue', txt: 'Checked', icon: 'check-circle-2' },
        'OVERDUE': { cls: 'badge-rose', txt: 'Overdue', icon: 'x-circle' },
        'SKIPPED': { cls: 'badge-gray', txt: 'Skipped', icon: 'ban' },
        'EXPORTED': { cls: 'badge-purple', txt: 'Exported', icon: 'plane' },
    };

    // Render Dashboard Table
    els.tableBody.innerHTML = currentData.map((po) => {
        const s = mapStatus[po.status] || { cls: 'badge-gray', txt: po.status, icon: 'circle' };
        const badge = `<span class="badge ${s.cls}"><i data-lucide="${s.icon}" style="width:14px; height:14px;"></i> ${s.txt}</span>`;
        
        let moistureDisplay = '<span style="color:#8b8a86;">-</span>';
        if (po.moisture_result === 'PASS') moistureDisplay = `<span style="color:#456b49; font-weight:600; display:flex; align-items:center; gap:4px;"><i data-lucide="check" style="width:14px; height:14px;"></i> ${po.moisture_value}%</span>`;
        if (po.moisture_result === 'FAIL') moistureDisplay = `<span style="color:#b54242; font-weight:600; display:flex; align-items:center; gap:4px;"><i data-lucide="x" style="width:14px; height:14px;"></i> ${po.moisture_value}%</span>`;
        
        let actionBtn = '';
        const currentUser = localStorage.getItem('currentUser');
        if (po.status === 'ALERTED' || po.status === 'OVERDUE') {
            if (currentUser === 'Yani') {
                actionBtn = `<button class="action-link danger" onclick="openMoistureModal('${po.po_number}', event)">Submit QC</button>`;
            } else {
                actionBtn = `<button class="action-link" onclick="openDetailModal('${po.po_number}')">View Details</button>`;
            }
        } else {
            actionBtn = `<button class="action-link" onclick="openDetailModal('${po.po_number}')">View Details</button>`;
        }

        const fgInDate = po.si_date ? formatDate(po.si_date) : '<span style="color:#8b8a86;">Not Set</span>';
        const exportDate = po.export_date ? formatDate(po.export_date) : '<span style="color:#8b8a86;">-</span>';
        
        // Due logic
        const usia = po.si_date ? calculateAge(po.si_date) : 0;
        let dueClass = 'safe';
        if (po.status === 'WATCHING' && usia > 14) dueClass = 'alert';
        if (po.status === 'WATCHING' && usia > 20) dueClass = 'danger';
        if (po.status === 'ALERTED' || po.status === 'OVERDUE') dueClass = 'danger';
        const dueBox = po.si_date ? `<span class="due-text ${dueClass}">${usia} days</span>` : '-';

        return `
            <tr>
                <td><div class="primary-text" style="color:#36453b;">${po.po_number}</div></td>
                <td>
                    <div class="primary-text">${po.article || '-'}</div>
                    <div class="secondary-text">${po.market || '-'} &bull; ${po.customer || '-'}</div>
                </td>
                <td>${badge}</td>
                <td>${dueBox}</td>
                <td>${fgInDate}</td>
                <td>${exportDate}</td>
                <td>${moistureDisplay}</td>
                <td>${actionBtn}</td>
            </tr>
        `;
    }).join('');

    // Render Master Data Table (PO Tracking)
    if (els.masterTableBody) {
        els.masterTableBody.innerHTML = currentData.map((po) => {
            const s = mapStatus[po.status] || { cls: 'badge-gray', txt: po.status, icon: 'circle' };
            const badge = `<span class="badge ${s.cls}"><i data-lucide="${s.icon}" style="width:14px; height:14px;"></i> ${s.txt}</span>`;
            
            let actionBtn = `<button class="btn-action" title="View Details" onclick="openDetailModal('${po.po_number}')"><i data-lucide="eye"></i></button>`;
            const currentUser = localStorage.getItem('currentUser');
            if (po.status === 'ALERTED' || po.status === 'OVERDUE') {
                if (currentUser === 'Yani') {
                    actionBtn = `<button class="btn-action" title="Submit QC" style="background: var(--c-accent-hover); color: white;" onclick="openMoistureModal('${po.po_number}', event)"><i data-lucide="edit-3"></i></button>`;
                }
            }

            const fgInDate = po.si_date ? formatDate(po.si_date) : '<span style="color:#8b8a86;">Not Set</span>';

            return `
                <tr>
                    <td><div class="po-badge">${po.po_number}</div></td>
                    <td><strong>${po.article || '-'}</strong></td>
                    <td><span style="color: var(--c-text-muted);">${po.market || '-'} / ${po.customer || '-'}</span></td>
                    <td>${po.qty_order ? po.qty_order.toLocaleString() : '-'}</td>
                    <td>${fgInDate}</td>
                    <td>${badge}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        }).join('');
    }

    const showingText = document.getElementById('showingText');
    if (showingText) {
        showingText.textContent = `Showing ${startIndex + 1} - ${Math.min(endIndex, poDataList.length)} of ${poDataList.length} orders`;
    }

    if (els.poMasterShowingText) {
        els.poMasterShowingText.textContent = `Showing ${startIndex + 1} to ${Math.min(endIndex, poDataList.length)} of ${poDataList.length} entries`;
    }

    if (els.poMasterPagination) {
        let paginationHtml = `<button class="elegant-select" style="padding: 0.5rem 1rem; border-radius: 6px;" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
        // Just show current page for simplicity in mock
        paginationHtml += `<button class="btn-primary" style="padding: 0.5rem 1rem; border-radius: 6px;">${currentPage}</button>`;
        paginationHtml += `<button class="elegant-select" style="padding: 0.5rem 1rem; border-radius: 6px;" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
        els.poMasterPagination.innerHTML = paginationHtml;
    }

    const pageIndicator = document.getElementById('pageIndicator');
    if (pageIndicator) {
        pageIndicator.textContent = `${currentPage} / ${totalPages}`;
    }

    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');
    if (btnPrev) btnPrev.disabled = currentPage === 1;
    if (btnNext) btnNext.disabled = currentPage === totalPages;

    renderMarquee(currentData);
    // Initialize Lucide icons on newly rendered table rows
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Pagination Logic
function changePage(delta) {
    const totalPages = Math.ceil(poDataList.length / ITEMS_PER_PAGE) || 1;
    let newPage = currentPage + delta;
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    
    if (newPage !== currentPage) {
        currentPage = newPage;
        renderPOTable();
    }
}

// Upload Handling
async function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('excelFile', file);

    if (els.lastUploadInfo) els.lastUploadInfo.textContent = 'Uploading...';
    
    try {
        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            showToast('Upload successful!', 'success');
            showUploadResultModal(data.stats);
            loadStats();
            loadPOs();
            loadLastUploadInfo();
        } else {
            throw new Error(data.message || data.error || 'Upload failed');
        }
    } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
        if (els.lastUploadInfo) els.lastUploadInfo.textContent = 'Upload failed';
    } finally {
        e.target.value = ''; // Reset file input
    }
}

// Moisture Check
function updateMoisturePreview() {
    const val = parseFloat(els.mcValue.value);
    if (isNaN(val)) {
        els.mcPreview.textContent = '--';
        els.mcPreview.className = 'preview-badge';
        return;
    }
    
    if (val >= 15) {
        els.mcPreview.textContent = '❌ FAIL';
        els.mcPreview.className = 'preview-badge fail';
    } else {
        els.mcPreview.textContent = '✅ PASS';
        els.mcPreview.className = 'preview-badge pass';
    }
}

async function handleMoistureSubmit(e) {
    e.preventDefault();
    const poNumber = els.mcPoNumber.value;
    const value = parseFloat(els.mcValue.value);
    const checkedBy = document.getElementById('mc-checked-by').value;
    const remarks = document.getElementById('mc-remarks').value;

    const payload = { po_number: poNumber, checked_by: checkedBy, moisture_value: value, remarks };

    els.btnSubmitMc.disabled = true;
    els.btnSubmitMc.textContent = 'Submitting...';

    try {
        const res = await fetch(`${API_BASE}/moisture-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Moisture check saved successfully!', 'success');
            closeModal('moistureModal');
            loadStats();
            loadPOs();
        } else {
            throw new Error(data.error || 'Failed to save');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        els.btnSubmitMc.disabled = false;
        els.btnSubmitMc.textContent = 'Submit Check';
    }
}

// Auth
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = '/login.html';
}

// Modals
async function openMoistureModal(poNumber, event) {
    if (event) event.stopPropagation();
    
    // Find PO data
    const po = poDataList.find(p => p.po_number === poNumber);
    if (!po) return;

    els.mcPoNumber.value = po.po_number;
    els.mcPoSummary.innerHTML = `
        <p><strong>PO Number:</strong> ${po.po_number}</p>
        <p><strong>Article:</strong> ${po.article} | <strong>Market:</strong> ${po.market}</p>
        <p><strong>FG In Date:</strong> ${formatDate(po.si_date)} (${calculateAge(po.si_date)} days)</p>
    `;
    
    // Reset form
    els.moistureForm.reset();
    updateMoisturePreview();
    
    els.moistureModal.classList.add('active');
}

async function openDetailModal(poNumber) {
    els.detailModal.classList.add('active');
    const body = document.getElementById('detail-modal-body');
    body.innerHTML = `<div class="loading-spinner" style="text-align:center; padding: 2rem;">Loading details...</div>`;
    
    try {
        const res = await fetch(`${API_BASE}/dashboard/po/${poNumber}`);
        if (!res.ok) throw new Error('Failed to fetch details');
        const poResponse = await res.json();
        const po = poResponse.data;
        
        const cartonsHtml = (po.cartons && po.cartons.length > 0) 
            ? po.cartons.map(c => `<span class="carton-tag">${c}</span>`).join('') 
            : '<span class="text-muted">No carton data</span>';

        let historyHtml = '<p class="text-muted">No moisture check history.</p>';
        if (po.checks && po.checks.length > 0) {
            historyHtml = `
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Checker</th>
                            <th>Value</th>
                            <th>Result</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${po.checks.map(mc => `
                            <tr>
                                <td>${formatDateTime(mc.check_date)}</td>
                                <td>${mc.checked_by}</td>
                                <td><strong style="color:var(--c-text-main)">${mc.moisture_value}%</strong></td>
                                <td>${mc.result === 'PASS' ? '<span class="badge badge-sage">PASS</span>' : '<span class="badge badge-rose">FAIL</span>'}</td>
                                <td>${mc.remarks || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        const mapStatus = {
            'WAITING_SI': { cls: 'badge-gray', txt: 'Waiting SI' },
            'WATCHING': { cls: 'badge-peach', txt: 'Watching' },
            'ALERTED': { cls: 'badge-rose', txt: 'Alerted' },
            'CHECKED': { cls: 'badge-blue', txt: 'Checked' },
            'OVERDUE': { cls: 'badge-rose', txt: 'Overdue' },
            'SKIPPED': { cls: 'badge-gray', txt: 'Skipped' },
            'EXPORTED': { cls: 'badge-purple', txt: 'Exported' },
        };
        const statusBadge = mapStatus[po.status] ? `<span class="badge ${mapStatus[po.status].cls}">${mapStatus[po.status].txt}</span>` : po.status;
        const poStatus = mapStatus[po.status] || { cls: 'badge-gray', txt: po.status };
        const siDateStr = po.si_date ? formatDate(po.si_date) : '-';

        
        
        const mcResult = po.checks && po.checks.length > 0 ? po.checks[0].result : null;
        let mainBadge = statusBadge;
        

        // Timeline Logic nodes: FG IN -> SI Date -> Moisture 1 -> Moisture 2 -> Exported
        const fgInDate = po.start_in_fg ? formatDate(po.start_in_fg) : (po.created_at ? formatDateTime(po.created_at).split(' ')[0] : '-');
        const siDate = po.si_date ? formatDate(po.si_date) : '-';
        
        let m1Date = '-', m2Date = '-';
        let checks = po.checks || [];
        // DB returns ORDER BY check_date DESC. So [length-1] is the first check, [length-2] is second.
        if (checks.length > 0) m1Date = formatDateTime(checks[checks.length - 1].check_date);
        if (checks.length > 1) m2Date = formatDateTime(checks[checks.length - 2].check_date);
        
        const exportDateStr = po.export_date ? formatDate(po.export_date) : '-';

        let t1_cls = fgInDate !== '-' ? 'active-solid-green' : '';
        let t2_cls = siDate !== '-' ? 'active-orange' : '';
        let t3_cls = m1Date !== '-' ? 'active-blue' : '';
        let t4_cls = m2Date !== '-' ? 'active-blue' : '';
        let t5_cls = exportDateStr !== '-' ? 'active-purple' : '';

        body.innerHTML = `
            <div class="modern-modal-body">
                <div class="detail-top-card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <h2>${po.po_number} ${mainBadge}</h2>
                            <div class="detail-subtitle">
                                Warehouse: <span style="color:#ed8936; font-weight:700;">${po.warehouse || '-'}</span>
                            </div>
                        </div>
                        <div class="detail-top-right">
                            
                            <button class="btn-close-new" onclick="closeModal('detailModal')"><i data-lucide="x" style="width:20px;"></i></button>
                        </div>
                    </div>
                </div>

                <div class="timeline-box">
                    <div class="timeline-title">
                        <i data-lucide="calendar" style="width:16px;"></i> PROCESS TIMELINE
                    </div>
                    <div class="timeline-container">
                        <div class="timeline-line"></div>
                        <div class="timeline-step">
                            <div class="step-label">FG IN</div>
                            <div class="step-dot ${t1_cls}"></div>
                            <div class="step-date" style="color: ${t1_cls ? '#48bb78' : '#a0aec0'};">${fgInDate}</div>
                        </div>
                        <div class="timeline-step">
                            <div class="step-label">SI DATE</div>
                            <div class="step-dot ${t2_cls}"></div>
                            <div class="step-date" style="color: ${t2_cls ? '#ed8936' : '#a0aec0'};">${siDate}</div>
                        </div>
                        <div class="timeline-step">
                            <div class="step-label"><div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><span>Moisture 1</span><span style="font-size:0.6rem;font-weight:500;">(3 weeks)</span></div></div>
                            <div class="step-dot ${t3_cls}"></div>
                            <div class="step-date" style="color: ${t3_cls ? '#4299e1' : '#a0aec0'};">${m1Date.split(' ').slice(0,3).join(' ') || '-'}</div>
                        </div>
                        ${m2Date !== '-' ? `
                        <div class="timeline-step">
                            <div class="step-label">Moisture 2</div>
                            <div class="step-dot ${t4_cls}"></div>
                            <div class="step-date" style="color: ${t4_cls ? '#4299e1' : '#a0aec0'};">${m2Date.split(' ').slice(0,3).join(' ') || '-'}</div>
                        </div>
                        ` : ''}
                        <div class="timeline-step">
                            <div class="step-label">Exported</div>
                            <div class="step-dot ${t5_cls}"></div>
                            <div class="step-date" style="color: ${t5_cls ? '#9f7aea' : '#a0aec0'};">${exportDateStr}</div>
                        </div>
                    </div>
                </div>

                <div class="appendix-box">
                    <div class="appendix-title">
                        <i data-lucide="box" style="width:16px;"></i> Appendix Data
                    </div>
                    <div class="appendix-grid">
                        <div class="app-item">
                            <span class="app-label">PO Number</span>
                            <span class="app-val" style="color:#4299e1;">${po.po_number}</span>
                        </div>
                        <div class="app-item">
                            <span class="app-label">Article/Style</span>
                            <span class="app-val">${po.article || '-'}</span>
                        </div>
                        <div class="app-item">
                            <span class="app-label">Market</span>
                            <span class="app-val">${po.market || '-'}</span>
                        </div>
                        <div class="app-item">
                            <span class="app-label">Customer</span>
                            <span class="app-val">${po.customer || '-'}</span>
                        </div>
                        <div class="app-item">
                            <span class="app-label">Total QTY Order</span>
                            <span class="app-val">${po.qty_order ? po.qty_order.toLocaleString() : '-'}</span>
                        </div>
                        <div class="app-item">
                            <span class="app-label">Total Cartons</span>
                            <span class="app-val">${po.cartons ? po.cartons.length : 0}</span>
                        </div>
                    </div>
                </div>

                <div class="results-box">
                    <div class="results-title">
                        <i data-lucide="flask-conical" style="width:16px;"></i> Moisture Check Results
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <span class="app-label" style="display:block; margin-bottom:0.5rem;">CARTON NUMBERS SCANNED</span>
                        <div class="carton-tags">
                            ${cartonsHtml}
                        </div>
                    </div>
                    <div>
                        <span class="app-label" style="display:block; margin-bottom:0.5rem;">HISTORY LOG</span>
                        ${historyHtml}
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        body.innerHTML = `<div class="text-center text-fail" style="padding: 2rem;">Failed to load PO details.</div>`;
    }
}

function showUploadResultModal(stats) {
    const body = document.getElementById('upload-result-body');
    body.innerHTML = `
        <p>File parsed successfully. Total rows processed: <strong>${stats.totalRows || 0}</strong></p>
        <div class="upload-stats-grid">
            <div class="upload-stat-box">
                <div class="num">${stats.newPOs || 0}</div>
                <div class="label">New POs Added</div>
            </div>
            <div class="upload-stat-box">
                <div class="num">${stats.updatedSIDates || 0}</div>
                <div class="label">SI Dates Updated</div>
            </div>
            <div class="upload-stat-box">
                <div class="num">${stats.newCartons || 0}</div>
                <div class="label">New Cartons</div>
            </div>
            <div class="upload-stat-box">
                <div class="num">${stats.skippedCartons || 0}</div>
                <div class="label">Duplicates Skipped</div>
            </div>
        </div>
    `;
    els.uploadResultModal.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Helpers
function getStatusBadge(status) {
    const map = {
        'WAITING_SI': { cls: 'waiting', icon: '⏱️', text: 'Waiting SI' },
        'WATCHING': { cls: 'watching', icon: '👁️', text: 'Watching' },
        'ALERTED': { cls: 'alerted', icon: '⚠️', text: 'Alerted' },
        'CHECKED': { cls: 'checked', icon: '✅', text: 'Checked' },
        'OVERDUE': { cls: 'overdue', icon: '❌', text: 'Overdue' },
        'SKIPPED': { cls: 'skipped', icon: '⏭️', text: 'Skipped' },
        'EXPORTED': { cls: 'exported', icon: '✈️', text: 'Exported' },
    };
    const s = map[status] || { cls: 'waiting', icon: '➖', text: status };
    return `<span class="badge badge-${s.cls}">${s.icon} ${s.text}</span>`;
}

function getMoistureDisplay(result, value) {
    if (result === 'PASS') return `<span class=\"text-pass\">✅ ${value}% Pass</span>`;
    if (result === 'FAIL') return `<span class=\"text-fail\">❌ ${value}% Fail</span>`;
    if (result === 'PENDING') return `<span class=\"text-pending\">⏳ Pending</span>`;
    return `<span class=\"text-na\">➖ N/A</span>`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateTime(d) {
    if (typeof d === 'string') d = new Date(d);
    if (isNaN(d)) return '';
    return `${formatDate(d)} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function calculateAge(siDateStr) {
    if (!siDateStr) return 0;
    const si = new Date(siDateStr);
    const now = new Date();
    si.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    const diffTime = Math.abs(now - si);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return now >= si ? diffDays : -diffDays; 
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : '❌';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// SPA View Switching Logic
window.switchView = function(viewId) {
    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    // Hide dashboard widgets specially
    const widgets = document.getElementById('view-dashboard-widgets');
    if(widgets) widgets.style.display = 'none';

    // Update active nav state
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
        el.classList.remove('active');
        if(el.dataset.view === viewId) el.classList.add('active');
    });

    // Show the requested view
    if (viewId === 'dashboard') {
        if(widgets) widgets.style.display = '';
        document.getElementById('view-dashboard-content').style.display = '';
    } else {
        const targetView = document.getElementById('view-' + viewId + '-content');
        if (targetView) targetView.style.display = '';
        
        if (viewId === 'analytics') {
            initCharts();
        }
    }
    
    // Re-render icons if any were in the newly shown view
    if (window.lucide) {
        lucide.createIcons();
    }
};

// Add click listeners to nav items
document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = item.dataset.view;
        if (viewId) switchView(viewId);
    });
});

// Init Charts for Analytics View
async function initCharts() {
    try {
        const res = await fetch(buildUrlWithDateFilters('/dashboard/analytics'));
        if (!res.ok) return;
        const responseData = await res.json();
        const data = responseData.data;

        const elFg = document.getElementById('analytics-fg-month');
        if (elFg) elFg.textContent = data.metrics.fgInMonth;
        
        const elSi = document.getElementById('analytics-waiting-si');
        if (elSi) elSi.textContent = data.metrics.waitingSI;
        
        const el3w = document.getElementById('analytics-over-3w');
        if (el3w) el3w.textContent = data.metrics.over3Weeks;
        
        const elExp = document.getElementById('analytics-exported');
        if (elExp) elExp.textContent = data.metrics.exported;

        const ratioCtx = document.getElementById('ratioChart');
        const trendCtx = document.getElementById('trendChart');
        const vendorCtx = document.getElementById('vendorChart');

        // Shared tooltip configuration
        const tooltipOptions = {
            backgroundColor: 'rgba(252, 252, 249, 0.95)',
            titleColor: '#36453b',
            bodyColor: '#36453b',
            borderColor: '#e8e8e3',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            titleFont: { family: 'Inter', size: 13, weight: '600' },
            bodyFont: { family: 'Inter', size: 12 }
        };

        if(ratioCtx) {
            if (window.ratioChartInstance) window.ratioChartInstance.destroy();
            window.ratioChartInstance = new Chart(ratioCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Pass (<15%)', 'Fail (>=15%)'],
                    datasets: [{
                        data: [data.charts.ratio.pass, data.charts.ratio.fail],
                        backgroundColor: ['#e8efe9', '#fae3e3'],
                        borderColor: ['#456b49', '#b54242'],
                        borderWidth: 1,
                        hoverOffset: 4
                    }]
                },
                options: { 
                    cutout: '78%', 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: { duration: 2500, easing: 'easeOutQuart' },
                    plugins: { 
                        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: 'Inter' } } },
                        tooltip: tooltipOptions
                    } 
                }
            });
        }

        if(trendCtx) {
            if (window.trendChartInstance) window.trendChartInstance.destroy();
            const ctx = trendCtx.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(181, 106, 66, 0.3)');
            gradient.addColorStop(1, 'rgba(252, 232, 219, 0.0)');

            window.trendChartInstance = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: data.charts.trend.labels,
                    datasets: [{
                        label: 'Avg Moisture %',
                        data: data.charts.trend.data,
                        borderColor: '#b56a42',
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#b56a42',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: { duration: 1500, easing: 'easeOutExpo' },
                    plugins: { legend: { display: false }, tooltip: tooltipOptions },
                    scales: { 
                        y: { beginAtZero: false, grid: { color: '#f0f0ea', drawBorder: false }, ticks: { font: { family: 'Inter' } } },
                        x: { grid: { display: false, drawBorder: false }, ticks: { font: { family: 'Inter' } } }
                    } 
                }
            });
        }

        if(vendorCtx) {
            if (window.vendorChartInstance) window.vendorChartInstance.destroy();
            window.vendorChartInstance = new Chart(vendorCtx, {
                type: 'bar',
                data: {
                    labels: data.charts.market.labels,
                    datasets: [{
                        label: 'Fails / Rejected',
                        data: data.charts.market.data,
                        backgroundColor: '#fae3e3',
                        borderColor: '#b54242',
                        borderWidth: 1,
                        borderRadius: 6,
                        barPercentage: 0.6
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: { duration: 1500, easing: 'easeOutQuart' },
                    plugins: { legend: { display: false }, tooltip: tooltipOptions },
                    scales: { 
                        y: { beginAtZero: true, grid: { color: '#f0f0ea', drawBorder: false }, ticks: { font: { family: 'Inter' } } },
                        x: { grid: { display: false, drawBorder: false }, ticks: { font: { family: 'Inter' } } }
                    } 
                }
            });
        }
    } catch (err) {
        console.error('Failed to load analytics', err);
    }
}

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


// Manual Alert Trigger
async function triggerManualAlert() {
    if(!confirm('Kirim alert sekarang secara manual?')) return;
    try {
        const res = await fetch('/api/dashboard/trigger-alerts', { method: 'POST' });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, 'success');
        } else {
            showToast(data.message || 'Error', 'error');
        }
    } catch(err) {
        showToast(err.message, 'error');
    }
}

function exportExcel() {
    let url = API_BASE + '/dashboard/export?';
    if (currentFilter) url += 'status=' + currentFilter + '&';
    if (currentSearch) url += 'search=' + currentSearch;
    window.open(url, '_blank');
}

// Marquee Rendering
function renderMarquee(data) {
    const ticker = document.getElementById('marquee-ticker');
    if (!ticker) return;
    
    if (!data || data.length === 0) {
        ticker.innerHTML = '<span style="color: #a0aec0; font-size: 0.75rem;">No recent activity</span>';
        return;
    }
    
    // Grab top 10 most "active" or recent items
    // For now, let's just grab the first 10 from the data array
    const recentItems = data.slice(0, 15);
    
    // Status color mapping for badge
    const badgeColors = {
        'WAITING_SI': { bg: '#fff3cd', color: '#856404' },
        'WATCHING': { bg: '#cce5ff', color: '#004085' },
        'ALERTED': { bg: '#f8d7da', color: '#721c24' },
        'EXPORTED': { bg: '#e2e3e5', color: '#383d41' },
        'CHECKED': { bg: '#d4edda', color: '#155724' },
        'OVERDUE': { bg: '#f8d7da', color: '#721c24' }
    };

    let html = '';
    recentItems.forEach(po => {
        const style = badgeColors[po.status] || { bg: '#e2e3e5', color: '#383d41' };
        
        let articleText = (po.article || '') + (po.market ? ` • ${po.market}` : '');
        if (articleText.length > 30) articleText = articleText.substring(0, 30) + '...';
        
        html += `
            <div class="marquee-item">
                <span class="marquee-badge" style="background: ${style.bg}; color: ${style.color};">
                    <i data-lucide="activity" style="width:10px; height:10px; margin-right:2px; display:inline-block;"></i>${po.status}
                </span>
                <span><b>${po.po_number}</b> - ${articleText}</span>
                <span class="marquee-time">${po.age_days ? po.age_days + ' days' : 'New'}</span>
            </div>
        `;
    });
    
    // Duplicate the content to make the scrolling smoother (if it wraps)
    ticker.innerHTML = html + html;
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}
