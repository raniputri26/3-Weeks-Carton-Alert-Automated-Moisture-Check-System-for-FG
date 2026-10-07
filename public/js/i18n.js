const translations = {
    en: {
        menu_dashboard: "Dashboard",
        menu_analytics: "Analytics",
        menu_settings: "Settings",
        sys_status: "System Status",
        sys_desc: "WhatsApp Engine & Background Sync are running normally.",
        sys_online: "System Online",
        role_qc: "QC Inspector",
        hello_user: "Hello, Yani!",
        subtitle: "Here's what's happening with your carton moisture today.",
        stat_total_title: "Total PO Tracked",
        stat_waiting_title: "Waiting SI",
        stat_watching_title: "Watching",
        stat_alerted_title: "Alerted",
        stat_exported_title: "Exported",
        stat_checked_title: "Checked",
        stat_overdue_title: "Overdue",
        stat_total_desc: "Total registered orders",
        stat_waiting_desc: "Awaiting SI to start tracking",
        stat_watching_desc: "Active in 3-week window",
        stat_alerted_desc: "Reached 3 weeks, needs check",
        stat_exported_desc: "Exported & excluded",
        stat_checked_desc: "Moisture checked",
        stat_overdue_desc: "Unchecked 3 days post-alert",
        date_all: "All Time",
        date_day: "DAY",
        date_week: "WEEK",
        date_month: "MONTH",
        date_range: "RANGE",
        search_placeholder: "Search anything...",
        btn_run_alert: "Run Alert",
        btn_export: "Export Excel",
        btn_upload: "Upload Data",
        recent_orders: "Recent Orders",
        view_all: "View All Orders",
        filter_all: "All Status",
        th_po: "PO NO.",
        th_article: "ARTICLE & MARKET",
        th_status: "STATUS",
        th_due: "DUE / AGE",
        th_fg: "FG IN (SI)",
        th_export: "EXPORT DATE",
        th_moisture: "MOISTURE",
        th_action: "ACTION"
    },
    id: {
        menu_dashboard: "Dasbor",
        menu_analytics: "Analitik",
        menu_settings: "Pengaturan",
        sys_status: "Status Sistem",
        sys_desc: "Mesin WhatsApp & Sinkronisasi berjalan normal.",
        sys_online: "Sistem Online",
        role_qc: "Inspektur QC",
        hello_user: "Halo, Yani!",
        subtitle: "Inilah ringkasan pengecekan kelembapan karton hari ini.",
        stat_total_title: "Total PO Dilacak",
        stat_waiting_title: "Menunggu SI",
        stat_watching_title: "Dalam Pantauan",
        stat_alerted_title: "Perlu Dicek",
        stat_exported_title: "Telah Diekspor",
        stat_checked_title: "Selesai Dicek",
        stat_overdue_title: "Terlambat",
        stat_total_desc: "Semua pesanan terdaftar",
        stat_waiting_desc: "Menunggu SI untuk mulai pantauan",
        stat_watching_desc: "Aktif dalam pantauan 3 minggu",
        stat_alerted_desc: "Mencapai 3 minggu, butuh cek",
        stat_exported_desc: "Diekspor & tidak dipantau lagi",
        stat_checked_desc: "Pengecekan kelembapan selesai",
        stat_overdue_desc: "Belum dicek 3 hari setelah alert",
        date_all: "Semua Waktu",
        date_day: "HARI INI",
        date_week: "MINGGU INI",
        date_month: "BULAN INI",
        date_range: "RENTANG",
        search_placeholder: "Cari sesuatu...",
        btn_run_alert: "Jalankan Alert",
        btn_export: "Ekspor Excel",
        btn_upload: "Unggah Data",
        recent_orders: "Pesanan Terbaru",
        view_all: "Lihat Semua Pesanan",
        filter_all: "Semua Status",
        th_po: "NO. PO",
        th_article: "ARTIKEL & MARKET",
        th_status: "STATUS",
        th_due: "JATUH TEMPO / UMUR",
        th_fg: "MASUK FG (SI)",
        th_export: "TGL EKSPOR",
        th_moisture: "KELEMBAPAN",
        th_action: "AKSI"
    }
};

let currentLang = localStorage.getItem('app_lang') || 'en';

function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem('app_lang', lang);
    
    // Update Toggle UI
    const langDisplay = document.getElementById('lang-display');
    if (langDisplay) {
        langDisplay.textContent = lang.toUpperCase();
    }
    
    // Update Texts
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    
    // Update Placeholders
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        if (translations[lang][key]) {
            el.setAttribute('placeholder', translations[lang][key]);
        }
    });
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLang);
});

function toggleLanguage() {
    const newLang = currentLang === 'en' ? 'id' : 'en';
    setLanguage(newLang);
}
