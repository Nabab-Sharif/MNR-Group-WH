import { Fragment, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Navigate, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Package, MapPin, Truck, TestTube2, FileSpreadsheet, Printer, History, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { exportToExcel, printHTML } from '@/lib/exportExcel';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';



interface Office { id: string; name: string; location: string | null; }
interface IssueLine {
  ctn_qty: number; pcs_per_ctn: number; returned_ctn: number; returned_pcs: number;
  source_carton: { location: string | null; rack: string | null } | null;
}
interface Row {
  office_id: string;
  receive_cartons: { ctn_qty: number; pcs_per_ctn: number; location: string | null; rack: string | null }[];
  receive_issues: { issue_type: 'sample' | 'inspection' | 'shipment'; total_ctn: number; total_pcs: number; destination: string | null; receive_issue_lines: IssueLine[] }[];
}

type LocItem = { label: string; current?: string; ctn: number; pcs: number };
interface Summary {
  id: string; name: string; location: string | null;
  recvCtn: number; recvPcs: number;
  stockCtn: number; stockPcs: number;
  shipmentCtn: number; shipmentPcs: number;
  sampleCtn: number; samplePcs: number;
  locByKey: { recv: LocItem[]; stock: LocItem[]; shipment: LocItem[]; sample: LocItem[] };
}


const ManagementDashboard = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const navigate = useNavigate();
  const [offices, setOffices] = useState<Office[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<null | { key: 'recv' | 'stock' | 'shipment' | 'sample'; label: string; color: string; border: string; icon: any }>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<Array<{ id: string; action: string; created_at: string; changed_by_name: string | null; office_id: string; details: Record<string, any> }>>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState<'all' | 'sample' | 'inspection' | 'shipment'>('all');

  const openIssueHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('carton_history')
      .select('id, action, created_at, changed_by_name, office_id, details')
      .order('created_at', { ascending: false })
      .limit(500);
    const rows = (data || []).filter((r: any) => {
      const d = (r.details || {}) as Record<string, any>;
      return !!d.issue_type;
    }) as typeof historyRows;
    setHistoryRows(rows);
    setHistoryLoading(false);
  };

  const officeNameById = (id: string) => offices.find(o => o.id === id)?.name || '—';


  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [o, c] = await Promise.all([
        supabase.from('offices').select('id, name, location').eq('is_active', true).order('name'),
        supabase.from('receives').select('office_id, receive_cartons(ctn_qty, pcs_per_ctn, location, rack), receive_issues(issue_type, total_ctn, total_pcs, destination, receive_issue_lines(ctn_qty, pcs_per_ctn, returned_ctn, returned_pcs, source_carton:receive_cartons!receive_issue_lines_source_carton_id_fkey(location, rack)))'),
      ]);
      setOffices((o.data as Office[]) || []);
      setRows(((c.data as unknown) as Row[]) || []);
    };
    load();
    const ch = supabase.channel('mgmt-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receives' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_cartons' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_issues' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offices' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'store_user') return <Navigate to="/stock" replace />;
  if (user.role === 'super_admin') return <Navigate to="/admin" replace />;

  const summary: Summary[] = offices.map(o => {
    const list = rows.filter(r => r.office_id === o.id);
    let recvCtn = 0, recvPcs = 0, shipCtn = 0, shipPcs = 0, sampleCtn = 0, samplePcs = 0, issuedCtn = 0, issuedPcs = 0;
    const recvLoc = new Map<string, { ctn: number; pcs: number }>();
    const issuedLoc = new Map<string, { ctn: number; pcs: number }>();
    // For shipment/sample: key by `${prevLabel}||${currentDest}` to show both columns
    const shipLoc = new Map<string, { ctn: number; pcs: number; prev: string; cur: string }>();
    const sampleLoc = new Map<string, { ctn: number; pcs: number; prev: string; cur: string }>();
    const labelOf = (loc?: string | null, rack?: string | null) => [(loc || '').trim(), (rack || '').trim()].filter(Boolean).join(' / ');
    const add = (m: Map<string, { ctn: number; pcs: number }>, label: string, ctn: number, pcs: number) => {
      if (!label) return;
      const cur = m.get(label) || { ctn: 0, pcs: 0 };
      cur.ctn += ctn; cur.pcs += pcs;
      m.set(label, cur);
    };
    const addPair = (m: Map<string, { ctn: number; pcs: number; prev: string; cur: string }>, prev: string, cur: string, ctn: number, pcs: number) => {
      const key = `${prev}||${cur}`;
      const entry = m.get(key) || { ctn: 0, pcs: 0, prev, cur };
      entry.ctn += ctn; entry.pcs += pcs;
      m.set(key, entry);
    };
    for (const r of list) {
      for (const c of (r.receive_cartons || [])) {
        const ctn = c.ctn_qty || 0;
        const pcs = ctn * (c.pcs_per_ctn || 0);
        recvCtn += ctn; recvPcs += pcs;
        add(recvLoc, labelOf(c.location, c.rack), ctn, pcs);
      }
      for (const i of (r.receive_issues || [])) {
        const ctn = i.total_ctn || 0, pcs = i.total_pcs || 0;
        issuedCtn += ctn; issuedPcs += pcs;
        if (i.issue_type === 'sample') { sampleCtn += ctn; samplePcs += pcs; }
        if (i.issue_type === 'shipment') { shipCtn += ctn; shipPcs += pcs; }
        const destLabel = (i.destination || '').trim() || '—';
        for (const ln of (i.receive_issue_lines || [])) {
          const netCtn = Math.max(0, (ln.ctn_qty || 0) - (ln.returned_ctn || 0));
          const netPcs = Math.max(0, (ln.ctn_qty || 0) * (ln.pcs_per_ctn || 0) - (ln.returned_pcs || 0));
          const lbl = labelOf(ln.source_carton?.location, ln.source_carton?.rack);
          add(issuedLoc, lbl, netCtn, netPcs);
          if (i.issue_type === 'sample') addPair(sampleLoc, lbl || '—', destLabel, netCtn, netPcs);
          if (i.issue_type === 'shipment') addPair(shipLoc, lbl || '—', destLabel, netCtn, netPcs);
        }
      }
    }
    const stockLoc = new Map<string, { ctn: number; pcs: number }>();
    for (const [label, v] of recvLoc) {
      const iss = issuedLoc.get(label) || { ctn: 0, pcs: 0 };
      const ctn = Math.max(0, v.ctn - iss.ctn);
      const pcs = Math.max(0, v.pcs - iss.pcs);
      if (ctn > 0 || pcs > 0) stockLoc.set(label, { ctn, pcs });
    }
    const toArr = (m: Map<string, { ctn: number; pcs: number }>): LocItem[] =>
      Array.from(m.entries()).map(([label, v]) => ({ label, ctn: v.ctn, pcs: v.pcs }))
        .filter(x => x.ctn > 0 || x.pcs > 0)
        .sort((a, b) => a.label.localeCompare(b.label));
    const toArrPair = (m: Map<string, { ctn: number; pcs: number; prev: string; cur: string }>): LocItem[] =>
      Array.from(m.values()).map(v => ({ label: v.prev, current: v.cur, ctn: v.ctn, pcs: v.pcs }))
        .filter(x => x.ctn > 0 || x.pcs > 0)
        .sort((a, b) => (a.label + (a.current || '')).localeCompare(b.label + (b.current || '')));
    return {
      id: o.id, name: o.name, location: o.location,
      recvCtn, recvPcs,
      stockCtn: recvCtn - issuedCtn, stockPcs: recvPcs - issuedPcs,
      shipmentCtn: shipCtn, shipmentPcs: shipPcs,
      sampleCtn, samplePcs,
      locByKey: { recv: toArr(recvLoc), stock: toArr(stockLoc), shipment: toArrPair(shipLoc), sample: toArrPair(sampleLoc) },
    };
  });


  const doExcel = () => {
    if (!user.can_excel) { toast.error('No excel permission'); return; }
    exportToExcel(summary.map(s => ({
      Office: s.name, Location: s.location,
      'Recv CTN': s.recvCtn, 'Recv Pcs': s.recvPcs,
      'Stock CTN': s.stockCtn, 'Stock Pcs': s.stockPcs,
      'Shipment CTN': s.shipmentCtn, 'Shipment Pcs': s.shipmentPcs,
      'Sample CTN': s.sampleCtn, 'Sample Pcs': s.samplePcs,
    })), `units-${new Date().toISOString().slice(0, 10)}`);
  };
  const totals = summary.reduce((acc, s) => ({
    recvCtn: acc.recvCtn + s.recvCtn,
    recvPcs: acc.recvPcs + s.recvPcs,
    stockCtn: acc.stockCtn + s.stockCtn,
    stockPcs: acc.stockPcs + s.stockPcs,
    shipmentCtn: acc.shipmentCtn + s.shipmentCtn,
    shipmentPcs: acc.shipmentPcs + s.shipmentPcs,
    sampleCtn: acc.sampleCtn + s.sampleCtn,
    samplePcs: acc.samplePcs + s.samplePcs,
  }), {
    recvCtn: 0, recvPcs: 0,
    stockCtn: 0, stockPcs: 0,
    shipmentCtn: 0, shipmentPcs: 0,
    sampleCtn: 0, samplePcs: 0,
  });

  const formatNumber = (n: number) => Number(n || 0).toLocaleString();
  const withAlpha = (color: string, alpha: number) => {
    const match = color.match(/^hsl\((.+)\)$/);
    return match ? `hsl(${match[1]} / ${alpha})` : color;
  };
  const metricValues = summary.flatMap(s => [s.recvCtn, s.recvPcs, s.stockCtn, s.stockPcs, s.shipmentCtn, s.shipmentPcs, s.sampleCtn, s.samplePcs]);
  const maxMetricDigits = Math.max(1, ...metricValues.map(v => formatNumber(v).length));
  const statTileMinWidth = Math.min(190, Math.max(98, maxMetricDigits * 13 + 38));
  const unitCardMinWidth = statTileMinWidth * 4 + 72;
  const topValues = [totals.recvCtn, totals.recvPcs, totals.stockCtn, totals.stockPcs, totals.shipmentCtn, totals.shipmentPcs, totals.sampleCtn, totals.samplePcs];
  const maxTopDigits = Math.max(1, ...topValues.map(v => formatNumber(v).length));
  const topCardMinWidth = Math.min(420, Math.max(260, maxTopDigits * 17 + 150));

  const doPrint = () => {
    if (!user.can_print) { toast.error('No print permission'); return; }
    const num = (n: number) => Number(n || 0).toLocaleString();
    const rowsHtml = summary.map((s, i) => `
      <tr>
        <td class="text-center muted">${i + 1}</td>
        <td><b>${s.name}</b>${s.location ? `<div class="sub">${s.location}</div>` : ''}</td>
        <td class="text-right text-recv"><b>${num(s.recvCtn)}</b><div class="sub">${num(s.recvPcs)} pcs</div></td>
        <td class="text-right text-stock"><b>${num(s.stockCtn)}</b><div class="sub">${num(s.stockPcs)} pcs</div></td>
        <td class="text-right text-ship"><b>${num(s.shipmentCtn)}</b><div class="sub">${num(s.shipmentPcs)} pcs</div></td>
        <td class="text-right text-sample"><b>${num(s.sampleCtn)}</b><div class="sub">${num(s.samplePcs)} pcs</div></td>
      </tr>`).join('');
    const body = `
      <style>
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 14px}
        .stile{border:1px solid #cfdcec;border-radius:8px;padding:10px 12px;background:#f8fbff}
        .stile .lbl{font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:#64748b;font-weight:700}
        .stile .val{font-size:18px;font-weight:800;color:#0b1e3a;margin-top:2px}
        .stile .vsub{font-size:10px;color:#475569;margin-top:1px}
        .stile.recv{border-color:#bae6fd;background:#f0f9ff}
        .stile.stock{border-color:#bbf7d0;background:#f0fdf4}
        .stile.ship{border-color:#fed7aa;background:#fff7ed}
        .stile.sample{border-color:#e9d5ff;background:#faf5ff}
        td .sub{font-size:9px;color:#64748b;font-weight:500;margin-top:1px}
        td.muted{color:#94a3b8;font-weight:600}
      </style>
      <div class="summary">
        <div class="stile recv"><div class="lbl">Total Received</div><div class="val">${num(totals.recvCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(totals.recvPcs)} pcs</div></div>
        <div class="stile stock"><div class="lbl">In Stock</div><div class="val">${num(totals.stockCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(totals.stockPcs)} pcs</div></div>
        <div class="stile ship"><div class="lbl">Shipment</div><div class="val">${num(totals.shipmentCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(totals.shipmentPcs)} pcs</div></div>
        <div class="stile sample"><div class="lbl">Sample + Insp.</div><div class="val">${num(totals.sampleCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(totals.samplePcs)} pcs</div></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:30px" class="text-center">#</th>
          <th>Unit / Office</th>
          <th class="text-right">Received</th>
          <th class="text-right">Stock</th>
          <th class="text-right">Shipment</th>
          <th class="text-right">Sample / Insp.</th>
        </tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center muted" style="padding:14px">No offices yet</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="2">Total · ${summary.length} units</td>
          <td class="text-right">${num(totals.recvCtn)} CTN / ${num(totals.recvPcs)} pcs</td>
          <td class="text-right">${num(totals.stockCtn)} CTN / ${num(totals.stockPcs)} pcs</td>
          <td class="text-right">${num(totals.shipmentCtn)} CTN / ${num(totals.shipmentPcs)} pcs</td>
          <td class="text-right">${num(totals.sampleCtn)} CTN / ${num(totals.samplePcs)} pcs</td>
        </tr></tfoot>
      </table>`;
    printHTML(body, 'Units & Offices', `All Units · ${summary.length} entries`);
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight">Units &amp; Offices</h2>
            <p className="text-sm text-muted-foreground">View all units and office details.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            
            {user.can_print && <Button variant="outline" size="sm" onClick={doPrint} className="hover:bg-primary hover:text-primary-foreground hover:border-primary"><Printer className="h-4 w-4 mr-1.5" />Print</Button>}
            {user.can_excel && <Button variant="outline" size="sm" onClick={doExcel}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>}
          </div>
        </div>

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${topCardMinWidth}px), 1fr))` }}
        >
          {[
            { key: 'recv' as const, label: 'Total Received Cartons', ctn: totals.recvCtn, pcs: totals.recvPcs, icon: Package, color: 'text-recv', border: isLight ? 'hsl(220 85% 42%)' : 'hsl(210 95% 68%)' },
            { key: 'stock' as const, label: 'Total Stock Cartons', ctn: totals.stockCtn, pcs: totals.stockPcs, icon: MapPin, color: 'text-stock', border: isLight ? 'hsl(160 80% 30%)' : 'hsl(160 75% 55%)' },
            { key: 'shipment' as const, label: 'Total Shipment Cartons', ctn: totals.shipmentCtn, pcs: totals.shipmentPcs, icon: Truck, color: 'text-ship', border: isLight ? 'hsl(28 95% 40%)' : 'hsl(28 95% 62%)' },
            { key: 'sample' as const, label: 'Total Sample Cartons', ctn: totals.sampleCtn, pcs: totals.samplePcs, icon: TestTube2, color: 'text-sample', border: isLight ? 'hsl(280 70% 42%)' : 'hsl(280 75% 70%)' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => setDetail({ key: item.key, label: item.label, color: item.color, border: item.border, icon: item.icon })}
                style={{ border: `1px solid ${item.border}` }}
                className="group min-w-0 bg-card rounded-[2rem] p-5 text-left shadow-lg shadow-black/10 transition professional-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-semibold tracking-tight text-muted-foreground">{item.label}</p>
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-background/70 text-muted-foreground transition group-hover:bg-primary/15 group-hover:text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-6 flex min-w-0 items-end gap-3">
                  <p
                    className={`font-semibold tabular-nums whitespace-nowrap ${item.color}`}
                    style={{ fontSize: 'clamp(1.85rem, 5cqw, 2.25rem)' }}
                  >{formatNumber(item.ctn)}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">CTN</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground tabular-nums whitespace-nowrap">{formatNumber(item.pcs)} pcs</p>
                <p className="mt-5 text-[11px] tracking-tight text-primary">Click for details →</p>
              </button>
            );
          })}
        </div>


        <div
          id="units-grid"
          className="grid gap-4 grid-cols-1 md:grid-cols-2"
        >
          {summary.length === 0 && (
            <div className="col-span-full text-center py-10 text-muted-foreground bg-card border border-border rounded-xl">No offices yet</div>
          )}
          {summary.map(s => (
            <button key={s.id} onClick={() => navigate(`/office/${s.id}`)}
              className="group min-w-0 bg-card rounded-[2rem] p-5 text-left shadow-lg shadow-black/10 transition professional-hover border-2 border-primary hover:shadow-primary/30">
              <div className="flex items-center gap-3 mb-5 min-w-0">
                <img src={logo} alt="MNR" className="h-12 w-12 rounded-full object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold tracking-tight text-foreground truncate capitalize group-hover:text-primary transition">{s.name}</p>
                  {s.location && (
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {s.location}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Recv', v: s.recvCtn, p: s.recvPcs, c: 'text-recv', b: 'stat-card-recv' },
                  { l: 'Stock', v: s.stockCtn, p: s.stockPcs, c: 'text-stock', b: 'stat-card-stock' },
                  { l: 'Ship', v: s.shipmentCtn, p: s.shipmentPcs, c: 'text-ship', b: 'stat-card-ship' },
                  { l: 'Sample', v: s.sampleCtn, p: s.samplePcs, c: 'text-sample', b: 'stat-card-sample' },
                ].map(x => (
                  <div key={x.l} className={`bg-muted/40 rounded-lg p-2 min-w-0 ${x.b}`}>
                    <p className="text-[11px] font-semibold tracking-tight text-muted-foreground uppercase">{x.l}</p>
                    <div className="mt-2 flex min-w-0 items-end gap-2">
                      <p
                        className={`font-semibold tabular-nums whitespace-nowrap ${x.c}`}
                        style={{ fontSize: 'clamp(1.2rem, 3cqw, 1.75rem)' }}
                      >{formatNumber(x.v)}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">CTN</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums whitespace-nowrap">{formatNumber(x.p)} pcs</p>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-[11px] tracking-tight text-primary">View buyers →</p>
            </button>
          ))}

        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl p-0 overflow-hidden bg-card text-foreground">
          {detail && (() => {
            const totalCtn = summary.reduce((a, s) => a + ({ recv: s.recvCtn, stock: s.stockCtn, shipment: s.shipmentCtn, sample: s.sampleCtn })[detail.key], 0);
            const totalPcs = summary.reduce((a, s) => a + ({ recv: s.recvPcs, stock: s.stockPcs, shipment: s.shipmentPcs, sample: s.samplePcs })[detail.key], 0);
            const showTwoLoc = detail.key === 'shipment' || detail.key === 'sample';
            const tintSubtle = withAlpha(detail.border, isLight ? 0.08 : 0.14);
            const tintSoft = withAlpha(detail.border, isLight ? 0.12 : 0.2);
            const tintBadge = withAlpha(detail.border, isLight ? 0.16 : 0.28);
            const tintStrong = withAlpha(detail.border, isLight ? 0.18 : 0.34);
            return (
              <>
                <div
                  className="px-4 sm:px-6 py-4 sm:py-5 border-b bg-card text-foreground"
                  style={{ background: `linear-gradient(135deg, ${tintSoft}, hsl(var(--card)))`, borderColor: detail.border }}
                >
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 pr-10">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: tintBadge, color: detail.border }}>
                        <detail.icon className="h-5 w-5" />
                      </span>
                      <div className="flex flex-col items-start flex-1 min-w-0">
                        <span className="text-base md:text-lg font-bold tracking-tight truncate" style={{ color: detail.border }}>{detail.label}</span>
                        <span className="text-xs font-medium text-foreground/80">Breakdown by Unit / Office</span>
                      </div>
                      {user.can_print && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const num = (n: number) => Number(n || 0).toLocaleString();
                            const accent = detail.border;
                            const filtered = summary.filter(s => {
                              const m = { recv: [s.recvCtn, s.recvPcs], stock: [s.stockCtn, s.stockPcs], shipment: [s.shipmentCtn, s.shipmentPcs], sample: [s.samplePcs, s.samplePcs] }[detail.key];
                              return (m[0] || 0) > 0 || (m[1] || 0) > 0;
                            });
                            const bodyRows = filtered.map((s, i) => {
                              const map = { recv: [s.recvCtn, s.recvPcs], stock: [s.stockCtn, s.stockPcs], shipment: [s.shipmentCtn, s.shipmentPcs], sample: [s.sampleCtn, s.samplePcs] }[detail.key];
                              const locs = s.locByKey[detail.key];
                              const rs = Math.max(locs.length, 1) + 1;
                              if (locs.length === 0) {
                                return `<tr>
                                  <td class="text-center">${i + 1}</td>
                                  <td><b>${s.name}</b></td>
                                  <td class="muted text-center">—</td>
                                  ${showTwoLoc ? '<td class="muted text-center">—</td>' : ''}
                                  <td class="text-right accent"><b>${num(map[0])}</b></td>
                                  <td class="text-right"><b>${num(map[1])}</b></td>
                                </tr>`;
                              }
                              const rows = locs.map((l, idx) => `
                                <tr>
                                  ${idx === 0 ? `<td class="text-center idx" rowspan="${rs}">${i + 1}</td><td class="name" rowspan="${rs}"><b>${s.name}</b></td>` : ''}
                                  <td><span class="badge">${l.label || '—'}</span></td>
                                  ${showTwoLoc ? `<td><span class="badge gray">${l.current || '—'}</span></td>` : ''}
                                  <td class="text-right accent"><b>${num(l.ctn)}</b></td>
                                  <td class="text-right"><b>${num(l.pcs)}</b></td>
                                </tr>`).join('');
                              const sub = `<tr class="subtotal">
                                <td class="text-right" colspan="${showTwoLoc ? 2 : 1}">Total</td>
                                <td class="text-right accent"><b>${num(map[0])}</b></td>
                                <td class="text-right"><b>${num(map[1])}</b></td>
                              </tr>`;
                              return rows + sub;
                            }).join('');
                            const body = `
                              <style>
                                .acc{background:${withAlpha(accent, 0.12)};border-left:6px solid ${accent};border-radius:10px;padding:10px 14px;margin-bottom:12px}
                                .acc .t{font-size:18px;font-weight:800;color:${accent};letter-spacing:.3px}
                                .acc .s{font-size:11px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.8px;margin-top:2px}
                                .kpi{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
                                .kpi .k{border:2px solid ${accent};border-radius:10px;padding:10px 14px;background:${withAlpha(accent, 0.05)}}
                                .kpi .k .lbl{font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
                                .kpi .k .val{font-size:22px;font-weight:800;color:${accent};margin-top:2px;font-variant-numeric:tabular-nums}
                                table{border-collapse:collapse;width:100%;font-size:12px}
                                th{background:${withAlpha(accent, 0.18)};color:${accent};font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.6px;padding:8px;border:1px solid ${accent}}
                                td{padding:7px 8px;border:1px solid ${withAlpha(accent, 0.45)};vertical-align:middle}
                                td.idx,td.name{background:${withAlpha(accent, 0.06)};text-align:center}
                                td.name{text-align:left}
                                tr.subtotal td{background:${withAlpha(accent, 0.1)};font-weight:700;color:${accent}}
                                tfoot td{background:${withAlpha(accent, 0.22)};font-weight:800;color:${accent};border:1px solid ${accent}}
                                .accent{color:${accent}}
                                .muted{color:#94a3b8}
                                .text-right{text-align:right}.text-center{text-align:center}
                                .badge{display:inline;color:${accent};font-weight:700;font-size:11px;background:transparent;padding:0;border-radius:0}
                                .badge.gray{background:transparent;color:#334155}
                              </style>
                              <div class="acc">
                                <div class="t">${detail.label}</div>
                                <div class="s">${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} · Live snapshot</div>
                              </div>
                              <div class="kpi" style="grid-template-columns:repeat(4,1fr)">
                                <div class="k"><div class="lbl">Units</div><div class="val">${num(filtered.length)}</div></div>
                                <div class="k"><div class="lbl">Locations</div><div class="val">${num(filtered.reduce((a, s) => a + s.locByKey[detail.key].length, 0))}</div></div>
                                <div class="k"><div class="lbl">Total CTN</div><div class="val">${num(totalCtn)}</div></div>
                                <div class="k"><div class="lbl">Total Pcs</div><div class="val">${num(totalPcs)}</div></div>
                              </div>
                              <table>
                                <thead><tr>
                                  <th style="width:36px">#</th>
                                  <th>Unit / Office</th>
                                  <th>${showTwoLoc ? 'Previous Location' : 'Location'}</th>
                                  ${showTwoLoc ? '<th>Current Location</th>' : ''}
                                  <th class="text-right" style="width:90px">CTN</th>
                                  <th class="text-right" style="width:110px">Pcs</th>
                                </tr></thead>
                                <tbody>${bodyRows || `<tr><td colspan="${showTwoLoc ? 6 : 5}" class="text-center muted" style="padding:18px">No data</td></tr>`}</tbody>
                                <tfoot><tr>
                                  <td colspan="${showTwoLoc ? 4 : 3}">Grand Total · ${filtered.length} units</td>
                                  <td class="text-right">${num(totalCtn)}</td>
                                  <td class="text-right">${num(totalPcs)}</td>
                                </tr></tfoot>
                              </table>`;
                            printHTML(body, detail.label, `MNR Group · ${filtered.length} unit${filtered.length === 1 ? '' : 's'} · ${num(totalCtn)} CTN · ${num(totalPcs)} Pcs`);
                          }}
                          style={{ borderColor: detail.border, color: detail.border }}
                          className="ml-auto mr-8 h-8 px-3 bg-background hover:bg-background/80"
                        >
                          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
                        </Button>
                      )}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-background px-3 py-2 text-foreground" style={{ borderColor: detail.border }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/75">Total CTN</p>
                      <p className="text-xl font-extrabold tabular-nums" style={{ color: detail.border }}>{totalCtn.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2 text-foreground" style={{ borderColor: detail.border }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/75">Total Pcs</p>
                      <p className="text-xl font-extrabold tabular-nums text-foreground">{totalPcs.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                <div className="max-h-[65vh] overflow-auto px-2 sm:px-4 py-3 sm:py-4 bg-background text-foreground">
                  {/* Mobile card layout */}
                  <div className="sm:hidden space-y-3">
                    {summary.filter(s => {
                      const m = { recv: [s.recvCtn, s.recvPcs], stock: [s.stockCtn, s.stockPcs], shipment: [s.shipmentCtn, s.shipmentPcs], sample: [s.sampleCtn, s.samplePcs] }[detail.key];
                      return (m[0] || 0) > 0 || (m[1] || 0) > 0;
                    }).map((s, i) => {
                      const map = { recv: [s.recvCtn, s.recvPcs], stock: [s.stockCtn, s.stockPcs], shipment: [s.shipmentCtn, s.shipmentPcs], sample: [s.sampleCtn, s.samplePcs] }[detail.key];
                      const locs = s.locByKey[detail.key];
                      return (
                        <div key={s.id} className="rounded-lg border-2 bg-card text-foreground overflow-hidden" style={{ borderColor: detail.border }}>
                          <div
                            className="flex items-center justify-between px-3 py-2 cursor-pointer"
                            style={{ background: tintSubtle }}
                            onClick={() => { setDetail(null); navigate(`/office/${s.id}`); }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-bold text-foreground/70">#{i + 1}</span>
                              <span className="font-bold text-sm truncate" style={{ color: detail.border }}>{s.name}</span>
                            </div>
                          </div>
                          <div className="divide-y" style={{ borderColor: detail.border }}>
                            {locs.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-foreground/70 text-center">No location data</div>
                            ) : locs.map((l, idx) => (
                              <div key={idx} className="px-3 py-2 text-[11px] border-t-2" style={{ borderTopColor: detail.border }}>

                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-[10px]" style={{ color: detail.border }}>{l.label || '—'}</span>
                                  {showTwoLoc && (
                                    <>
                                      <span className="text-foreground/70">→</span>
                                      <span className="font-semibold text-[10px] text-foreground">{l.current || '—'}</span>
                                    </>
                                  )}
                                </div>
                                <div className="flex justify-between gap-2 tabular-nums">
                                  <span><span className="text-foreground/75">CTN:</span> <span className="font-bold" style={{ color: detail.border }}>{l.ctn.toLocaleString()}</span></span>
                                  <span><span className="text-foreground/75">Pcs:</span> <span className="font-bold text-foreground">{l.pcs.toLocaleString()}</span></span>
                                </div>
                              </div>
                            ))}
                            <div className="px-3 py-2 flex justify-between items-center text-[11px] font-bold tabular-nums" style={{ background: tintSoft }}>
                              <span className="uppercase tracking-tight" style={{ color: detail.border }}>Total</span>
                              <span className="flex gap-3">
                                <span style={{ color: detail.border }}>{map[0].toLocaleString()} CTN</span>
                                <span className="text-foreground">{map[1].toLocaleString()} Pcs</span>
                              </span>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop / tablet table */}
                  <table className="hidden sm:table w-full min-w-[640px] text-xs sm:text-sm border-collapse border rounded-lg overflow-hidden bg-card text-foreground" style={{ borderColor: detail.border }}>
                    <thead className="sticky top-0" style={{ background: tintSoft }}>
                      <tr className="text-[11px] tracking-tight uppercase" style={{ color: detail.border }}>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>#</th>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>Unit / Office</th>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>{showTwoLoc ? 'Previous Location' : 'Location'}</th>
                        {showTwoLoc && <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>Current Location</th>}
                        <th className="px-3 py-2 text-right border" style={{ borderColor: detail.border }}>CTN</th>
                        <th className="px-3 py-2 text-right border" style={{ borderColor: detail.border }}>Pcs</th>
                      </tr>
                    </thead>

                    <tbody>
                      {summary.filter(s => {
                        const m = { recv: [s.recvCtn, s.recvPcs], stock: [s.stockCtn, s.stockPcs], shipment: [s.shipmentCtn, s.shipmentPcs], sample: [s.sampleCtn, s.samplePcs] }[detail.key];
                        return (m[0] || 0) > 0 || (m[1] || 0) > 0;
                      }).map((s, i) => {
                        const map = { recv: [s.recvCtn, s.recvPcs], stock: [s.stockCtn, s.stockPcs], shipment: [s.shipmentCtn, s.shipmentPcs], sample: [s.sampleCtn, s.samplePcs] }[detail.key];
                        const locs = s.locByKey[detail.key];
                        const totalCtnOffice = map[0];

                        const totalPcsOffice = map[1];
                        const rowSpanCount = Math.max(locs.length, 1) + 1;
                        const emptyColSpanForTotal = showTwoLoc ? 2 : 1;
                        return (
                          <Fragment key={s.id}>
                            {locs.length === 0 ? (
                              <tr className="hover:opacity-90 cursor-pointer transition" style={{ background: tintSubtle }} onClick={() => { setDetail(null); navigate(`/office/${s.id}`); }}>
                                <td className="px-3 py-2 border text-foreground tabular-nums text-center" style={{ borderColor: detail.border }}>{i + 1}</td>
                                <td className="px-3 py-2 border font-semibold text-center text-foreground" style={{ borderColor: detail.border }}>{s.name}</td>
                                <td className="px-3 py-2 border text-xs text-foreground/70 text-center" style={{ borderColor: detail.border }}>—</td>
                                {showTwoLoc && <td className="px-3 py-2 border text-xs text-foreground/70 text-center" style={{ borderColor: detail.border }}>—</td>}
                                <td className="px-3 py-2 border text-right font-bold tabular-nums" style={{ borderColor: detail.border, color: detail.border }}>{totalCtnOffice.toLocaleString()}</td>
                                <td className="px-3 py-2 border text-right font-bold text-foreground tabular-nums" style={{ borderColor: detail.border }}>{totalPcsOffice.toLocaleString()}</td>
                              </tr>
                            ) : (
                              <>
                                {locs.map((l, idx) => (
                                  <tr key={s.id + l.label + (l.current || '') + idx} className="bg-card hover:opacity-95">

                                    {idx === 0 && (
                                      <>
                                        <td className="px-3 py-2 border text-foreground tabular-nums text-center align-middle cursor-pointer" style={{ borderColor: detail.border }} rowSpan={rowSpanCount} onClick={() => { setDetail(null); navigate(`/office/${s.id}`); }}>{i + 1}</td>
                                        <td className="px-3 py-2 border font-semibold text-center align-middle cursor-pointer text-foreground" style={{ borderColor: detail.border, background: tintSubtle }} rowSpan={rowSpanCount} onClick={() => { setDetail(null); navigate(`/office/${s.id}`); }}>{s.name}</td>

                                      </>
                                    )}
                                    <td className="px-3 py-2 border text-xs" style={{ borderColor: detail.border }}>
                                      <span className="font-semibold text-[11px]" style={{ color: detail.border }}>{l.label || '—'}</span>
                                    </td>
                                    {showTwoLoc && (
                                      <td className="px-3 py-2 border text-xs" style={{ borderColor: detail.border }}>
                                        <span className="font-semibold text-[11px] text-foreground">{l.current || '—'}</span>
                                      </td>
                                    )}
                                    <td className="px-3 py-2 border text-right text-sm font-bold tabular-nums" style={{ borderColor: detail.border, color: detail.border }}>{l.ctn.toLocaleString()}</td>
                                    <td className="px-3 py-2 border text-right text-sm font-semibold tabular-nums text-foreground" style={{ borderColor: detail.border }}>{l.pcs.toLocaleString()}</td>
                                  </tr>
                                ))}
                                <tr className="font-bold" style={{ background: tintSoft }}>
                                  <td className="px-3 py-2 border text-right text-xs uppercase tracking-tight" colSpan={emptyColSpanForTotal} style={{ borderColor: detail.border, color: detail.border }}>Total</td>
                                  <td className="px-3 py-2 border text-right text-sm tabular-nums" style={{ borderColor: detail.border, color: detail.border }}>{totalCtnOffice.toLocaleString()}</td>
                                  <td className="px-3 py-2 border text-right text-sm tabular-nums text-foreground" style={{ borderColor: detail.border }}>{totalPcsOffice.toLocaleString()}</td>
                                </tr>

                              </>
                            )}
                          </Fragment>
                        );
                      })}

                    </tbody>
                    <tfoot className="font-semibold" style={{ background: tintStrong }}>
                      <tr>
                        <td className="px-3 py-2 border text-foreground" colSpan={showTwoLoc ? 4 : 3} style={{ borderColor: detail.border }}>Total ({summary.length} units)</td>
                        <td className="px-3 py-2 border text-right tabular-nums" style={{ borderColor: detail.border, color: detail.border }}>{totalCtn.toLocaleString()}</td>
                        <td className="px-3 py-2 border text-right tabular-nums text-foreground" style={{ borderColor: detail.border }}>{totalPcs.toLocaleString()}</td>
                      </tr>

                    </tfoot>
                  </table>
                </div>

              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-4xl lg:max-w-6xl p-0 overflow-hidden bg-card text-foreground">
          <div className="px-4 sm:px-6 py-4 border-b bg-card">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-10 text-base md:text-lg">
                <History className="h-5 w-5 text-primary" />
                Issue History — All Units / Offices
              </DialogTitle>
            </DialogHeader>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search buyer, SI, PO, style, receiver, destination, user…" className="pl-8 h-9" />
                {historySearch && (
                  <button onClick={() => setHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                )}
              </div>
              <div className="flex gap-1">
                {(['all','sample','inspection','shipment'] as const).map(t => (
                  <Button key={t} size="sm" variant={historyType === t ? 'default' : 'outline'} className="h-9 capitalize" onClick={() => setHistoryType(t)}>{t}</Button>
                ))}
              </div>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto p-3 sm:p-4 space-y-2">
            {historyLoading && <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>}
            {!historyLoading && historyRows.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No issue history found.</p>}
            {!historyLoading && (() => {
              const q = historySearch.trim().toLowerCase();
              const filtered = historyRows.filter(r => {
                const d = r.details || {};
                if (historyType !== 'all' && d.issue_type !== historyType) return false;
                if (!q) return true;
                const hay = [d.buyer, d.si_no, d.po_no, d.style_no, d.receiver_name, d.destination, d.unit_office, d.department, r.changed_by_name, officeNameById(r.office_id)]
                  .filter(Boolean).join(' ').toLowerCase();
                return hay.includes(q);
              });
              if (filtered.length === 0) return <p className="text-center text-sm text-muted-foreground py-8">No matching entries.</p>;
              const typeColor = (t: string) => t === 'sample' ? 'hsl(280 65% 55%)' : t === 'inspection' ? 'hsl(200 80% 50%)' : t === 'shipment' ? 'hsl(28 95% 48%)' : 'hsl(var(--primary))';
              const actionColor = (a: string) => a === 'issued' ? 'hsl(var(--primary))' : a === 'returned' ? 'hsl(var(--success))' : a === 'deleted' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))';
              return filtered.map(r => {
                const d = r.details || {};
                const t = String(d.issue_type || '');
                const border = typeColor(t);
                const dt = new Date(r.created_at);
                const stamp = dt.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                return (
                  <div key={r.id} className="rounded-lg p-3 bg-muted/30" style={{ border: `2px solid ${border}` }}>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: border, color: '#fff' }}>{t}</span>
                      <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded border" style={{ color: actionColor(r.action), borderColor: actionColor(r.action) }}>{r.action}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">{stamp}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">Office:</span> <span className="font-medium">{officeNameById(r.office_id)}</span></div>
                      <div><span className="text-muted-foreground">Buyer:</span> <span className="font-medium">{d.buyer || '—'}</span></div>
                      <div><span className="text-muted-foreground">SI:</span> <span className="font-medium">{d.si_no || '—'}</span></div>
                      <div><span className="text-muted-foreground">PO:</span> <span className="font-medium">{d.po_no || '—'}</span></div>
                      <div><span className="text-muted-foreground">Style:</span> <span className="font-medium">{d.style_no || '—'}</span></div>
                      <div><span className="text-muted-foreground">CTN / Pcs:</span> <span className="font-semibold tabular-nums">{d.total_ctn ?? 0} / {d.total_pcs ?? 0}</span></div>
                      {d.returned_ctn != null && <div><span className="text-muted-foreground">Returned:</span> <span className="font-semibold tabular-nums">{d.returned_ctn || 0} / {d.returned_pcs || 0}</span></div>}
                      {d.receiver_name && <div><span className="text-muted-foreground">Receiver:</span> <span className="font-medium">{d.receiver_name}</span></div>}
                      {d.destination && <div><span className="text-muted-foreground">Destination:</span> <span className="font-medium">{d.destination}</span></div>}
                      {d.department && <div><span className="text-muted-foreground">Dept:</span> <span className="font-medium">{d.department}</span></div>}
                      {d.unit_office && <div><span className="text-muted-foreground">Unit/Office:</span> <span className="font-medium">{d.unit_office}</span></div>}
                      <div><span className="text-muted-foreground">By:</span> <span className="font-medium">{r.changed_by_name || '—'}</span></div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
};


export default ManagementDashboard;
