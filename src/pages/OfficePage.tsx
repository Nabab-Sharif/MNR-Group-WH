import { Fragment, useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Plus, Pencil, Trash2, FileSpreadsheet, Printer, Search, ArrowLeft } from 'lucide-react';

import { toast } from 'sonner';
import { exportToExcel, printHTML } from '@/lib/exportExcel';
import { softDelete } from '@/lib/recycleBin';

interface ReceiveRow {
  id: string; buyer: string | null; si_no: string | null;
  updated_at?: string; created_at?: string;
  receive_cartons: { id: string; ctn_qty: number; pcs_per_ctn: number; location: string | null; rack: string | null; created_at?: string }[];
  receive_issues: { issue_type: 'sample' | 'inspection' | 'shipment'; total_ctn: number; total_pcs: number; destination?: string | null; port?: string | null; created_at?: string; receive_issue_lines?: { source_carton_id: string | null; ctn_qty: number; pcs_per_ctn: number; returned_ctn: number; returned_pcs: number }[] }[];
}

type LocItem = { label: string; current?: string; ctn: number; pcs: number };

interface BuyerSummary {
  name: string;
  recvCtn: number; recvPcs: number;
  stockCtn: number; stockPcs: number;
  shipmentCtn: number; shipmentPcs: number;
  sampleCtn: number; samplePcs: number;
  locByKey: { recv: LocItem[]; stock: LocItem[]; shipment: LocItem[]; sample: LocItem[] };
  lastActivity: number;
}


const OfficePage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const navigate = useNavigate();
  const { officeId = '' } = useParams();
  const [officeName, setOfficeName] = useState('');
  const [rows, setRows] = useState<ReceiveRow[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingOld, setEditingOld] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [detail, setDetail] = useState<null | { key: 'recv' | 'stock' | 'shipment' | 'sample'; label: string; color: string; border: string }>(null);


  const load = async () => {
    const { data } = await supabase
      .from('receives')
      .select('id, buyer, si_no, updated_at, created_at, receive_cartons(id, ctn_qty, pcs_per_ctn, location, rack, created_at), receive_issues(issue_type, total_ctn, total_pcs, destination, port, created_at, receive_issue_lines(source_carton_id, ctn_qty, pcs_per_ctn, returned_ctn, returned_pcs))')
      .eq('office_id', officeId);
    setRows(((data as unknown) as ReceiveRow[]) || []);
  };


  useEffect(() => {
    if (!officeId) return;
    supabase.from('offices').select('name').eq('id', officeId).maybeSingle().then(({ data }) => setOfficeName(data?.name || ''));
    load();
    const ch = supabase.channel(`office-${officeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receives', filter: `office_id=eq.${officeId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_cartons' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_issues' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [officeId]);

  if (!user) return <Navigate to="/login" replace />;

  const canManage = user.role === 'super_admin' || user.role === 'admin' ||
    (user.role === 'store_user' && user.office_id === officeId);

  const buyers: BuyerSummary[] = useMemo(() => {
    const map = new Map<string, BuyerSummary>();
    // per-buyer accumulators for locations
    const locAcc = new Map<string, { recv: Map<string, LocItem>; stock: Map<string, LocItem>; shipment: Map<string, LocItem>; sample: Map<string, LocItem> }>();
    const ensureLoc = (name: string) => {
      if (!locAcc.has(name)) locAcc.set(name, { recv: new Map(), stock: new Map(), shipment: new Map(), sample: new Map() });
      return locAcc.get(name)!;
    };
    const labelOf = (loc?: string | null, rack?: string | null) => {
      const l = (loc || '').trim(); const r = (rack || '').trim();
      if (l && r) return `${l} · ${r}`;
      return l || r || 'Unassigned';
    };
    const addLoc = (m: Map<string, LocItem>, label: string, ctn: number, pcs: number, current?: string) => {
      const key = current !== undefined ? `${label}__${current}` : label;
      const cur = m.get(key) || { label, current, ctn: 0, pcs: 0 };
      cur.ctn += ctn; cur.pcs += pcs;
      m.set(key, cur);
    };


    for (const r of rows) {
      const name = (r.buyer || 'Unassigned').trim() || 'Unassigned';
      if (!map.has(name)) map.set(name, {
        name, recvCtn: 0, recvPcs: 0, stockCtn: 0, stockPcs: 0,
        shipmentCtn: 0, shipmentPcs: 0, sampleCtn: 0, samplePcs: 0,
        locByKey: { recv: [], stock: [], shipment: [], sample: [] },
        lastActivity: 0,
      });
      const b = map.get(name)!;
      const la = ensureLoc(name);

      // carton lookup for issue line origin
      const cartonById = new Map<string, { label: string; ctn: number; pcs: number; pcs_per_ctn: number }>();
      const recvByLabel = new Map<string, { ctn: number; pcs: number }>();
      for (const c of (r.receive_cartons || [])) {
        const label = labelOf(c.location, c.rack);
        const ctn = c.ctn_qty || 0;
        const pcs = ctn * (c.pcs_per_ctn || 0);
        cartonById.set(c.id, { label, ctn, pcs, pcs_per_ctn: c.pcs_per_ctn || 0 });
        const cur = recvByLabel.get(label) || { ctn: 0, pcs: 0 };
        cur.ctn += ctn; cur.pcs += pcs;
        recvByLabel.set(label, cur);
        addLoc(la.recv, label, ctn, pcs);
      }
      const recvCtn = (r.receive_cartons || []).reduce((a, c) => a + (c.ctn_qty || 0), 0);
      const recvPcs = (r.receive_cartons || []).reduce((a, c) => a + (c.ctn_qty || 0) * (c.pcs_per_ctn || 0), 0);
      b.recvCtn += recvCtn; b.recvPcs += recvPcs;

      const issuedByLabel = new Map<string, { ctn: number; pcs: number }>();
      let issuedCtn = 0, issuedPcs = 0;
      for (const i of (r.receive_issues || [])) {
        const ctn = i.total_ctn || 0, pcs = i.total_pcs || 0;
        issuedCtn += ctn; issuedPcs += pcs;
        if (i.issue_type === 'sample') { b.sampleCtn += ctn; b.samplePcs += pcs; }
        if (i.issue_type === 'shipment') { b.shipmentCtn += ctn; b.shipmentPcs += pcs; }
        for (const ln of (i.receive_issue_lines || [])) {
          const src = ln.source_carton_id ? cartonById.get(ln.source_carton_id) : null;
          const label = src?.label || 'Unassigned';
          const remCtn = Math.max((ln.ctn_qty || 0) - (ln.returned_ctn || 0), 0);
          const remPcs = Math.max((ln.ctn_qty || 0) * (ln.pcs_per_ctn || 0) - (ln.returned_pcs || 0), 0);
          if (remCtn === 0 && remPcs === 0) continue;
          const dest = (((i.destination || i.port) || '—').toString().trim() || '—');
          if (i.issue_type === 'sample') addLoc(la.sample, label, remCtn, remPcs, dest);
          if (i.issue_type === 'shipment') addLoc(la.shipment, label, remCtn, remPcs, dest);

          const cur = issuedByLabel.get(label) || { ctn: 0, pcs: 0 };
          cur.ctn += remCtn; cur.pcs += remPcs;
          issuedByLabel.set(label, cur);
        }
        if (i.created_at) b.lastActivity = Math.max(b.lastActivity, new Date(i.created_at).getTime());
      }

      // stock per location = recv - issued
      for (const [label, v] of recvByLabel) {
        const used = issuedByLabel.get(label) || { ctn: 0, pcs: 0 };
        const sCtn = Math.max(v.ctn - used.ctn, 0);
        const sPcs = Math.max(v.pcs - used.pcs, 0);
        if (sCtn > 0 || sPcs > 0) addLoc(la.stock, label, sCtn, sPcs);
      }

      b.stockCtn += Math.max(recvCtn - issuedCtn, 0);
      b.stockPcs += Math.max(recvPcs - issuedPcs, 0);
      const rTime = new Date(r.updated_at || r.created_at || 0).getTime();
      if (rTime) b.lastActivity = Math.max(b.lastActivity, rTime);
      for (const c of (r.receive_cartons || [])) {
        if (c.created_at) b.lastActivity = Math.max(b.lastActivity, new Date(c.created_at).getTime());
      }
    }

    // commit location maps to buyers
    for (const [name, acc] of locAcc) {
      const b = map.get(name); if (!b) continue;
      const toArr = (m: Map<string, LocItem>) => Array.from(m.values()).sort((a, c) => a.label.localeCompare(c.label));
      b.locByKey = { recv: toArr(acc.recv), stock: toArr(acc.stock), shipment: toArr(acc.shipment), sample: toArr(acc.sample) };
    }

    return Array.from(map.values())
      .sort((a, b) => b.lastActivity - a.lastActivity || a.name.localeCompare(b.name))
      .filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()));
  }, [rows, search]);


  const grand = buyers.reduce((a, b) => ({
    recvCtn: a.recvCtn + b.recvCtn, recvPcs: a.recvPcs + b.recvPcs,
    stockCtn: a.stockCtn + b.stockCtn, stockPcs: a.stockPcs + b.stockPcs,
    shipmentCtn: a.shipmentCtn + b.shipmentCtn, shipmentPcs: a.shipmentPcs + b.shipmentPcs,
    sampleCtn: a.sampleCtn + b.sampleCtn, samplePcs: a.samplePcs + b.samplePcs,
  }), { recvCtn: 0, recvPcs: 0, stockCtn: 0, stockPcs: 0, shipmentCtn: 0, shipmentPcs: 0, sampleCtn: 0, samplePcs: 0 });

  const tiles = [
    { key: 'recv' as const, label: 'Total Recv CTN', ctn: grand.recvCtn, pcs: grand.recvPcs, ring: 'stat-card-recv', color: 'text-recv', border: isLight ? 'hsl(220 85% 42%)' : 'hsl(210 95% 68%)' },
    { key: 'stock' as const, label: 'Total Stock CTN', ctn: grand.stockCtn, pcs: grand.stockPcs, ring: 'stat-card-stock', color: 'text-stock', border: isLight ? 'hsl(160 80% 30%)' : 'hsl(160 75% 55%)' },
    { key: 'shipment' as const, label: 'Total Shipment CTN', ctn: grand.shipmentCtn, pcs: grand.shipmentPcs, ring: 'stat-card-ship', color: 'text-ship', border: isLight ? 'hsl(28 95% 40%)' : 'hsl(28 95% 62%)' },
    { key: 'sample' as const, label: 'Total Sample CTN', ctn: grand.sampleCtn, pcs: grand.samplePcs, ring: 'stat-card-sample', color: 'text-sample', border: isLight ? 'hsl(280 70% 42%)' : 'hsl(280 75% 70%)' },
  ];


  const fmt = (n: number) => Number(n || 0).toLocaleString();
  const withAlpha = (color: string, alpha: number) => {
    const match = color.match(/^hsl\((.+)\)$/);
    return match ? `hsl(${match[1]} / ${alpha})` : color;
  };
  const buyerMetricVals = buyers.flatMap(b => [b.recvCtn, b.recvPcs, b.stockCtn, b.stockPcs, b.shipmentCtn, b.shipmentPcs, b.sampleCtn, b.samplePcs]);
  const maxBuyerDigits = Math.max(1, ...buyerMetricVals.map(v => fmt(v).length));
  const buyerTileMinWidth = Math.min(190, Math.max(82, maxBuyerDigits * 12 + 32));
  const buyerCardMinWidth = buyerTileMinWidth * 4 + 64;


  const openAdd = () => {
    if (!canManage || !user.can_add) { toast.error('No add permission'); return; }
    setEditingOld(null); setBuyerName(''); setOpen(true);
  };
  const openRename = (name: string) => {
    if (!canManage || !user.can_edit) { toast.error('No edit permission'); return; }
    if (name === 'Unassigned') { toast.error('Cannot rename Unassigned'); return; }
    setEditingOld(name); setBuyerName(name); setOpen(true);
  };
  const save = async () => {
    const n = buyerName.trim();
    if (!n) { toast.error('Buyer name required'); return; }
    if (editingOld) {
      const { error } = await supabase.from('receives').update({ buyer: n }).eq('office_id', officeId).eq('buyer', editingOld);
      if (error) { toast.error(error.message); return; }
      toast.success('Buyer renamed');
    } else {
      const { error } = await supabase.from('receives').insert({
        office_id: officeId, buyer: n, si_no: '__PLACEHOLDER__',
        entry_date: new Date().toISOString().slice(0, 10), created_by: user.id,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Buyer added');
    }
    setOpen(false);
    load();
  };
  const remove = async (name: string) => {
    if (!canManage || !user.can_delete) { toast.error('No delete permission'); return; }
    if (name === 'Unassigned') return;
    if (!await confirmDialog({ description: `Delete buyer "${name}" and ALL its entries?` })) return;
    const { data: ids, error } = await supabase.from('receives').select('id').eq('office_id', officeId).eq('buyer', name);
    if (error) { toast.error(error.message); return; }
    try {
      await softDelete('receives', (ids || []).map((r: { id: string }) => r.id), { user });
    } catch (e) { toast.error((e as Error).message); return; }
    toast.success('Deleted');
    load();
  };

  const doExcel = () => {
    if (!user.can_excel) { toast.error('No excel permission'); return; }
    exportToExcel(buyers.map(b => ({
      Buyer: b.name,
      'Recv CTN': b.recvCtn, 'Recv Pcs': b.recvPcs,
      'Stock CTN': b.stockCtn, 'Stock Pcs': b.stockPcs,
      'Shipment CTN': b.shipmentCtn, 'Shipment Pcs': b.shipmentPcs,
      'Sample CTN': b.sampleCtn, 'Sample Pcs': b.samplePcs,
    })), `${officeName}-buyers-${new Date().toISOString().slice(0, 10)}`);
  };
  const doPrint = () => {
    if (!user.can_print) { toast.error('No print permission'); return; }
    const num = (n: number) => Number(n || 0).toLocaleString();
    const rowsHtml = buyers.map((b, i) => `
      <tr>
        <td class="text-center muted">${i + 1}</td>
        <td><b>${b.name}</b></td>
        <td class="text-right text-recv"><b>${num(b.recvCtn)}</b><div class="sub">${num(b.recvPcs)} pcs</div></td>
        <td class="text-right text-stock"><b>${num(b.stockCtn)}</b><div class="sub">${num(b.stockPcs)} pcs</div></td>
        <td class="text-right text-ship"><b>${num(b.shipmentCtn)}</b><div class="sub">${num(b.shipmentPcs)} pcs</div></td>
        <td class="text-right text-sample"><b>${num(b.sampleCtn)}</b><div class="sub">${num(b.samplePcs)} pcs</div></td>
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
        <div class="stile recv"><div class="lbl">Total Received</div><div class="val">${num(grand.recvCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(grand.recvPcs)} pcs</div></div>
        <div class="stile stock"><div class="lbl">In Stock</div><div class="val">${num(grand.stockCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(grand.stockPcs)} pcs</div></div>
        <div class="stile ship"><div class="lbl">Shipment</div><div class="val">${num(grand.shipmentCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(grand.shipmentPcs)} pcs</div></div>
        <div class="stile sample"><div class="lbl">Sample + Insp.</div><div class="val">${num(grand.sampleCtn)} <span style="font-size:11px;color:#64748b">CTN</span></div><div class="vsub">${num(grand.samplePcs)} pcs</div></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:30px" class="text-center">#</th>
          <th>Buyer</th>
          <th class="text-right">Received</th>
          <th class="text-right">Stock</th>
          <th class="text-right">Shipment</th>
          <th class="text-right">Sample / Insp.</th>
        </tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center muted" style="padding:14px">No buyers yet</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="2">Total · ${buyers.length} buyers</td>
          <td class="text-right">${num(grand.recvCtn)} CTN / ${num(grand.recvPcs)} pcs</td>
          <td class="text-right">${num(grand.stockCtn)} CTN / ${num(grand.stockPcs)} pcs</td>
          <td class="text-right">${num(grand.shipmentCtn)} CTN / ${num(grand.shipmentPcs)} pcs</td>
          <td class="text-right">${num(grand.sampleCtn)} CTN / ${num(grand.samplePcs)} pcs</td>
        </tr></tfoot>
      </table>`;
    printHTML(body, 'Buyers Overview', `${officeName} · ${buyers.length} buyers`);
  };


  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {user.role !== 'store_user' && (
              <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => navigate('/management')} title="Back to Management">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{officeName}</h2>
              <p className="text-sm tracking-tight text-muted-foreground mt-0.5">Buyers Overview</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold">
              <Users className="h-3.5 w-3.5" />
              Buyers · {buyers.length}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {user.can_print && <Button variant="outline" size="sm" onClick={doPrint} className="hover:bg-primary hover:text-primary-foreground hover:border-primary"><Printer className="h-4 w-4 mr-1.5" />Print</Button>}
            {user.can_excel && <Button variant="outline" size="sm" onClick={doExcel}><FileSpreadsheet className="h-4 w-4 mr-1.5" />Excel</Button>}
            {canManage && user.can_add && (
              <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-1.5" />Add Buyer
              </Button>
            )}
          </div>
        </div>


        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {tiles.map(t => (
            <button
              key={t.label}
              onClick={() => setDetail({ key: t.key, label: t.label, color: t.color, border: t.border })}
              className={`stat-card ${t.ring} rounded-xl p-3 sm:p-5 text-left min-w-0 overflow-hidden focus:outline-none focus-visible:outline-none focus-visible:ring-0 hover:shadow-none`}
            >
              <p className="text-[10px] sm:text-[11px] font-semibold tracking-tight text-muted-foreground uppercase truncate">{t.label}</p>
              <p className={`font-extrabold tabular-nums ${t.color} leading-tight mt-1 sm:mt-2 whitespace-nowrap`} style={{ fontSize: 'clamp(1.1rem, 3cqw, 2rem)' }}>{t.ctn.toLocaleString()}</p>
              <p className="text-[10px] sm:text-xs md:text-sm font-bold text-foreground leading-tight mt-1 tabular-nums whitespace-nowrap">{t.pcs.toLocaleString()} <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground">pcs</span></p>
              <p className="mt-2 sm:mt-3 text-[10px] tracking-tight text-primary font-semibold truncate">Details →</p>
            </button>
          ))}
        </div>


        <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search buyer" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div
          id="buyers-grid"
          className="grid gap-4 grid-cols-1 md:grid-cols-2"
        >
          {buyers.length === 0 && (
            <div className="col-span-full text-center py-10 text-muted-foreground bg-card border border-border rounded-xl">No buyers yet</div>
          )}
          {buyers.map(b => (
            <div
              key={b.name}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/office/${officeId}/buyer/${encodeURIComponent(b.name)}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/office/${officeId}/buyer/${encodeURIComponent(b.name)}`); } }}
              className="group relative min-w-0 bg-card rounded-[2rem] p-5 pt-7 text-left shadow-lg shadow-black/10 transition professional-hover border-2 border-primary hover:shadow-primary/30 flex flex-col cursor-pointer"
            >
              {b.lastActivity > 0 && (
                <div
                  className="absolute top-2 left-3 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[9px] font-semibold text-primary tracking-tight cursor-help"
                  title={new Date(b.lastActivity).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short', hour12: true })}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Updated {new Date(b.lastActivity).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', hour12: true })}
                </div>
              )}
              <div className="flex items-center gap-3 mb-4 mt-2">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold tracking-tight text-sm truncate group-hover:text-primary transition">{b.name}</p>
                    <p className="text-[10px] tracking-tight text-muted-foreground mt-0.5">View entries →</p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {user.can_edit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openRename(b.name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {user.can_delete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); remove(b.name); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Total Recv CTN', v: b.recvCtn, p: b.recvPcs, c: 'text-recv', ring: 'stat-card-recv' },
                  { l: 'Total Stock CTN', v: b.stockCtn, p: b.stockPcs, c: 'text-stock', ring: 'stat-card-stock' },
                  { l: 'Total Shipment CTN', v: b.shipmentCtn, p: b.shipmentPcs, c: 'text-ship', ring: 'stat-card-ship' },
                  { l: 'Total Sample CTN', v: b.sampleCtn, p: b.samplePcs, c: 'text-sample', ring: 'stat-card-sample' },
                ].map(x => (
                  <div key={x.l} className={`stat-card ${x.ring} rounded-lg p-2 min-w-0`}>
                    <p className="text-[10px] font-semibold tracking-tight text-muted-foreground uppercase">{x.l}</p>
                    <p
                      className={`font-extrabold tabular-nums ${x.c} leading-tight mt-0.5 whitespace-nowrap`}
                      style={{ fontSize: 'clamp(0.9rem, 3cqw, 2rem)' }}
                    >
                      {x.v.toLocaleString()}
                    </p>
                    <p className="text-[10px] sm:text-xs md:text-sm font-bold text-foreground leading-tight mt-1 tabular-nums whitespace-nowrap">
                      {x.p.toLocaleString()} <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground">pcs</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingOld ? 'Rename Buyer' : 'Add Buyer'}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-xs">Buyer Name</label>
            <Input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="e.g. H&M" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editingOld ? 'Rename' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-3xl lg:max-w-5xl p-0 overflow-hidden bg-card text-foreground">
          {detail && (() => {
            const totalCtn = buyers.reduce((a, b) => a + ({ recv: b.recvCtn, stock: b.stockCtn, shipment: b.shipmentCtn, sample: b.sampleCtn })[detail.key], 0);
            const totalPcs = buyers.reduce((a, b) => a + ({ recv: b.recvPcs, stock: b.stockPcs, shipment: b.shipmentPcs, sample: b.samplePcs })[detail.key], 0);
            const showTwoLoc = detail.key === 'sample' || detail.key === 'shipment';
            const tintSubtle = withAlpha(detail.border, isLight ? 0.06 : 0.14);
            const tintSoft = withAlpha(detail.border, isLight ? 0.1 : 0.2);
            const tintBadge = withAlpha(detail.border, isLight ? 0.16 : 0.28);
            const tintTotal = withAlpha(detail.border, isLight ? 0.14 : 0.26);
            const tintFooter = withAlpha(detail.border, isLight ? 0.18 : 0.34);
            return (
              <>
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b bg-card text-foreground" style={{ background: `linear-gradient(135deg, ${tintSoft}, hsl(var(--card)))`, borderColor: detail.border }}>
                  <DialogHeader>
                    <div className="flex items-center justify-between gap-2 pr-8">
                      <DialogTitle className="text-base sm:text-xl" style={{ color: detail.border }}>{detail.label} — by Buyer</DialogTitle>
                      <button
                        type="button"
                        onClick={() => {
                          const accent = detail.border;
                          const num = (n: number) => Number(n || 0).toLocaleString();
                          const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
                          const filtered = buyers.filter(b => {
                            const v = { recv: [b.recvCtn, b.recvPcs], stock: [b.stockCtn, b.stockPcs], shipment: [b.shipmentCtn, b.shipmentPcs], sample: [b.sampleCtn, b.samplePcs] }[detail.key];
                            return (v[0] || 0) > 0 || (v[1] || 0) > 0;
                          });
                          const bodyRows = filtered.map((b, i) => {
                            const v = { recv: [b.recvCtn, b.recvPcs], stock: [b.stockCtn, b.stockPcs], shipment: [b.shipmentCtn, b.shipmentPcs], sample: [b.sampleCtn, b.samplePcs] }[detail.key];
                            const locs = b.locByKey[detail.key];
                            const rs = Math.max(locs.length, 1) + 1;
                            if (locs.length === 0) {
                              return `<tr><td class="text-center idx">${i + 1}</td><td class="name"><b>${esc(b.name)}</b></td><td class="muted text-center">—</td>${showTwoLoc ? '<td class="muted text-center">—</td>' : ''}<td class="text-right accent"><b>${num(v[0])}</b></td><td class="text-right"><b>${num(v[1])}</b></td></tr>`;
                            }
                            const locRows = locs.map((l, idx) => `<tr>${idx === 0 ? `<td class="text-center idx" rowspan="${rs}">${i + 1}</td><td class="name" rowspan="${rs}"><b>${esc(b.name)}</b></td>` : ''}<td><span class="badge">${esc(l.label || '—')}</span></td>${showTwoLoc ? `<td><span class="badge gray">${esc(l.current || '—')}</span></td>` : ''}<td class="text-right accent"><b>${num(l.ctn)}</b></td><td class="text-right"><b>${num(l.pcs)}</b></td></tr>`).join('');
                            const sub = `<tr class="subtotal"><td class="text-right" colspan="${showTwoLoc ? 2 : 1}">Total</td><td class="text-right accent"><b>${num(v[0])}</b></td><td class="text-right"><b>${num(v[1])}</b></td></tr>`;
                            return locRows + sub;
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
                              td.idx,td.name{background:${withAlpha(accent, 0.06)}}
                              td.name{text-align:left}
                              tr.subtotal td{background:${withAlpha(accent, 0.1)};font-weight:700;color:${accent}}
                              tfoot td{background:${withAlpha(accent, 0.22)};font-weight:800;color:${accent};border:1px solid ${accent}}
                              .accent{color:${accent}}.muted{color:#94a3b8}
                              .text-right{text-align:right}.text-center{text-align:center}
                              .badge{display:inline;color:${accent};font-weight:700;font-size:11px;background:transparent;padding:0;border-radius:0}
                              .badge.gray{background:transparent;color:#334155}
                            </style>
                            <div class="acc">
                              <div class="t">${esc(detail.label)} — by Buyer</div>
                              <div class="s">${esc(officeName)} · ${filtered.length} buyer${filtered.length === 1 ? '' : 's'}</div>
                            </div>
                            <div class="kpi">
                              <div class="k"><div class="lbl">Total CTN</div><div class="val">${num(totalCtn)}</div></div>
                              <div class="k"><div class="lbl">Total Pcs</div><div class="val">${num(totalPcs)}</div></div>
                            </div>
                            <table>
                              <thead><tr>
                                <th style="width:36px">#</th>
                                <th>Buyer</th>
                                <th>${showTwoLoc ? 'Previous Location' : 'Location'}</th>
                                ${showTwoLoc ? '<th>Current Location</th>' : ''}
                                <th class="text-right" style="width:90px">CTN</th>
                                <th class="text-right" style="width:110px">Pcs</th>
                              </tr></thead>
                              <tbody>${bodyRows || `<tr><td colspan="${showTwoLoc ? 6 : 5}" class="text-center muted" style="padding:18px">No data</td></tr>`}</tbody>
                              <tfoot><tr>
                                <td colspan="${showTwoLoc ? 4 : 3}">Grand Total · ${filtered.length} buyers</td>
                                <td class="text-right">${num(totalCtn)}</td>
                                <td class="text-right">${num(totalPcs)}</td>
                              </tr></tfoot>
                            </table>`;
                          printHTML(body, detail.label, `${officeName} · ${new Date().toLocaleString()}`);
                        }}
                        className="text-xs px-3 py-1.5 rounded border-2 font-semibold hover:opacity-80 transition inline-flex items-center gap-1.5"
                        style={{ borderColor: detail.border, color: detail.border, background: 'hsl(var(--background))' }}
                      >
                        <Printer className="h-3.5 w-3.5" /> Print
                      </button>
                    </div>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="bg-background text-foreground rounded-lg border px-3 py-2" style={{ borderColor: detail.border }}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-foreground/75">Total CTN</p>
                      <p className="text-xl font-bold tabular-nums" style={{ color: detail.border }}>{totalCtn.toLocaleString()}</p>
                    </div>
                    <div className="bg-background text-foreground rounded-lg border px-3 py-2" style={{ borderColor: detail.border }}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-foreground/75">Total Pcs</p>
                      <p className="text-xl font-bold tabular-nums text-foreground">{totalPcs.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[65vh] overflow-auto p-2 sm:p-4 bg-background text-foreground">
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {buyers.map((b, i) => {
                      const v = { recv: [b.recvCtn, b.recvPcs], stock: [b.stockCtn, b.stockPcs], shipment: [b.shipmentCtn, b.shipmentPcs], sample: [b.sampleCtn, b.samplePcs] }[detail.key];
                      const locs = b.locByKey[detail.key];
                      const goBuyer = () => { setDetail(null); navigate(`/office/${officeId}/buyer/${encodeURIComponent(b.name)}`); };
                      return (
                        <div key={b.name} className="rounded-lg border-2 bg-background text-foreground overflow-hidden" style={{ borderColor: detail.border }}>
                          <div className="flex items-center justify-between px-3 py-2 cursor-pointer" style={{ background: tintSoft }} onClick={goBuyer}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-bold text-foreground/75">#{i + 1}</span>
                              <span className="font-bold text-sm truncate" style={{ color: detail.border }}>{b.name}</span>
                            </div>
                          </div>
                          <div>
                            {locs.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-foreground/75 text-center">No location data</div>
                            ) : locs.map((l, idx) => (
                              <div key={idx} className="px-3 py-2 text-[11px] border-t-2" style={{ borderTopColor: detail.border }}>
                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-[10px]" style={{ color: detail.border }}>{l.label || '—'}</span>
                                  {showTwoLoc && (
                                    <>
                                       <span className="text-foreground/75">→</span>
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
                            <div className="px-3 py-2 flex justify-between items-center text-[11px] font-bold tabular-nums border-t-2" style={{ background: tintTotal, borderTopColor: detail.border }}>
                              <span className="uppercase tracking-tight" style={{ color: detail.border }}>Total</span>
                              <span className="flex gap-3">
                                <span style={{ color: detail.border }}>{v[0].toLocaleString()} CTN</span>
                                <span className="text-foreground">{v[1].toLocaleString()} Pcs</span>
                              </span>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                    {buyers.length === 0 && (
                      <div className="text-center text-muted-foreground py-6 text-xs">No buyers yet</div>
                    )}
                  </div>

                  {/* Desktop table */}
                  <table className="hidden sm:table w-full min-w-[640px] text-sm bg-card" style={{ borderCollapse: 'collapse' }}>
                    <thead className="sticky top-0" style={{ background: tintTotal }}>
                      <tr className="text-[11px] tracking-tight uppercase" style={{ color: detail.border }}>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>#</th>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>Buyer</th>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>{showTwoLoc ? 'Previous Location' : 'Location'}</th>
                        {showTwoLoc && <th className="px-3 py-2 text-left border" style={{ borderColor: detail.border }}>Current Location</th>}
                        <th className="px-3 py-2 text-right border" style={{ borderColor: detail.border }}>CTN</th>
                        <th className="px-3 py-2 text-right border" style={{ borderColor: detail.border }}>Pcs</th>
                      </tr>
                    </thead>

                    <tbody>
                      {buyers.map((b, i) => {
                        const v = { recv: [b.recvCtn, b.recvPcs], stock: [b.stockCtn, b.stockPcs], shipment: [b.shipmentCtn, b.shipmentPcs], sample: [b.sampleCtn, b.samplePcs] }[detail.key];
                        const locs = b.locByKey[detail.key];
                        const rowSpanCount = Math.max(locs.length, 1) + 1;
                        const emptyColSpanForTotal = showTwoLoc ? 2 : 1;
                        const goBuyer = () => { setDetail(null); navigate(`/office/${officeId}/buyer/${encodeURIComponent(b.name)}`); };
                        return (
                          <Fragment key={b.name}>
                            {locs.length === 0 ? (
                              <tr className="hover:opacity-90 cursor-pointer transition" style={{ background: tintSubtle }} onClick={goBuyer}>
                                <td className="px-3 py-2 border text-center text-foreground tabular-nums" style={{ borderColor: detail.border }}>{i + 1}</td>
                                <td className="px-3 py-2 border font-semibold text-center text-foreground" style={{ borderColor: detail.border }}>{b.name}</td>
                                <td className="px-3 py-2 border text-xs text-foreground/70 text-center" style={{ borderColor: detail.border }}>—</td>
                                {showTwoLoc && <td className="px-3 py-2 border text-xs text-foreground/70 text-center" style={{ borderColor: detail.border }}>—</td>}
                                <td className="px-3 py-2 border text-right font-bold tabular-nums" style={{ borderColor: detail.border, color: detail.border }}>{v[0].toLocaleString()}</td>
                                <td className="px-3 py-2 border text-right font-semibold tabular-nums text-foreground" style={{ borderColor: detail.border }}>{v[1].toLocaleString()}</td>
                              </tr>
                            ) : (
                              <>
                                {locs.map((l, idx) => (
                                  <tr key={b.name + l.label + (l.current || '') + idx} className="bg-card hover:opacity-95">
                                    {idx === 0 && (
                                      <>
                                        <td className="px-3 py-2 border text-center text-foreground tabular-nums align-middle cursor-pointer" style={{ borderColor: detail.border }} rowSpan={rowSpanCount} onClick={goBuyer}>{i + 1}</td>
                                        <td className="px-3 py-2 border font-semibold text-center align-middle cursor-pointer text-foreground" style={{ borderColor: detail.border, background: tintSubtle }} rowSpan={rowSpanCount} onClick={goBuyer}>{b.name}</td>

                                      </>
                                    )}
                                    <td className="px-3 py-2 border text-xs" style={{ borderColor: detail.border }}>
                                      <span className="font-semibold text-[11px]" style={{ color: detail.border }}>{l.label}</span>
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
                                <tr className="font-bold" style={{ background: tintTotal }}>
                                  <td className="px-3 py-2 border text-right text-xs uppercase tracking-tight" colSpan={emptyColSpanForTotal} style={{ borderColor: detail.border, color: detail.border }}>Total</td>
                                  <td className="px-3 py-2 border text-right text-sm tabular-nums" style={{ borderColor: detail.border, color: detail.border }}>{v[0].toLocaleString()}</td>
                                  <td className="px-3 py-2 border text-right text-sm tabular-nums text-foreground" style={{ borderColor: detail.border }}>{v[1].toLocaleString()}</td>
                                </tr>

                              </>
                            )}
                          </Fragment>
                        );
                      })}
                      {buyers.length === 0 && (
                        <tr><td colSpan={showTwoLoc ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground border" style={{ borderColor: detail.border }}>No buyers yet</td></tr>
                      )}
                    </tbody>
                    <tfoot className="font-bold" style={{ background: tintFooter }}>
                      <tr>
                        <td className="px-3 py-2 border text-foreground" colSpan={showTwoLoc ? 4 : 3} style={{ borderColor: detail.border }}>Total ({buyers.length} buyers)</td>
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

    </AppLayout>

  );
};

export default OfficePage;
