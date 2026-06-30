import * as XLSX from 'xlsx';
import logo from '@/assets/logo.jpg';


export function exportToExcel(rows: Record<string, unknown>[], filename: string, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

let logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const res = await fetch(logo);
    const blob = await res.blob();
    logoDataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return logoDataUrl;
  } catch {
    return new URL(logo, window.location.origin).href;
  }
}

export async function printHTML(bodyHTML: string, title = 'Print', subtitle?: string) {
  await _printDoc(bodyHTML, title, subtitle);
}

export async function printElement(elementId: string, title = 'Print', subtitle?: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  await _printDoc(el.innerHTML, title, subtitle);
}

async function _printDoc(innerHTML: string, title: string, subtitle?: string) {
  const logoSrc = await getLogoDataUrl();
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return;
  const date = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      *{box-sizing:border-box}
      @page{size:A4;margin:0}
      body{padding:6mm 8mm}

      html,body{margin:0;padding:0;background:#fff;color:#0b1e3a;
        font-family:-apple-system,"Segoe UI",Roboto,Inter,Arial,sans-serif;
        font-size:11px;line-height:1.35;-webkit-font-smoothing:antialiased}

      /* ===== Header band ===== */
      .ph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
        padding:10px 4px;margin-bottom:10px;text-align:center}
      .ph img.logo{width:60px;height:60px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid #c7d2fe;
        box-shadow:0 2px 4px rgba(11,30,58,.25)}
      .ph .office{font-size:22px;font-weight:800;color:#0b1e3a;letter-spacing:.4px;text-transform:uppercase}


      /* ===== Details strip (after header) ===== */
      .pd{display:flex;justify-content:space-between;align-items:center;gap:12px;
        padding:8px 14px;margin-bottom:10px;border-radius:6px;
        background:#eef4fb;border:1px solid #cfdcec}
      .pd h1{margin:0;font-size:13px;font-weight:700;color:#0b1e3a;letter-spacing:.3px}
      .pd .sub{font-size:10.5px;color:#475569;margin-top:2px}
      .pd .stamp{font-size:9.5px;color:#64748b;letter-spacing:.4px;text-transform:uppercase;text-align:right}


      /* ===== Table ===== */
      table{width:100%;border-collapse:separate;border-spacing:0;font-size:10.5px;
        border:1px solid #0b1e3a;border-radius:4px;overflow:hidden}
      thead th{background:#0b1e3a;color:#fff;padding:7px 8px;text-align:left;
        font-weight:600;font-size:10px;letter-spacing:.4px;text-transform:uppercase;
        border-right:1px solid #1e3a5f}
      thead th:last-child{border-right:none}
      tbody td{padding:6px 8px;border-bottom:1px solid #e2e8f0;border-right:1px solid #eef2f7;
        vertical-align:middle;color:#0f172a}
      tbody td:last-child{border-right:none}
      tbody tr:nth-child(even) td{background:#f8fafc}
      tbody tr:hover td{background:#eff6ff}
      tfoot td{font-weight:700;background:#e2e8f0;color:#0b1e3a;
        padding:8px;border-top:2px solid #0b1e3a;font-size:10.5px}
      .text-right{text-align:right}
      .text-center{text-align:center}

      /* Color accents preserved from app */
      .text-recv{color:#0e7490;font-weight:600}
      .text-stock{color:#15803d;font-weight:600}
      .text-sample{color:#a16207;font-weight:600}
      .text-ship{color:#7c3aed;font-weight:600}

      /* ===== Smart KPI strip for breakdown prints ===== */
      .kpis{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
      .kpi{flex:1 1 140px;min-width:120px;border:1.5px solid #cbd5e1;border-radius:8px;
        padding:8px 10px;background:linear-gradient(135deg,#f8fafc,#eef4fb)}
      .kpi .lbl{font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:#64748b;font-weight:600}
      .kpi .val{font-size:18px;font-weight:800;color:#0b1e3a;margin-top:2px;line-height:1.1}
      .kpi .sub{font-size:9.5px;color:#64748b;margin-top:1px}
      .kpi.k-recv{border-color:#0e7490}.kpi.k-recv .val{color:#0e7490}
      .kpi.k-stock{border-color:#15803d}.kpi.k-stock .val{color:#15803d}
      .kpi.k-sample{border-color:#a16207}.kpi.k-sample .val{color:#a16207}
      .kpi.k-ship{border-color:#7c3aed}.kpi.k-ship .val{color:#7c3aed}

      /* Responsive on-screen view of print preview */
      .tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
      @media (max-width:640px){
        body{padding:4mm}
        .ph .office{font-size:17px}
        .pd{flex-direction:column;align-items:flex-start;gap:4px;padding:6px 10px}
        .pd .stamp{text-align:left}
        thead th,tbody td,tfoot td{padding:5px 6px;font-size:10px}
        .kpi{flex:1 1 100%}
      }

      a{color:inherit;text-decoration:none}
      button,.no-print,[role="button"]{display:none !important}
      input,select,textarea{border:none !important;background:transparent !important;padding:0 !important;color:inherit !important;font:inherit !important}

      /* ===== Footer ===== */
      .pf{position:fixed;left:10mm;right:10mm;bottom:6mm;
        display:flex;justify-content:space-between;align-items:center;
        font-size:9px;color:#64748b;padding-top:4px;border-top:1px solid #cbd5e1}
      .pf .mnr{font-weight:700;color:#0b1e3a;letter-spacing:.5px}

      @media print{
        body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        thead{display:table-header-group}
        tfoot{display:table-footer-group}
        tr,td,th{page-break-inside:avoid}
      }
    </style></head><body>
      ${(() => {
        const parts = (subtitle || '').split(' · ');
        const titleCase = (s: string) => s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        const officeName = titleCase(parts.shift() || '');
        const restSub = parts.map(titleCase).join(' · ');
        return `
      <div class="ph">
        <img class="logo" src="${logoSrc}" alt="MNR" />
        <div class="office">${officeName}</div>
      </div>
      <div class="pd">
        <div>
          <h1>${title}</h1>
          ${restSub ? `<div class="sub">${restSub}</div>` : ''}
        </div>
        <div class="stamp">Printed ${date}</div>
      </div>`;
      })()}
      ${innerHTML}
    </body></html>`);


  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 400);
}


