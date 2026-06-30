import { useEffect, useMemo, useState, useRef } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth, type AppUser } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { logHistoryAndNotify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, parseISO, isValid } from 'date-fns';
import {
  Plus, Printer, FileSpreadsheet, Search, ArrowLeft, MoreVertical, MapPin, Filter, X,
  PencilLine, Trash2, History, PackageCheck, ClipboardCheck, Send, FlaskConical, Calendar, Eye,
} from 'lucide-react';

import { toast } from 'sonner';
import { exportToExcel, printElement, printHTML } from '@/lib/exportExcel';
import { softDelete } from '@/lib/recycleBin';

type IssueType = 'sample' | 'inspection' | 'shipment';

interface RCarton { id: string; receive_id: string; ctn_qty: number; pcs_per_ctn: number; location: string | null; rack: string | null; remarks: string | null; created_at?: string; }
interface RIssueLine { id: string; issue_id: string; source_carton_id: string | null; ctn_qty: number; pcs_per_ctn: number; returned_ctn: number; returned_pcs: number; }
interface RIssue {
  id: string; receive_id: string; issue_type: IssueType;
  total_ctn: number; total_pcs: number;
  issued_to: string | null; remarks: string | null; issued_at: string;
  destination: string | null; receiver_name: string | null; designation: string | null;
  department: string | null; unit_office: string | null;
  port: string | null; truck_no: string | null; driver_name: string | null;
  driver_mobile: string | null; lock_no: string | null; export_by: string | null; ar_desh: string | null;
  created_at?: string;
}
interface Receive {
  id: string; office_id: string; buyer: string | null;
  si_no: string | null; entry_date: string; challan_no: string | null;
  po_no: string | null; style: string | null; remarks: string | null;
  created_at: string; updated_at?: string;
}

const sumCtn = (xs: { ctn_qty: number }[]) => xs.reduce((a, b) => a + (b.ctn_qty || 0), 0);
const sumPcs = (xs: { ctn_qty: number; pcs_per_ctn: number }[]) =>
  xs.reduce((a, b) => a + (b.ctn_qty || 0) * (b.pcs_per_ctn || 0), 0);
const issueCtn = (xs: RIssue[]) => xs.reduce((a, b) => a + (b.total_ctn || 0), 0);
const issuePcs = (xs: RIssue[]) => xs.reduce((a, b) => a + (b.total_pcs || 0), 0);



const BuyerPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const navigate = useNavigate();
  const { officeId = '', buyer: buyerRaw = '' } = useParams();
  const buyerName = decodeURIComponent(buyerRaw);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const buyerRouteSeg = encodeURIComponent(buyerName);
  const routeFor = (rid: string) => `/office/${officeId}/buyer/${buyerRouteSeg}?highlight=${rid}`;

  const [officeName, setOfficeName] = useState('');
  const [receives, setReceives] = useState<Receive[]>([]);
  const [cartons, setCartons] = useState<RCarton[]>([]);
  const [issues, setIssues] = useState<RIssue[]>([]);
  const [issueLines, setIssueLines] = useState<RIssueLine[]>([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    const recvQ = supabase.from('receives').select('*').eq('office_id', officeId).order('created_at', { ascending: false });
    const q = buyerName === 'Unassigned' ? recvQ.is('buyer', null) : recvQ.eq('buyer', buyerName);
    const { data: rs } = await q;
    const list = ((rs as Receive[]) || []).filter(r => (r.si_no ?? '') !== '__PLACEHOLDER__');
    setReceives(list);
    const ids = list.map(r => r.id);
    if (ids.length === 0) { setCartons([]); setIssues([]); setIssueLines([]); return; }
    const [{ data: cs }, { data: is }] = await Promise.all([
      supabase.from('receive_cartons').select('*').in('receive_id', ids),
      supabase.from('receive_issues').select('*').in('receive_id', ids),
    ]);
    setCartons((cs as RCarton[]) || []);
    setIssues((is as RIssue[]) || []);
    const allIssues = ((is as RIssue[]) || []);
    const issueIds = allIssues.map(i => i.id);
    if (issueIds.length === 0) { setIssueLines([]); return; }
    const { data: ls } = await supabase.from('receive_issue_lines').select('*').in('issue_id', issueIds);
    const linesList = (ls as RIssueLine[]) || [];
    // Auto-cleanup: delete empty issues (0 ctn & 0 pcs and no lines) — leftovers from prior duplicate-save bug
    const linesByIssue = new Set(linesList.map(l => l.issue_id));
    const emptyIds = allIssues
      .filter(i => (i.total_ctn || 0) === 0 && (i.total_pcs || 0) === 0 && !linesByIssue.has(i.id))
      .map(i => i.id);
    if (emptyIds.length) {
      await supabase.from('receive_issues').delete().in('id', emptyIds);
      setIssues(allIssues.filter(i => !emptyIds.includes(i.id)));
    }
    setIssueLines(linesList);
  };


  useEffect(() => {
    if (!officeId) return;
    supabase.from('offices').select('name').eq('id', officeId).maybeSingle().then(({ data }) => setOfficeName(data?.name || ''));
    load();
    const ch = supabase.channel(`buyer-${officeId}-${buyerName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receives', filter: `office_id=eq.${officeId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_cartons' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_issues' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_issue_lines' }, load)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId, buyerName]);

  // Scroll to & highlight a row when notification routes here with ?highlight=<receiveId>
  useEffect(() => {
    if (!highlightId || receives.length === 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`recv-row-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'bg-primary/10');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary', 'bg-primary/10');
          // remove highlight param so it doesn't re-trigger on reload
          const sp = new URLSearchParams(searchParams);
          sp.delete('highlight');
          setSearchParams(sp, { replace: true });
        }, 3500);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, receives.length]);


  // dialogs
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editingReceive, setEditingReceive] = useState<Receive | null>(null);
  const [rForm, setRForm] = useState({ si_no: '', entry_date: new Date().toISOString().slice(0, 10), challan_no: '', po_no: '', style: '', remarks: '' });
  const [rCartonsDraft, setRCartonsDraft] = useState<Array<{ id?: string; ctn_qty: number; pcs_per_ctn: number; location: string; rack: string; remarks: string; editing?: boolean }>>([]);

  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issuesFor, setIssuesFor] = useState<{ receive: Receive; type: IssueType } | null>(null);
  const [issuesAutoHistory, setIssuesAutoHistory] = useState(false);

  if (!user) return <Navigate to="/login" replace />;
  const canManage = user.role === 'super_admin' || user.role === 'admin' ||
    (user.role === 'store_user' && user.office_id === officeId);

  // derived per-receive
  const perReceive = useMemo(() => {
    const cByR = new Map<string, RCarton[]>();
    const iByR = new Map<string, RIssue[]>();
    for (const c of cartons) { (cByR.get(c.receive_id) || cByR.set(c.receive_id, []).get(c.receive_id)!).push(c); }
    for (const i of issues) { (iByR.get(i.receive_id) || iByR.set(i.receive_id, []).get(i.receive_id)!).push(i); }
    // net issued (ctn, pcs) per source_carton_id
    const issuedByCarton = new Map<string, { ctn: number; pcs: number }>();
    for (const l of issueLines) {
      if (!l.source_carton_id) continue;
      const cur = issuedByCarton.get(l.source_carton_id) || { ctn: 0, pcs: 0 };
      const netCtn = (l.ctn_qty || 0) - (l.returned_ctn || 0);
      const netPcs = (l.ctn_qty || 0) * (l.pcs_per_ctn || 0) - (l.returned_pcs || 0);
      cur.ctn += netCtn;
      cur.pcs += netPcs;
      issuedByCarton.set(l.source_carton_id, cur);
    }

    return receives.map(r => {
      const cs = cByR.get(r.id) || [];
      const is = iByR.get(r.id) || [];
      const recvCtn = sumCtn(cs), recvPcs = sumPcs(cs);
      const byType = (t: IssueType) => is.filter(x => x.issue_type === t);
      const sample = byType('sample'), inspection = byType('inspection'), shipment = byType('shipment');
      const issuedCtn = issueCtn(is), issuedPcs = issuePcs(is);
      // location + rack breakdown
      const recvLocMap = new Map<string, { location: string; rack: string; ctn: number; pcs: number }>();
      const stockLocMap = new Map<string, { location: string; rack: string; ctn: number; pcs: number }>();
      for (const c of cs) {
        const loc = (c.location || '').trim() || '—';
        const rack = (c.rack || '').trim();
        const key = `${loc}||${rack}`;
        const recvC = c.ctn_qty || 0, recvP = (c.ctn_qty || 0) * (c.pcs_per_ctn || 0);
        const ri = recvLocMap.get(key) || { location: loc, rack, ctn: 0, pcs: 0 };
        ri.ctn += recvC; ri.pcs += recvP; recvLocMap.set(key, ri);
        const iss = issuedByCarton.get(c.id) || { ctn: 0, pcs: 0 };
        const sC = recvC - iss.ctn, sP = recvP - iss.pcs;
        if (sC > 0 || sP > 0) {
          const si = stockLocMap.get(key) || { location: loc, rack, ctn: 0, pcs: 0 };
          si.ctn += sC; si.pcs += sP; stockLocMap.set(key, si);
        }
      }
      const recvLocations = Array.from(recvLocMap.values());
      const stockLocations = Array.from(stockLocMap.values());
      const sCtn = Math.max(recvCtn - issuedCtn, 0);
      const sPcs = sCtn === 0 ? 0 : Math.max(recvPcs - issuedPcs, 0);
      // Recompute per-location stock with the same rule: no CTN -> no pcs.
      const stockLocationsClean = Array.from(stockLocMap.values())
        .map(v => ({ location: v.location, rack: v.rack, ctn: v.ctn, pcs: v.ctn <= 0 ? 0 : v.pcs }))
        .filter(l => l.ctn > 0);
      return {
        r, cs, is, recvCtn, recvPcs, issuedCtn, issuedPcs,
        stockCtn: sCtn, stockPcs: sPcs,
        sample: { ctn: issueCtn(sample), pcs: issuePcs(sample), list: sample },
        inspection: { ctn: issueCtn(inspection), pcs: issuePcs(inspection), list: inspection },
        shipment: { ctn: issueCtn(shipment), pcs: issuePcs(shipment), list: shipment },
        recvLocations, stockLocations: stockLocationsClean,
      };
    });
  }, [receives, cartons, issues, issueLines]);


  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = perReceive.filter(({ r }) => {
      if (from && r.entry_date < from) return false;
      if (to && r.entry_date > to) return false;
      if (!q) return true;
      return (r.si_no || '').toLowerCase().includes(q) ||
        (r.challan_no || '').toLowerCase().includes(q) ||
        (r.po_no || '').toLowerCase().includes(q) ||
        (r.style || '').toLowerCase().includes(q);
    });
    // Sort by most-recent activity: latest of receive updated_at/created_at, cartons and issues created_at
    const lastActivity = (p: typeof list[number]) => {
      const times: number[] = [
        new Date(p.r.updated_at || p.r.created_at).getTime(),
        new Date(p.r.created_at).getTime(),
      ];
      p.cs.forEach(c => { if (c.created_at) times.push(new Date(c.created_at).getTime()); });
      issues.filter(i => i.receive_id === p.r.id).forEach(i => { if (i.created_at) times.push(new Date(i.created_at).getTime()); });
      return Math.max(...times);
    };
    return [...list].sort((a, b) => lastActivity(b) - lastActivity(a));
  }, [perReceive, search, from, to, issues]);

  const tiles = useMemo(() => {
    const t = filtered.reduce((a, x) => ({
      recvCtn: a.recvCtn + x.recvCtn, recvPcs: a.recvPcs + x.recvPcs,
      stockCtn: a.stockCtn + x.stockCtn, stockPcs: a.stockPcs + x.stockPcs,
      sampleCtn: a.sampleCtn + x.sample.ctn, samplePcs: a.samplePcs + x.sample.pcs,
      inspCtn: a.inspCtn + x.inspection.ctn, inspPcs: a.inspPcs + x.inspection.pcs,
      shipCtn: a.shipCtn + x.shipment.ctn, shipPcs: a.shipPcs + x.shipment.pcs,
    }), { recvCtn: 0, recvPcs: 0, stockCtn: 0, stockPcs: 0, sampleCtn: 0, samplePcs: 0, inspCtn: 0, inspPcs: 0, shipCtn: 0, shipPcs: 0 });
    return [
      { label: 'Recv CTN (Pcs)', ctn: t.recvCtn, pcs: t.recvPcs, ring: 'stat-card-recv', color: 'text-recv' },
      { label: 'Stock CTN (Pcs)', ctn: t.stockCtn, pcs: t.stockPcs, ring: 'stat-card-stock', color: 'text-stock' },
      { label: 'Sample CTN (Pcs)', ctn: t.sampleCtn, pcs: t.samplePcs, ring: 'stat-card-sample', color: 'text-sample' },
      { label: 'Inspection CTN (Pcs)', ctn: t.inspCtn, pcs: t.inspPcs, ring: 'stat-card-sample', color: 'text-sample' },
      { label: 'Shipment CTN (Pcs)', ctn: t.shipCtn, pcs: t.shipPcs, ring: 'stat-card-ship', color: 'text-ship' },
    ];
  }, [filtered]);

  const [detail, setDetail] = useState<null | { key: 'recv' | 'stock' | 'sample' | 'inspection' | 'shipment'; label: string; color: string }>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailBorderColor, setDetailBorderColor] = useState<string>('');
  const goToLocation = (loc: string) => {
    const c = cartons.find(c => (((c.location || '—').trim() || '—') === loc));
    if (!c) return;
    setDetail(null);
    setDetailSearch('');
    setTimeout(() => {
      const el = document.getElementById(`recv-row-${c.receive_id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'bg-primary/10');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'bg-primary/10'), 3500);
      }
    }, 200);
  };
  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);

  const getLocationMap = (key: 'recv' | 'stock' | 'sample' | 'inspection' | 'shipment') => {
    const recById = new Map(receives.map(r => [r.id, r]));
    const styleOf = (rid: string) => ((recById.get(rid)?.style || '—').toString().trim() || '—');
    const poOf = (rid: string) => ((recById.get(rid)?.po_no || '—').toString().trim() || '—');

    type Row = { style: string; po: string; location: string; rack: string; current?: string; ctn: number; pcs: number };
    const sortRows = (a: Row, b: Row) =>
      a.style.localeCompare(b.style) || a.po.localeCompare(b.po) || a.location.localeCompare(b.location) || a.rack.localeCompare(b.rack);

    if (key === 'recv') {
      const map = new Map<string, Row>();
      for (const c of cartons) {
        const loc = (c.location || '—').trim() || '—';
        const rack = (c.rack || '').trim();
        const style = styleOf(c.receive_id), po = poOf(c.receive_id);
        const gk = `${style}__${po}__${loc}__${rack}`;
        const cur = map.get(gk) || { style, po, location: loc, rack, ctn: 0, pcs: 0 };
        cur.ctn += c.ctn_qty || 0;
        cur.pcs += (c.ctn_qty || 0) * (c.pcs_per_ctn || 0);
        map.set(gk, cur);
      }
      return Array.from(map.values()).sort(sortRows);
    }

    if (key === 'stock') {
      const used = new Map<string, { ctn: number; pcs: number }>();
      for (const l of issueLines) {
        const cid = l.source_carton_id || '';
        const cur = used.get(cid) || { ctn: 0, pcs: 0 };
        const netCtn = Math.max((l.ctn_qty || 0) - (l.returned_ctn || 0), 0);
        const netPcs = Math.max((l.ctn_qty || 0) * (l.pcs_per_ctn || 0) - (l.returned_pcs || 0), 0);
        cur.ctn += netCtn; cur.pcs += netPcs; used.set(cid, cur);
      }
      const fullMap = new Map<string, Row>();
      const partials: Row[] = [];
      for (const c of cartons) {
        const u = used.get(c.id) || { ctn: 0, pcs: 0 };
        const ppc = Number(c.pcs_per_ctn || 0);
        const totalPcs = Number(c.ctn_qty || 0) * ppc;
        const availP = Math.max(totalPcs - u.pcs, 0);
        if (availP <= 0) continue;
        const loc = (c.location || '—').trim() || '—';
        const rack = (c.rack || '').trim();
        const style = styleOf(c.receive_id), po = poOf(c.receive_id);
        const fullCtn = ppc > 0 ? Math.floor(availP / ppc) : 0;
        const partialPcs = ppc > 0 ? availP % ppc : availP;
        if (fullCtn > 0) {
          const gk = `${style}__${po}__${loc}__${rack}__${ppc}`;
          const cur = fullMap.get(gk) || { style, po, location: loc, rack, ctn: 0, pcs: 0 };
          cur.ctn += fullCtn;
          cur.pcs += fullCtn * ppc;
          fullMap.set(gk, cur);
        }
        if (partialPcs > 0) partials.push({ style, po, location: loc, rack, ctn: 1, pcs: partialPcs });
      }
      return [...Array.from(fullMap.values()).sort(sortRows), ...partials.sort(sortRows)];
    }

    // sample / inspection / shipment
    const issuesById = new Map(issues.map(i => [i.id, i]));
    const fullMap = new Map<string, Row>();
    const partials: Row[] = [];
    for (const l of issueLines) {
      const issue = issuesById.get(l.issue_id);
      if (!issue || issue.issue_type !== key) continue;
      const c = cartons.find(x => x.id === l.source_carton_id);
      const from = (c?.location || '—').trim() || '—';
      const rack = (c?.rack || '').trim();
      const dest = (((issue.destination || issue.port) || '—').toString().trim() || '—');
      const rid = c?.receive_id || issue.receive_id;
      const style = styleOf(rid), po = poOf(rid);

      const ppc = Number(l.pcs_per_ctn || 0);
      const issuedPcs = Number(l.ctn_qty || 0) * ppc;
      const remainingPcs = Math.max(issuedPcs - Number(l.returned_pcs || 0), 0);
      const fullCtn = ppc > 0 ? Math.floor(remainingPcs / ppc) : 0;
      const partialPcs = ppc > 0 ? remainingPcs % ppc : remainingPcs;

      if (fullCtn > 0) {
        const gk = `${style}__${po}__${from}__${rack}__${dest}__${ppc}`;
        const cur = fullMap.get(gk) || { style, po, location: from, rack, current: dest, ctn: 0, pcs: 0 };
        cur.ctn += fullCtn;
        cur.pcs += fullCtn * ppc;
        fullMap.set(gk, cur);
      }
      if (partialPcs > 0) {
        partials.push({ style, po, location: from, rack, current: dest, ctn: 1, pcs: partialPcs });
      }
    }
    return [...Array.from(fullMap.values()).sort(sortRows), ...partials.sort(sortRows)];
  };


  // ---------- Receive form ----------
  const openAdd = () => {
    if (!canManage || !user.can_add) return toast.error('No add permission');
    setEditingReceive(null);
    setRForm({ si_no: '', entry_date: new Date().toISOString().slice(0, 10), challan_no: '', po_no: '', style: '', remarks: '' });
    setRCartonsDraft([{ ctn_qty: 0, pcs_per_ctn: 0, location: '', rack: '', remarks: '', editing: true }]);
    setReceiveOpen(true);
  };
  const openEditReceive = (r: Receive, cs: RCarton[]) => {
    if (!canManage || !user.can_edit) return toast.error('No edit permission');
    setEditingReceive(r);
    setRForm({
      si_no: r.si_no || '', entry_date: r.entry_date, challan_no: r.challan_no || '',
      po_no: r.po_no || '', style: r.style || '', remarks: r.remarks || '',
    });
    setRCartonsDraft(cs.length === 0
      ? [{ ctn_qty: 0, pcs_per_ctn: 0, location: '', rack: '', remarks: '', editing: true }]
      : cs.map(c => ({ id: c.id, ctn_qty: c.ctn_qty, pcs_per_ctn: c.pcs_per_ctn, location: c.location || '', rack: c.rack || '', remarks: c.remarks || '', editing: false })));
    setReceiveOpen(true);
  };
  const addCartonRow = () => {
    setRCartonsDraft([{ ctn_qty: 0, pcs_per_ctn: 0, location: '', rack: '', remarks: '', editing: true }, ...rCartonsDraft]);
  };
  const removeCartonRow = (idx: number) => setRCartonsDraft(rCartonsDraft.filter((_, i) => i !== idx));
  const updateCartonRow = (idx: number, k: string, v: string | number) =>
    setRCartonsDraft(rCartonsDraft.map((c, i) => i === idx ? { ...c, [k]: v } : c));
  const setCartonRowEditing = (idx: number, editing: boolean) => {
    setRCartonsDraft(rCartonsDraft.map((c, i) => i === idx ? { ...c, editing } : c));
  };
  const draftTotals = {
    ctn: rCartonsDraft.reduce((a, c) => a + Number(c.ctn_qty || 0), 0),
    pcs: rCartonsDraft.reduce((a, c) => a + Number(c.ctn_qty || 0) * Number(c.pcs_per_ctn || 0), 0),
  };

  const saveReceive = async (opts?: { keepOpen?: boolean }) => {
    if (!rForm.challan_no.trim() && !rForm.si_no.trim()) return toast.error('SI or Challan required');
    if (!rForm.po_no.trim()) return toast.error('PO No is required');
    if (!rForm.style.trim()) return toast.error('Style No is required');
    if (rCartonsDraft.length === 0) return toast.error('Add at least one carton row');
    for (let i = 0; i < rCartonsDraft.length; i++) {
      const c = rCartonsDraft[i];
      if (!Number(c.ctn_qty)) return toast.error(`Row ${i + 1}: CTN Qty is required`);
      if (!Number(c.pcs_per_ctn)) return toast.error(`Row ${i + 1}: Pcs Qty is required`);
      if (!(c.location || '').trim()) return toast.error(`Row ${i + 1}: Location is required`);
    }

    const nowIso = new Date().toISOString();
    const payload = {
      office_id: officeId,
      buyer: buyerName === 'Unassigned' ? null : buyerName,
      si_no: rForm.si_no || null, entry_date: rForm.entry_date,
      challan_no: rForm.challan_no || null, po_no: rForm.po_no || null,
      style: rForm.style || null, remarks: rForm.remarks || null,
      updated_at: nowIso,
    };
    let receiveId: string;
    let isUpdate = !!editingReceive;
    if (editingReceive) {
      const { error } = await supabase.from('receives').update(payload).eq('id', editingReceive.id);
      if (error) return toast.error(error.message);
      receiveId = editingReceive.id;
      const keepIds = rCartonsDraft.map(c => c.id).filter(Boolean) as string[];
      const toDel = (cartons.filter(c => c.receive_id === receiveId).map(c => c.id)).filter(id => !keepIds.includes(id));
      if (toDel.length) await supabase.from('receive_cartons').delete().in('id', toDel);
    } else {
      const { data, error } = await supabase.from('receives').insert({ ...payload, created_by: user.id }).select('*').single();
      if (error) return toast.error(error.message);
      receiveId = data.id;
      // Promote to edit mode so subsequent saves update instead of insert
      setEditingReceive(data as Receive);
    }
    // Upsert cartons
    const updatedDraft: typeof rCartonsDraft = [];
    for (const c of rCartonsDraft) {
      const row = {
        receive_id: receiveId, ctn_qty: Number(c.ctn_qty || 0), pcs_per_ctn: Number(c.pcs_per_ctn || 0),
        location: c.location || null, rack: c.rack || null, remarks: c.remarks || null,
      };
      if (c.id) {
        await supabase.from('receive_cartons').update(row).eq('id', c.id);
        updatedDraft.push({ ...c, editing: false });
      } else {
        const { data: ins } = await supabase.from('receive_cartons').insert(row).select('id').single();
        updatedDraft.push({ ...c, id: ins?.id, editing: false });
      }
    }
    // Always bump parent receive updated_at so the row jumps to the top after any change
    if (isUpdate) {
      await supabase.from('receives').update({ updated_at: new Date().toISOString() }).eq('id', receiveId);
    }
    setRCartonsDraft(updatedDraft);
    toast.success(isUpdate ? 'Updated' : 'Added');
    if (!opts?.keepOpen) setReceiveOpen(false);
    const after = {
      si_no: rForm.si_no, entry_date: rForm.entry_date, challan_no: rForm.challan_no,
      po_no: rForm.po_no, style: rForm.style, remarks: rForm.remarks,
      ctn_total: rCartonsDraft.reduce((a, c) => a + Number(c.ctn_qty || 0), 0),
      pcs_total: rCartonsDraft.reduce((a, c) => a + Number(c.ctn_qty || 0) * Number(c.pcs_per_ctn || 0), 0),
    };
    const before = editingReceive ? {
      si_no: editingReceive.si_no || '', entry_date: editingReceive.entry_date,
      challan_no: editingReceive.challan_no || '', po_no: editingReceive.po_no || '',
      style: editingReceive.style || '', remarks: editingReceive.remarks || '',
      ctn_total: cartons.filter(c => c.receive_id === editingReceive.id).reduce((a, c) => a + (c.ctn_qty || 0), 0),
      pcs_total: cartons.filter(c => c.receive_id === editingReceive.id).reduce((a, c) => a + (c.ctn_qty || 0) * (c.pcs_per_ctn || 0), 0),
    } : null;
    const ref = rForm.challan_no || rForm.si_no || 'entry';
    await logHistoryAndNotify({
      user, officeId, officeName,
      cartonId: null, cartonNo: ref,
      action: isUpdate ? 'updated' : 'created',
      message: `${isUpdate ? 'Updated' : 'Added'} ${buyerName} entry (PO: ${rForm.po_no || '—'}, Style: ${rForm.style || '—'})`,
      details: { receive_id: receiveId, buyer: buyerName, before, after },
      route: routeFor(receiveId),
    });
    load();
  };

  const removeReceive = async (r: Receive) => {
    if (!canManage || !user.can_delete) return toast.error('No delete permission');
    if (!await confirmDialog({ description: `Delete this entry (${r.challan_no || r.si_no || 'no ref'}) and all its cartons & issues?` })) return;
    try { await softDelete('receives', [r.id], { user }); }
    catch (e) { return toast.error((e as Error).message); }
    toast.success('Deleted');
    const before = {
      si_no: r.si_no || '', entry_date: r.entry_date, challan_no: r.challan_no || '',
      po_no: r.po_no || '', style: r.style || '', remarks: r.remarks || '',
      ctn_total: cartons.filter(c => c.receive_id === r.id).reduce((a, c) => a + (c.ctn_qty || 0), 0),
      pcs_total: cartons.filter(c => c.receive_id === r.id).reduce((a, c) => a + (c.ctn_qty || 0) * (c.pcs_per_ctn || 0), 0),
    };
    await logHistoryAndNotify({
      user, officeId, officeName,
      cartonId: null, cartonNo: r.challan_no || r.si_no || 'entry',
      action: 'deleted',
      message: `Deleted ${buyerName} entry (PO: ${r.po_no || '—'}, Style: ${r.style || '—'})`,
      details: { receive_id: r.id, buyer: buyerName, before, after: null },
      route: `/office/${officeId}/buyer/${buyerRouteSeg}`,
    });
  };


  // ---------- Issues dialog ----------
  const openIssuesDialog = (receive: Receive, type: IssueType) => {
    const row = perReceive.find(p => p.r.id === receive.id);
    const existingForType = row?.[type]?.list?.length || 0;
    if (!row || (row.stockCtn <= 0 && existingForType === 0)) {
      return toast.error('No stock available to issue. Receive more cartons first.');
    }
    setIssuesAutoHistory(false);
    setIssuesFor({ receive, type });
    setIssuesOpen(true);
  };

  const openHistoryDialog = (receive: Receive, type: IssueType) => {
    setIssuesAutoHistory(true);
    setIssuesFor({ receive, type });
    setIssuesOpen(true);
  };

  // Export / print
  const flatRows = filtered.flatMap(({ r, cs, sample, inspection, shipment }) => ({
    'SI': r.si_no, 'Date': r.entry_date, 'Challan': r.challan_no, 'PO': r.po_no, 'Style': r.style,
    'Recv CTN': sumCtn(cs), 'Recv Pcs': sumPcs(cs),
    'Sample CTN': sample.ctn, 'Sample Pcs': sample.pcs,
    'Inspection CTN': inspection.ctn, 'Inspection Pcs': inspection.pcs,
    'Shipment CTN': shipment.ctn, 'Shipment Pcs': shipment.pcs,
    'Remarks': r.remarks,
  }));
  const doExcel = () => {
    if (!user.can_excel) return toast.error('No excel permission');
    exportToExcel(flatRows, `${officeName}-${buyerName}-${new Date().toISOString().slice(0, 10)}`);
  };
  const doPrint = () => {
    if (!user.can_print) return toast.error('No print permission');
    const num = (n: number) => Number(n || 0).toLocaleString();
    const rowsHtml = filtered.length ? filtered.map((p, i) => {
      const { r, recvCtn, recvPcs, stockCtn, stockPcs, sample, inspection, shipment } = p;
      return `<tr>
        <td class="text-center">${i + 1}</td>
        <td>${esc(r.si_no)}</td>
        <td>${esc(fmtDate(r.entry_date))}</td>
        <td>${esc(r.challan_no)}</td>
        <td>${esc(r.po_no)}</td>
        <td>${esc(r.style)}</td>
        <td class="text-right text-recv"><b>${num(recvCtn)}</b><div class="sub">${num(recvPcs)} pcs</div></td>
        <td class="text-right text-stock"><b>${num(stockCtn)}</b><div class="sub">${num(stockPcs)} pcs</div></td>
        <td class="text-right text-sample"><b>${num(sample.ctn)}</b><div class="sub">${num(sample.pcs)} pcs</div></td>
        <td class="text-right text-sample"><b>${num(inspection.ctn)}</b><div class="sub">${num(inspection.pcs)} pcs</div></td>
        <td class="text-right text-ship"><b>${num(shipment.ctn)}</b><div class="sub">${num(shipment.pcs)} pcs</div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="11" class="text-center" style="padding:14px;color:#94a3b8">No entries</td></tr>`;

    const totals = filtered.reduce((a, p) => ({
      recvCtn: a.recvCtn + p.recvCtn, recvPcs: a.recvPcs + p.recvPcs,
      stockCtn: a.stockCtn + p.stockCtn, stockPcs: a.stockPcs + p.stockPcs,
      sampleCtn: a.sampleCtn + p.sample.ctn, samplePcs: a.samplePcs + p.sample.pcs,
      inspCtn: a.inspCtn + p.inspection.ctn, inspPcs: a.inspPcs + p.inspection.pcs,
      shipCtn: a.shipCtn + p.shipment.ctn, shipPcs: a.shipPcs + p.shipment.pcs,
    }), { recvCtn: 0, recvPcs: 0, stockCtn: 0, stockPcs: 0, sampleCtn: 0, samplePcs: 0, inspCtn: 0, inspPcs: 0, shipCtn: 0, shipPcs: 0 });

    const body = `
      <style>
        td .sub{font-size:9px;color:#64748b;font-weight:500;margin-top:1px}
        .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0 14px}
        .stile{border:1px solid #cfdcec;border-radius:8px;padding:8px 10px;background:#f8fbff}
        .stile .lbl{font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:#64748b;font-weight:700}
        .stile .val{font-size:15px;font-weight:800;color:#0b1e3a;margin-top:2px}
        .stile .vsub{font-size:9px;color:#475569;margin-top:1px}
        .stile.recv{border-color:#bae6fd;background:#f0f9ff}
        .stile.stock{border-color:#bbf7d0;background:#f0fdf4}
        .stile.ship{border-color:#fed7aa;background:#fff7ed}
        .stile.sample{border-color:#e9d5ff;background:#faf5ff}
      </style>
      <div class="summary">
        <div class="stile recv"><div class="lbl">Received</div><div class="val">${num(totals.recvCtn)} CTN</div><div class="vsub">${num(totals.recvPcs)} pcs</div></div>
        <div class="stile stock"><div class="lbl">In Stock</div><div class="val">${num(totals.stockCtn)} CTN</div><div class="vsub">${num(totals.stockPcs)} pcs</div></div>
        <div class="stile sample"><div class="lbl">Sample</div><div class="val">${num(totals.sampleCtn)} CTN</div><div class="vsub">${num(totals.samplePcs)} pcs</div></div>
        <div class="stile sample"><div class="lbl">Inspection</div><div class="val">${num(totals.inspCtn)} CTN</div><div class="vsub">${num(totals.inspPcs)} pcs</div></div>
        <div class="stile ship"><div class="lbl">Shipment</div><div class="val">${num(totals.shipCtn)} CTN</div><div class="vsub">${num(totals.shipPcs)} pcs</div></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:26px" class="text-center">#</th>
          <th>SI</th>
          <th>Date</th>
          <th>Challan</th>
          <th>PO No</th>
          <th>Style</th>
          <th class="text-right">Recv</th>
          <th class="text-right">Stock</th>
          <th class="text-right">Sample</th>
          <th class="text-right">Insp.</th>
          <th class="text-right">Shipment</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>
          <td colspan="6">Total · ${filtered.length} entries</td>
          <td class="text-right">${num(totals.recvCtn)} / ${num(totals.recvPcs)}</td>
          <td class="text-right">${num(totals.stockCtn)} / ${num(totals.stockPcs)}</td>
          <td class="text-right">${num(totals.sampleCtn)} / ${num(totals.samplePcs)}</td>
          <td class="text-right">${num(totals.inspCtn)} / ${num(totals.inspPcs)}</td>
          <td class="text-right">${num(totals.shipCtn)} / ${num(totals.shipPcs)}</td>
        </tr></tfoot>
      </table>`;
    printHTML(body, `${buyerName} — Receive Report`, `${officeName} · ${buyerName} · ${filtered.length} entries`);
  };

  const esc = (s: unknown) => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));

  const doPrintRow = (p: typeof perReceive[number]) => {
    if (!user.can_print) return toast.error('No print permission');
    const { r, cs, sample, inspection, shipment, recvCtn, recvPcs, stockCtn, stockPcs, recvLocations, stockLocations } = p;

    const metaRows = [
      ['SI No', r.si_no], ['Date', fmtDate(r.entry_date)],
      ['Challan', r.challan_no], ['PO No', r.po_no],
      ['Style', r.style], ['Remarks', r.remarks],
    ].map(([k, v]) => `<tr><th style="width:30%;text-align:left">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');

    const cartonRows = cs.length ? cs.map(c => `
      <tr>
        <td>${esc(c.location)}</td><td>${esc(c.rack)}</td>
        <td class="text-right">${c.ctn_qty}</td>
        <td class="text-right">${c.pcs_per_ctn}</td>
        <td class="text-right">${(c.ctn_qty||0)*(c.pcs_per_ctn||0)}</td>
        <td>${esc(c.remarks)}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="text-center">No cartons</td></tr>`;

    const locTable = (title: string, items: {location:string;rack?:string;ctn:number;pcs:number}[], tCtn:number, tPcs:number, cls:string) => `
      <h3 class="sec">${title}</h3>
      <table><thead><tr><th>Location</th><th>Rack</th><th class="text-right">CTN</th><th class="text-right">Pcs</th></tr></thead>
      <tbody>${items.length ? items.map(l => `<tr><td>${esc(l.location)}</td><td>${esc(l.rack || '—')}</td><td class="text-right ${cls}">${l.ctn}</td><td class="text-right">${l.pcs}</td></tr>`).join('') : `<tr><td colspan="4" class="text-center">—</td></tr>`}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="text-right">${tCtn}</td><td class="text-right">${tPcs}</td></tr></tfoot></table>`;

    const issueTable = (label: string, items: RIssue[], cls: string) => `
      <h3 class="sec">${label} Issues</h3>
      <table><thead><tr><th>Date</th><th>Issued To / Dest.</th><th>Receiver</th><th>Department</th><th>Remarks</th><th class="text-right">CTN</th><th class="text-right">Pcs</th></tr></thead>
      <tbody>${items.length ? items.map(i => `<tr>
          <td>${esc(fmtDate(i.issued_at))}</td>
          <td>${esc(i.issued_to || i.destination)}</td>
          <td>${esc(i.receiver_name)}</td>
          <td>${esc(i.department || i.unit_office)}</td>
          <td>${esc(i.remarks)}</td>
          <td class="text-right ${cls}">${i.total_ctn}</td>
          <td class="text-right">${i.total_pcs}</td>
        </tr>`).join('') : `<tr><td colspan="7" class="text-center">No ${label.toLowerCase()} issues</td></tr>`}</tbody>
      <tfoot><tr><td colspan="5">Total</td><td class="text-right">${items.reduce((a,b)=>a+(b.total_ctn||0),0)}</td><td class="text-right">${items.reduce((a,b)=>a+(b.total_pcs||0),0)}</td></tr></tfoot></table>`;

    const summary = `
      <table><thead><tr><th>Received</th><th>Stock</th><th>Sample</th><th>Inspection</th><th>Shipment</th></tr></thead>
      <tbody><tr>
        <td class="text-recv">${recvCtn} CTN (${recvPcs} pcs)</td>
        <td class="text-stock">${stockCtn} CTN (${stockPcs} pcs)</td>
        <td class="text-sample">${sample.ctn} CTN (${sample.pcs} pcs)</td>
        <td class="text-sample">${inspection.ctn} CTN (${inspection.pcs} pcs)</td>
        <td class="text-ship">${shipment.ctn} CTN (${shipment.pcs} pcs)</td>
      </tr></tbody></table>`;

    const body = `
      <style>
        .meta{margin-bottom:10px}
        .meta table{font-size:11px}
        .sec{margin:14px 0 6px;font-size:12px;font-weight:700;color:#0b1e3a;
          padding-bottom:3px;border-bottom:1px solid #0b1e3a;letter-spacing:.3px;text-transform:uppercase}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      </style>
      <h3 class="sec">Entry Details</h3>
      <div class="meta"><table><tbody>${metaRows}</tbody></table></div>
      <h3 class="sec">Summary</h3>
      ${summary}
      <h3 class="sec">Received Cartons</h3>
      <table><thead><tr><th>Location</th><th>Rack</th><th class="text-right">CTN</th><th class="text-right">Pcs/CTN</th><th class="text-right">Total Pcs</th><th>Remarks</th></tr></thead>
      <tbody>${cartonRows}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="text-right">${recvCtn}</td><td></td><td class="text-right">${recvPcs}</td><td></td></tr></tfoot></table>
      <div class="grid2">
        <div>${locTable('Received by Location', recvLocations, recvCtn, recvPcs, 'text-recv')}</div>
        <div>${locTable('In-Stock by Location', stockLocations, stockCtn, stockPcs, 'text-stock')}</div>
      </div>
      ${issueTable('Sample', sample.list, 'text-sample')}
      ${issueTable('Inspection', inspection.list, 'text-sample')}
      ${issueTable('Shipment', shipment.list, 'text-ship')}
    `;

    const title = `${buyerName} — ${r.si_no || r.po_no || 'Entry'}`;
    const subtitle = `${officeName} · ${buyerName}${r.style ? ' · ' + r.style : ''} · ${fmtDate(r.entry_date)}`;
    printHTML(body, title, subtitle);
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return d; }
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0 border-2 border-primary text-primary hover:bg-primary/10 hover:text-primary" onClick={() => navigate(`/office/${officeId}`)} aria-label="Back to office">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{buyerName}</h2>
              <p className="text-[10px] tracking-tight text-muted-foreground mt-0.5 truncate">{officeName}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {user.can_print && <Button variant="outline" size="sm" onClick={doPrint} className="hover:bg-primary hover:text-primary-foreground hover:border-primary"><Printer className="h-4 w-4 mr-1.5" />Print</Button>}
            {user.can_excel && <Button variant="outline" size="sm" onClick={doExcel}><FileSpreadsheet className="h-4 w-4 mr-1.5" />Excel</Button>}
            {canManage && user.can_add && (
              <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-1.5" /><span className="hidden sm:inline">Add Receive Carton</span><span className="sm:hidden">Add</span>
              </Button>
            )}
          </div>
        </div>


        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {tiles.map(t => (
            <button key={t.label} onClick={() => setDetail({ key: t.label.includes('Recv') ? 'recv' : t.label.includes('Stock') ? 'stock' : t.label.includes('Sample') ? 'sample' : t.label.includes('Inspection') ? 'inspection' : 'shipment', label: t.label, color: t.color })} className={`stat-card ${t.ring} rounded-xl p-4 text-left`}>
              <p className="text-[11px] tracking-tight text-muted-foreground font-medium">{t.label}</p>
              <p className={`text-2xl font-bold mt-2 ${t.color}`}>
                {t.ctn.toLocaleString()} <span className="text-muted-foreground text-sm font-normal">({t.pcs.toLocaleString()})</span>
              </p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-card border border-border rounded-xl p-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search SI / Challan / PO / Style" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filter</span>
                {(from || to) && <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">{(from ? 1 : 0) + (to ? 1 : 0)}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <p className="text-xs font-semibold tracking-tight text-muted-foreground mb-3">Date range</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">From</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="w-full justify-start text-left font-normal h-9 px-3">
                        <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                        {from && isValid(parseISO(from)) ? format(parseISO(from), 'PPP') : <span className="text-muted-foreground">Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                      <CalendarPicker mode="single" selected={from && isValid(parseISO(from)) ? parseISO(from) : undefined} onSelect={(d) => setFrom(d ? format(d, 'yyyy-MM-dd') : '')} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">To</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="w-full justify-start text-left font-normal h-9 px-3">
                        <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                        {to && isValid(parseISO(to)) ? format(parseISO(to), 'PPP') : <span className="text-muted-foreground">Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                      <CalendarPicker mode="single" selected={to && isValid(parseISO(to)) ? parseISO(to) : undefined} onSelect={(d) => setTo(d ? format(d, 'yyyy-MM-dd') : '')} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {(search || from || to) && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => { setSearch(''); setFrom(''); setTo(''); }}>
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>


        <div className="bg-card border border-primary/30 rounded-xl overflow-hidden shadow-sm">
          <div id="buyer-stock-table" className="overflow-x-auto">
            <Table className="[&_th]:border-2 [&_th]:border-primary/40 [&_th]:py-3 [&_th]:px-3 [&_td]:border-2 [&_td]:border-primary/30 [&_td]:py-3 [&_td]:px-3">
              <TableHeader>
                <TableRow className="border-primary/30 hover:bg-transparent bg-primary/10">
                  <TableHead className="text-[11px] tracking-tight font-semibold w-[110px] min-w-[100px] max-w-[120px]">Date</TableHead>
                  <TableHead className="text-[11px] tracking-tight font-semibold">SI</TableHead>
                  <TableHead className="text-[11px] tracking-tight font-semibold">PO No</TableHead>
                  <TableHead className="text-[11px] tracking-tight font-semibold">Style No</TableHead>
                  <TableHead className="text-[11px] tracking-tight font-semibold">Challan</TableHead>
                  <TableHead className="text-[11px] tracking-tight font-semibold text-right">Recv CTN (Pcs)</TableHead>
                  <TableHead className="text-[11px] tracking-tight font-semibold text-right">Stock CTN (Pcs)</TableHead>

                  <TableHead className="text-[11px] tracking-tight font-semibold text-center">Action</TableHead>
                </TableRow>
              </TableHeader>


              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No entries</TableCell></TableRow>
                ) : filtered.map((p) => { const { r, cs, recvCtn, recvPcs, stockCtn, stockPcs, sample, inspection, shipment, recvLocations, stockLocations } = p; return (
                  <TableRow key={r.id} id={`recv-row-${r.id}`} className="border-primary/15 transition-all hover:bg-primary/5 odd:bg-primary/[0.03] group/row">
                    <TableCell className="text-[10px] sm:text-xs w-[110px] min-w-[100px] max-w-[120px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <DateAuditPopover date={r.entry_date} receiveId={r.id} />
                        {(r.updated_at || r.created_at) && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-semibold text-primary whitespace-nowrap cursor-help"
                            title={new Date(r.updated_at || r.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short', hour12: true })}
                          >
                            <span className="h-1 w-1 rounded-full bg-primary" />
                            {new Date(r.updated_at || r.created_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', hour12: true })}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><span className="text-[10px] sm:text-sm font-medium whitespace-nowrap">{r.si_no || '—'}</span></TableCell>
                    <TableCell className="text-[10px] sm:text-sm">
                      <button onClick={() => openEditReceive(r, cs)} className="text-left hover:text-primary hover:underline cursor-pointer whitespace-nowrap" title="Click to add / edit carton receive">
                        {r.po_no || <span className="text-muted-foreground italic">+ Add</span>}
                      </button>
                    </TableCell>
                    <TableCell className="text-[10px] sm:text-sm">
                      <button onClick={() => openEditReceive(r, cs)} className="text-left hover:text-primary hover:underline cursor-pointer whitespace-nowrap" title="Click to add / edit carton receive">
                        {r.style || <span className="text-muted-foreground italic">+ Add</span>}
                      </button>
                    </TableCell>
                    <TableCell className="text-[10px] sm:text-sm whitespace-nowrap">{r.challan_no || '—'}</TableCell>


                    <TableCell className="text-right">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex flex-col items-end leading-tight hover:scale-105 transition cursor-pointer group">
                            <span className="text-base font-extrabold text-recv group-hover:underline tabular-nums">{recvCtn}<span className="text-[10px] font-medium text-muted-foreground ml-1">CTN</span></span>
                            <span className="text-xs font-semibold text-foreground/70 tabular-nums">{recvPcs}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">pcs</span></span>
                          </button>

                        </PopoverTrigger>

                        <PopoverContent align="end" className="w-[min(95vw,560px)] p-0 overflow-hidden border-2 border-recv shadow-2xl ring-2 ring-recv/40">
                          <div className="bg-gradient-to-r from-recv/15 via-recv/5 to-transparent px-3 py-2 border-b border-border flex items-center justify-between">
                            <p className="text-xs font-bold flex items-center gap-1.5 text-recv uppercase tracking-wide"><MapPin className="h-3.5 w-3.5" /> Received Locations</p>

                          </div>
                          {recvLocations.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-3 py-4 text-center">No locations</p>
                          ) : (
                            <div className="max-h-72 overflow-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead className="bg-muted/40 sticky top-0">
                                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    <th className="text-left font-semibold px-3 py-1.5 border-2 border-recv/60">Location</th>
                                    <th className="text-left font-semibold px-2 py-2.5 border-2 border-recv/60">Rack</th>
                                    <th className="text-right font-semibold px-3 py-1.5 border-2 border-recv/60">CTN / Pcs</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recvLocations.map((l, idx) => (
                                    <tr key={`${l.location}-${l.rack}-${idx}`} className="hover:bg-muted/30">
                                      <td className="px-3 py-2.5 font-medium truncate max-w-[110px] border-2 border-recv/50">{l.location}</td>
                                      <td className="px-2 py-2.5 border-2 border-recv/50">
                                        {l.rack ? <span className="text-recv font-semibold text-[10px]">{l.rack}</span> : <span className="text-muted-foreground">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-right whitespace-nowrap border-2 border-recv/50">
                                        <span className="font-bold text-recv">{l.ctn}</span>
                                        <span className="text-muted-foreground"> / {l.pcs}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-muted/30 sticky bottom-0">
                                  <tr className="font-bold">
                                    <td className="px-3 py-1.5 border-2 border-recv/60" colSpan={2}>Total</td>
                                    <td className="px-3 py-1.5 text-right whitespace-nowrap text-recv border-2 border-recv/60">{recvCtn} <span className="text-muted-foreground font-normal">/ {recvPcs}</span></td>
                                  </tr>
                                </tfoot>
                              </table>

                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell className="text-right">

                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex flex-col items-end leading-tight hover:scale-105 transition cursor-pointer group">
                            <span className={`text-base font-extrabold ${stockCtn > 0 ? 'text-stock' : 'text-muted-foreground'} group-hover:underline tabular-nums`}>{stockCtn}<span className="text-[10px] font-medium text-muted-foreground ml-1">CTN</span></span>
                            <span className="text-xs font-semibold text-foreground/70 tabular-nums">{stockPcs}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">pcs</span></span>
                          </button>

                        </PopoverTrigger>

                        <PopoverContent align="end" className="w-[min(95vw,560px)] p-0 overflow-hidden border-2 border-stock shadow-2xl ring-2 ring-stock/40">
                          <div className="bg-gradient-to-r from-stock/15 via-stock/5 to-transparent px-3 py-2 border-b border-border flex items-center justify-between">
                            <p className="text-xs font-bold flex items-center gap-1.5 text-stock uppercase tracking-wide"><MapPin className="h-3.5 w-3.5" /> Stock Locations</p>

                          </div>
                          {stockLocations.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-3 py-4 text-center">Out of stock — no items remaining</p>
                          ) : (
                            <div className="max-h-72 overflow-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead className="bg-muted/40 sticky top-0">
                                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    <th className="text-left font-semibold px-3 py-1.5 border-2 border-stock/60">Location</th>
                                    <th className="text-left font-semibold px-2 py-2.5 border-2 border-stock/60">Rack</th>
                                    <th className="text-right font-semibold px-3 py-1.5 border-2 border-stock/60">CTN / Pcs</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stockLocations.map((l, idx) => (
                                    <tr key={`${l.location}-${l.rack}-${idx}`} className="hover:bg-muted/30">
                                      <td className="px-3 py-2.5 font-medium truncate max-w-[110px] border-2 border-stock/50">{l.location}</td>
                                      <td className="px-2 py-2.5 border-2 border-stock/50">
                                        {l.rack ? <span className="text-stock font-semibold text-[10px]">{l.rack}</span> : <span className="text-muted-foreground">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-right whitespace-nowrap border-2 border-stock/50">
                                        <span className="font-bold text-stock">{l.ctn}</span>
                                        <span className="text-muted-foreground"> / {l.pcs}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-muted/30 sticky bottom-0">
                                  <tr className="font-bold">
                                    <td className="px-3 py-1.5 border-2 border-stock/60" colSpan={2}>Total</td>
                                    <td className="px-3 py-1.5 text-right whitespace-nowrap text-stock border-2 border-stock/60">{stockCtn} <span className="text-muted-foreground font-normal">/ {stockPcs}</span></td>
                                  </tr>
                                </tfoot>
                              </table>

                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </TableCell>





                    <TableCell className="text-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Action">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>

                        <PopoverContent align="end" className="w-72 p-2">
                          {/* Issue History summary */}
                          <div className="px-2 pt-1 pb-2">
                            <p className="text-[11px] font-semibold tracking-tight text-muted-foreground mb-1.5 flex items-center gap-1.5">
                              <History className="h-3 w-3" /> Issue History
                            </p>
                            <div className="space-y-1 text-xs">
                              <button onClick={() => openHistoryDialog(r, 'sample')} className="w-full flex justify-between items-center px-1.5 py-1 rounded hover:bg-muted cursor-pointer"><span className="text-sample font-medium">Sample</span><span>{sample.ctn} CTN ({sample.pcs} pcs)</span></button>
                              <button onClick={() => openHistoryDialog(r, 'inspection')} className="w-full flex justify-between items-center px-1.5 py-1 rounded hover:bg-muted cursor-pointer"><span className="text-sample font-medium">Inspection</span><span>{inspection.ctn} CTN ({inspection.pcs} pcs)</span></button>
                              <button onClick={() => openHistoryDialog(r, 'shipment')} className="w-full flex justify-between items-center px-1.5 py-1 rounded hover:bg-muted cursor-pointer"><span className="text-ship font-medium">Shipment</span><span>{shipment.ctn} CTN ({shipment.pcs} pcs)</span></button>
                              <div className="flex justify-between border-t border-border pt-1 px-1.5 font-semibold"><span>Total</span><span>{sample.ctn + inspection.ctn + shipment.ctn} CTN ({sample.pcs + inspection.pcs + shipment.pcs} pcs)</span></div>
                            </div>
                          </div>
                          <div className="border-t border-border my-1"></div>
                          {canManage && user.can_edit && (
                            <>
                              <p className="px-3 pt-1 pb-1 text-[10px] tracking-tight text-muted-foreground">
                                Issue {stockCtn <= 0 && <span className="text-destructive">· Out of stock · edit/return allowed</span>}
                              </p>
                              <button onClick={() => openIssuesDialog(r, 'sample')} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                                <FlaskConical className="h-3.5 w-3.5 text-sample" /> Issue Sample
                              </button>
                              <button onClick={() => openIssuesDialog(r, 'inspection')} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                                <ClipboardCheck className="h-3.5 w-3.5 text-sample" /> Issue Inspection
                              </button>
                              <button onClick={() => openIssuesDialog(r, 'shipment')} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                                <Send className="h-3.5 w-3.5 text-ship" /> Issue Shipment
                              </button>
                              <div className="border-t border-border my-1"></div>
                              <button onClick={() => openEditReceive(r, cs)} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                                <PencilLine className="h-3.5 w-3.5 text-stock" /> Add / Edit Carton
                              </button>
                            </>
                          )}
                          {user.can_print && (
                            <button onClick={() => doPrintRow(p)} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                              <Printer className="h-3.5 w-3.5" /> Print
                            </button>
                          )}
                          {user.can_excel && (
                            <button onClick={doExcel} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                            </button>
                          )}
                          {canManage && user.can_delete && (
                            <button onClick={() => removeReceive(r)} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted text-destructive">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </TableCell>

                  </TableRow>
                ); })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Receive add/edit dialog */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
              <PackageCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <span className="truncate">
                {editingReceive ? 'Edit Receive Entry' : (
                  <>
                    <span className="sm:hidden">Add Receive Carton — {buyerName}</span>
                    <span className="hidden sm:inline">Add Receive Carton Information — {buyerName}</span>
                  </>
                )}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className="text-xs">SI No</label><Input value={rForm.si_no} onChange={e => setRForm({ ...rForm, si_no: e.target.value })} placeholder="SI-001" /></div>
            <div><label className="text-xs">Date *</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start text-left font-normal h-9 px-3">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    {rForm.entry_date && isValid(parseISO(rForm.entry_date)) ? format(parseISO(rForm.entry_date), 'PPP') : <span className="text-muted-foreground">Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <CalendarPicker mode="single" selected={rForm.entry_date && isValid(parseISO(rForm.entry_date)) ? parseISO(rForm.entry_date) : undefined} onSelect={(d) => setRForm({ ...rForm, entry_date: d ? format(d, 'yyyy-MM-dd') : '' })} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div><label className="text-xs">Challan</label><Input value={rForm.challan_no} onChange={e => setRForm({ ...rForm, challan_no: e.target.value })} placeholder="Challan / Ref" /></div>
            <div><label className="text-xs">PO No <span className="text-destructive">*</span></label><Input value={rForm.po_no} onChange={e => setRForm({ ...rForm, po_no: e.target.value })} required /></div>
            <div className="md:col-span-2"><label className="text-xs">Style <span className="text-destructive">*</span></label><Input value={rForm.style} onChange={e => setRForm({ ...rForm, style: e.target.value })} required /></div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
              <p className="text-sm font-semibold">Carton Rows</p>
              <Button size="sm" variant="outline" onClick={addCartonRow}><Plus className="h-3 w-3 mr-1" /> Add Carton</Button>
            </div>
            {/* Desktop / tablet: table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr className="text-[11px] tracking-tight text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">CTN Qty <span className="text-destructive">*</span></th>
                    <th className="px-2 py-1.5 text-left">Every CTN Pcs <span className="text-destructive">*</span></th>
                    <th className="px-2 py-1.5 text-right">Total Pcs</th>
                    <th className="px-2 py-1.5 text-left">Location <span className="text-destructive">*</span></th>
                    <th className="px-2 py-1.5 text-left">Rack</th>
                    <th className="px-2 py-1.5 text-left">Remarks</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rCartonsDraft.map((c, i) => {
                    const isEditing = c.editing !== false;
                    const isUnsaved = !c.id;
                    const canShowEdit = isUnsaved || !!user.can_edit;
                    const canShowDelete = isUnsaved || !!user.can_delete;
                    return (
                    <tr key={i} className="border-2 border-primary/40 [&>td]:border [&>td]:border-primary/30">

                      <td className="px-2 py-1.5">{isEditing
                        ? <Input type="number" min={0} className="h-8 w-20" value={c.ctn_qty || ''} placeholder="0" onChange={e => updateCartonRow(i, 'ctn_qty', e.target.value === '' ? 0 : Number(e.target.value))} />
                        : <span className="text-sm font-medium">{c.ctn_qty}</span>}</td>
                      <td className="px-2 py-1.5">{isEditing
                        ? <Input type="number" min={0} className="h-8 w-24" value={c.pcs_per_ctn || ''} placeholder="0" onChange={e => updateCartonRow(i, 'pcs_per_ctn', e.target.value === '' ? 0 : Number(e.target.value))} />
                        : <span className="text-sm font-medium">{c.pcs_per_ctn}</span>}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-primary">{(Number(c.ctn_qty) && Number(c.pcs_per_ctn)) ? (Number(c.ctn_qty) * Number(c.pcs_per_ctn)).toLocaleString() : <span className="text-muted-foreground font-normal">—</span>}</td>
                      <td className="px-2 py-1.5">{isEditing
                        ? <Input className="h-8" value={c.location} onChange={e => updateCartonRow(i, 'location', e.target.value)} placeholder="Location" />
                        : <span className="text-sm">{c.location || '—'}</span>}</td>
                      <td className="px-2 py-1.5">{isEditing
                        ? <Input className="h-8" value={c.rack} onChange={e => updateCartonRow(i, 'rack', e.target.value)} placeholder="Rack / Shelf" />
                        : <span className="text-sm">{c.rack || '—'}</span>}</td>
                      <td className="px-2 py-1.5">{isEditing
                        ? <Input className="h-8" value={c.remarks} onChange={e => updateCartonRow(i, 'remarks', e.target.value)} />
                        : <span className="text-sm text-muted-foreground">{c.remarks || '—'}</span>}</td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={() => { setCartonRowEditing(i, false); saveReceive({ keepOpen: true }); }}>Done</Button>
                          ) : (
                            <>
                              {canShowEdit && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => setCartonRowEditing(i, true)} title="Edit row"><PencilLine className="h-3.5 w-3.5" /></Button>
                              )}
                              {canShowDelete && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCartonRow(i)} title="Delete row"><Trash2 className="h-3.5 w-3.5" /></Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
                <tfoot className="bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-2 py-2">{draftTotals.ctn} CTN</td>
                    <td></td>
                    <td className="px-2 py-2 text-right text-primary">{draftTotals.pcs} pcs</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile: stacked cards */}
            <div className="md:hidden space-y-3 p-2">
              {rCartonsDraft.map((c, i) => {
                const isEditing = c.editing !== false;
                const isUnsaved = !c.id;
                const canShowEdit = isUnsaved || !!user.can_edit;
                const canShowDelete = isUnsaved || !!user.can_delete;
                const total = (Number(c.ctn_qty) && Number(c.pcs_per_ctn)) ? Number(c.ctn_qty) * Number(c.pcs_per_ctn) : 0;
                const accent = isEditing ? 'border-primary/60 bg-primary/5 shadow-sm shadow-primary/10' : 'border-border bg-card';
                return (
                  <div key={i} className={`rounded-xl border-2 ${accent} p-3 space-y-2 relative`}>
                    <span className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tracking-wide">ROW {i + 1}</span>
                    <div className="flex items-center justify-end">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <Button variant="default" size="sm" className="h-7 px-3 text-xs" onClick={() => { setCartonRowEditing(i, false); saveReceive({ keepOpen: true }); }}>Done</Button>
                        ) : (
                          <>
                            {canShowEdit && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => setCartonRowEditing(i, true)}><PencilLine className="h-4 w-4" /></Button>
                            )}
                            {canShowDelete && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCartonRow(i)}><Trash2 className="h-4 w-4" /></Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">CTN Qty <span className="text-destructive">*</span></label>
                        {isEditing
                          ? <Input type="number" inputMode="numeric" min={0} className="h-9" value={c.ctn_qty || ''} placeholder="0" onChange={e => updateCartonRow(i, 'ctn_qty', e.target.value === '' ? 0 : Number(e.target.value))} />
                          : <div className="text-sm font-medium py-1.5">{c.ctn_qty}</div>}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Every CTN Pcs <span className="text-destructive">*</span></label>
                        {isEditing
                          ? <Input type="number" inputMode="numeric" min={0} className="h-9" value={c.pcs_per_ctn || ''} placeholder="0" onChange={e => updateCartonRow(i, 'pcs_per_ctn', e.target.value === '' ? 0 : Number(e.target.value))} />
                          : <div className="text-sm font-medium py-1.5">{c.pcs_per_ctn}</div>}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Location <span className="text-destructive">*</span></label>
                        {isEditing
                          ? <Input className="h-9" value={c.location} onChange={e => updateCartonRow(i, 'location', e.target.value)} placeholder="Location" />
                          : <div className="text-sm py-1.5">{c.location || '—'}</div>}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Rack</label>
                        {isEditing
                          ? <Input className="h-9" value={c.rack} onChange={e => updateCartonRow(i, 'rack', e.target.value)} placeholder="Rack / Shelf" />
                          : <div className="text-sm py-1.5">{c.rack || '—'}</div>}
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] uppercase text-muted-foreground">Remarks</label>
                        {isEditing
                          ? <Input className="h-9" value={c.remarks} onChange={e => updateCartonRow(i, 'remarks', e.target.value)} />
                          : <div className="text-sm text-muted-foreground py-1.5">{c.remarks || '—'}</div>}
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-border/60">
                      <span className="text-[11px] uppercase text-muted-foreground">Total Pcs</span>
                      <span className="text-sm font-semibold text-primary">{total ? total.toLocaleString() : '—'}</span>
                    </div>
                  </div>
                );
              })}
              <div className="p-3 flex justify-between items-center bg-muted/30 font-semibold text-sm">
                <span>{draftTotals.ctn} CTN</span>
                <span className="text-primary">{draftTotals.pcs} pcs</span>
              </div>
            </div>
          </div>


          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>Cancel</Button>
            <Button onClick={() => saveReceive()}>{editingReceive ? 'Update' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issues dialog */}
      {issuesFor && (
        <IssuesDialog
          open={issuesOpen}
          onOpenChange={(b) => { setIssuesOpen(b); if (!b) setIssuesAutoHistory(false); }}
          autoOpenHistory={issuesAutoHistory}
          receive={issuesFor.receive}
          type={issuesFor.type}
          existing={issues.filter(i => i.receive_id === issuesFor.receive.id && i.issue_type === issuesFor.type)}
          cartons={cartons.filter(c => c.receive_id === issuesFor.receive.id)}
          allIssues={issues.filter(i => i.receive_id === issuesFor.receive.id)}
          onReload={load}
          userId={user.id}
          appUser={user}
          officeName={officeName}
          buyerName={buyerName}
          routeFor={routeFor}
          canEdit={canManage && !!user.can_edit}
          canDelete={canManage && !!user.can_delete}
        />
      )}

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setDetailSearch(''); setDetailBorderColor(''); } }}>

        <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-2xl lg:max-w-3xl p-0 overflow-hidden bg-card text-foreground">
          {detail && (() => {
            const hslByKey: Record<string, string> = isLight ? {
              recv: '220 85% 42%',
              stock: '160 80% 30%',
              sample: '280 70% 42%',
              inspection: '280 70% 42%',
              shipment: '28 95% 40%',
            } : {
              recv: '210 95% 68%',
              stock: '160 75% 55%',
              sample: '280 75% 70%',
              inspection: '280 75% 70%',
              shipment: '28 95% 62%',
            };
            const hsl = hslByKey[detail.key] || (isLight ? '220 90% 45%' : '220 90% 70%');
            const hexToRgb = (hex: string) => {
              const h = hex.replace('#', '');
              const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
              return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
            };
            const useCustom = !!detailBorderColor;
            const border = useCustom ? detailBorderColor : `hsl(${hsl})`;
            const alpha = (a: number) => {
              if (useCustom) {
                const { r, g, b } = hexToRgb(detailBorderColor);
                return `rgba(${r}, ${g}, ${b}, ${a})`;
              }
              return `hsl(${hsl} / ${a})`;
            };
            const tintHeader = alpha(isLight ? 0.12 : 0.24);
            const tintSoft = alpha(isLight ? 0.1 : 0.2);
            const allRows = getLocationMap(detail.key) as Array<{ style: string; po: string; location: string; rack: string; current?: string; ctn: number; pcs: number }>;
            const q = detailSearch.trim().toLowerCase();
            const rows = q
              ? allRows.filter(r =>
                  r.location.toLowerCase().includes(q) ||
                  (r.rack || '').toLowerCase().includes(q) ||
                  (r.current || '').toLowerCase().includes(q) ||
                  (r.style || '').toLowerCase().includes(q) ||
                  (r.po || '').toLowerCase().includes(q))
              : allRows;
            const showTwoLoc = detail.key === 'sample' || detail.key === 'inspection' || detail.key === 'shipment';
            const totalCtn = rows.reduce((a, b) => a + b.ctn, 0);
            const totalPcs = rows.reduce((a, b) => a + b.pcs, 0);
            const num = (n: number) => Number(n || 0).toLocaleString();
            const kpiClass = ({ recv: 'k-recv', stock: 'k-stock', sample: 'k-sample', inspection: 'k-sample', shipment: 'k-ship' } as Record<string, string>)[detail.key] || '';
            return (
              <>
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b bg-card text-foreground" style={{ background: `linear-gradient(135deg, ${tintHeader}, hsl(var(--card)))`, borderColor: border }}>
                  <DialogHeader>
                    <div className="flex items-center justify-between gap-2 pr-8">
                      <DialogTitle className="text-sm sm:text-xl text-left" style={{ color: border }}>{detail?.label} — by Location</DialogTitle>
                      {user.can_print && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-xs bg-background text-foreground hover:!bg-muted hover:!text-foreground"
                          style={{ borderColor: border }}
                          onClick={() => {
                            const colCount = showTwoLoc ? 7 : 6;
                            const labelSpan = showTwoLoc ? 5 : 4;
                            const body = `
                              <div class="kpis">
                                <div class="kpi ${kpiClass}"><div class="lbl">Total CTN</div><div class="val">${num(totalCtn)}</div><div class="sub">${rows.length} location${rows.length === 1 ? '' : 's'}</div></div>
                                <div class="kpi ${kpiClass}"><div class="lbl">Total Pcs</div><div class="val">${num(totalPcs)}</div><div class="sub">pieces</div></div>
                                <div class="kpi"><div class="lbl">Buyer</div><div class="val" style="font-size:13px">${buyerName}</div><div class="sub">${detail.label}</div></div>
                              </div>
                              <div class="tablewrap"><table>
                                <thead><tr>
                                  <th>Style</th>
                                  <th>PO</th>
                                  <th>${showTwoLoc ? 'Previous Location' : 'Location'}</th>
                                  <th>Rack</th>
                                  ${showTwoLoc ? '<th>Current Location</th>' : ''}
                                  <th class="text-right">CTN</th>
                                  <th class="text-right">Pcs</th>
                                </tr></thead>
                                <tbody>
                                  ${rows.length === 0
                                    ? `<tr><td colspan="${colCount}" class="text-center" style="padding:14px;color:#94a3b8">No data</td></tr>`
                                    : rows.map((l) => `
                                      <tr>
                                        <td><b>${l.style}</b></td>
                                        <td>${l.po}</td>
                                        <td><b>${l.location}</b></td>
                                        <td>${l.rack || '—'}</td>
                                        ${showTwoLoc ? `<td><b>${l.current || '—'}</b></td>` : ''}
                                        <td class="text-right"><b>${num(l.ctn)}</b></td>
                                        <td class="text-right">${num(l.pcs)}</td>
                                      </tr>`).join('')}
                                </tbody>
                                <tfoot><tr>
                                  <td colspan="${labelSpan}">Total · ${rows.length} row${rows.length === 1 ? '' : 's'}</td>
                                  <td class="text-right">${num(totalCtn)} CTN</td>
                                  <td class="text-right">${num(totalPcs)} pcs</td>
                                </tr></tfoot>
                              </table></div>`;
                            printHTML(body, `${detail.label} — by Location`, `${officeName} · ${buyerName}`);
                          }}
                        >
                          <Printer className="h-3.5 w-3.5 mr-1" />Print
                        </Button>
                      )}
                    </div>
                  </DialogHeader>
                  <div className="mt-3 rounded-lg border-2 bg-background text-foreground px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: border, background: `linear-gradient(135deg, ${alpha(isLight ? 0.08 : 0.16)}, hsl(var(--background)))` }}>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold text-foreground/75">Total</p>
                      <span className="text-[10px] text-foreground/60">· {rows.length} location{rows.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-5 tabular-nums">
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg sm:text-2xl font-bold" style={{ color: border }}>{num(totalCtn)}</span>
                        <span className="text-[10px] sm:text-xs font-semibold text-foreground/70">CTN</span>
                      </div>
                      <span className="text-foreground/30">|</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg sm:text-2xl font-bold text-foreground">{num(totalPcs)}</span>
                        <span className="text-[10px] sm:text-xs font-semibold text-foreground/70">Pcs</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/50 pointer-events-none" />
                      <Input
                        value={detailSearch}
                        onChange={(e) => setDetailSearch(e.target.value)}
                        placeholder="Search style, PO, location, or rack..."
                        className="h-8 pl-7 text-xs bg-background"
                        style={{ borderColor: border }}
                      />
                    </div>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-2 sm:p-4 bg-background text-foreground">
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {rows.length === 0 ? (
                      <div className="text-center text-muted-foreground py-6 text-xs">No data</div>
                    ) : rows.map((l, i) => (
                      <div key={`${l.style}-${l.po}-${l.location}-${l.current || ''}-${i}`} className="rounded-lg border-2 p-2.5 bg-card text-foreground" style={{ borderColor: border }}>
                        <div className="flex items-center justify-end gap-2 mb-1.5">
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            <span className="text-[10px] font-semibold text-foreground" title="Style">S: {l.style}</span>
                            <span className="text-[10px] font-semibold text-foreground" title="PO">PO: {l.po}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <button type="button" onClick={() => goToLocation(l.location)} className="font-semibold text-[10px] hover:underline cursor-pointer" style={{ color: border }} title="Go to this location's row">{l.location}</button>
                          {l.rack && (
                            <span className="text-[10px] font-semibold text-foreground/80" title="Rack">· Rack: {l.rack}</span>
                          )}
                          {showTwoLoc && (
                            <>
                              <span className="text-foreground/70 text-[10px]">→</span>
                              <span className="font-semibold text-[10px] text-foreground">{l.current || '—'}</span>
                            </>
                          )}
                        </div>
                        <div className="flex justify-between text-[11px] tabular-nums">
                          <span><span className="text-foreground/75">CTN:</span> <span className="font-bold" style={{ color: border }}>{num(l.ctn)}</span></span>
                          <span><span className="text-foreground/75">Pcs:</span> <span className="font-bold text-foreground">{num(l.pcs)}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <table className="hidden sm:table w-full text-sm bg-card" style={{ borderCollapse: 'collapse' }}>
                    <thead className="sticky top-0" style={{ background: tintSoft }}>
                      <tr className="text-[11px] tracking-tight uppercase" style={{ color: border }}>
                        
                        <th className="px-3 py-2 text-left border" style={{ borderColor: border }}>Style</th>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: border }}>PO</th>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: border }}>{showTwoLoc ? 'Previous Location' : 'Location'}</th>
                        <th className="px-3 py-2 text-left border" style={{ borderColor: border }}>Rack</th>
                        {showTwoLoc && <th className="px-3 py-2 text-left border" style={{ borderColor: border }}>Current Location</th>}
                        <th className="px-3 py-2 text-right border" style={{ borderColor: border }}>CTN</th>
                        <th className="px-3 py-2 text-right border" style={{ borderColor: border }}>Pcs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={showTwoLoc ? 7 : 6} className="px-3 py-6 text-center text-foreground/70 border bg-card" style={{ borderColor: border }}>No data</td></tr>
                      ) : rows.map((l, i) => (
                        <tr key={`${l.style}-${l.po}-${l.location}-${l.rack}-${l.current || ''}-${i}`} className="bg-card hover:opacity-95">
                          {/* serial removed */}
                          <td className="px-3 py-2 border font-semibold text-foreground" style={{ borderColor: border }}>{l.style}</td>
                          <td className="px-3 py-2 border text-foreground" style={{ borderColor: border }}>{l.po}</td>
                          <td className="px-3 py-2 border" style={{ borderColor: border }}>
                            <button type="button" onClick={() => goToLocation(l.location)} className="font-semibold text-[11px] hover:underline cursor-pointer" style={{ color: border }} title="Go to this location's row">{l.location}</button>
                          </td>
                          <td className="px-3 py-2 border text-foreground" style={{ borderColor: border }}>{l.rack || '—'}</td>
                          {showTwoLoc && (
                            <td className="px-3 py-2 border" style={{ borderColor: border }}>
                              <span className="font-semibold text-[11px] text-foreground">{l.current || '—'}</span>
                            </td>
                          )}
                          <td className="px-3 py-2 border text-right font-bold tabular-nums" style={{ borderColor: border, color: border }}>{num(l.ctn)}</td>
                          <td className="px-3 py-2 border text-right font-semibold tabular-nums text-foreground" style={{ borderColor: border }}>{num(l.pcs)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="font-bold" style={{ background: `${alpha(0.18)}` }}>
                      <tr>
                        <td colSpan={showTwoLoc ? 5 : 4} className="px-3 py-2 border text-foreground" style={{ borderColor: border }}>Total · {rows.length} row{rows.length === 1 ? '' : 's'}</td>
                        <td className="px-3 py-2 border text-right tabular-nums" style={{ borderColor: border, color: border }}>{num(totalCtn)}</td>
                        <td className="px-3 py-2 border text-right tabular-nums text-foreground" style={{ borderColor: border }}>{num(totalPcs)}</td>
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

// ---------- Issues Dialog ----------
interface RIssueLine {
  id: string; issue_id: string; source_carton_id: string | null;
  ctn_qty: number; pcs_per_ctn: number; returned_ctn: number; returned_pcs: number; remarks: string | null;
}
interface IDProps {
  open: boolean; onOpenChange: (b: boolean) => void;
  receive: Receive; type: IssueType; existing: RIssue[];
  cartons: RCarton[]; allIssues: RIssue[];
  onReload: () => void; userId: string; canEdit: boolean; canDelete: boolean;
  appUser: AppUser; officeName: string; buyerName: string;
  routeFor: (rid: string) => string;
  autoOpenHistory?: boolean;
}
const TYPE_LABEL: Record<IssueType, string> = { sample: 'Sample', inspection: 'Inspection', shipment: 'Shipment' };

const blankHeader = () => ({
  issued_at: new Date().toISOString().slice(0, 10), remarks: '', issued_to: '',
  destination: '', receiver_name: '', designation: '', department: '', unit_office: '',
  port: '', truck_no: '', driver_name: '', driver_mobile: '', lock_no: '', export_by: '', ar_desh: '',
});
type Header = ReturnType<typeof blankHeader>;
type DraftLine = { id?: string; source_carton_id: string; ctn_qty: number; pcs_per_ctn: number; returned_ctn: number; returned_pcs: number; remarks: string; editing?: boolean };

const IssuesDialog = ({ open, onOpenChange, receive, type, existing, cartons, allIssues, onReload, userId, canEdit, canDelete, appUser, officeName, buyerName, routeFor, autoOpenHistory }: IDProps) => {
  type View = 'list' | 'form' | 'view';
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [header, setHeader] = useState<Header>(blankHeader());
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [issueLines, setIssueLines] = useState<Record<string, RIssueLine[]>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<Array<{ id: string; action: string; created_at: string; changed_by_name: string | null; details: Record<string, unknown> | null }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const savingRef = useRef(false);
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('carton_history')
      .select('id, action, created_at, changed_by_name, details, hidden_by')
      .eq('office_id', receive.office_id)
      .order('created_at', { ascending: false })
      .limit(500);
    const uid = appUser?.id;
    const rows = (data || []).filter(r => {
      const d = (r.details as Record<string, unknown> | null) || {};
      if (d.receive_id !== receive.id || d.issue_type !== type) return false;
      const h = Array.isArray((r as { hidden_by?: unknown }).hidden_by) ? ((r as { hidden_by: string[] }).hidden_by) : [];
      return !uid || !h.includes(uid);
    }) as typeof historyEntries;
    setHistoryEntries(rows);
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (open && autoOpenHistory && !historyOpen) {
      openHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoOpenHistory]);

  const hideHistoryForMe = async (ids: string[]) => {
    if (!appUser || ids.length === 0) return;
    const { data } = await supabase.from('carton_history').select('id, hidden_by').in('id', ids);
    await Promise.all((data || []).map(row => {
      const arr = Array.isArray((row as { hidden_by?: unknown }).hidden_by) ? ((row as { hidden_by: string[] }).hidden_by) : [];
      if (arr.includes(appUser.id)) return Promise.resolve();
      return supabase.from('carton_history').update({ hidden_by: [...arr, appUser.id] } as never).eq('id', (row as { id: string }).id);
    }));
  };
  const issueVersionKey = useMemo(
    () => allIssues.map(i => `${i.id}:${i.total_ctn}:${i.total_pcs}`).sort().join('|'),
    [allIssues]
  );

  // Reset view only when dialog actually opens
  useEffect(() => {
    if (!open) return;
    setView('list'); setEditingId(null); setViewingId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load lines for all issues belonging to this receive whenever the set changes
  useEffect(() => {
    if (!open) return;
    if (allIssues.length === 0) { setIssueLines({}); return; }
    supabase.from('receive_issue_lines').select('*').in('issue_id', allIssues.map(i => i.id))
      .then(({ data }) => {
        const grouped: Record<string, RIssueLine[]> = {};
        ((data as RIssueLine[]) || []).forEach(l => {
          (grouped[l.issue_id] ||= []).push(l);
        });
        setIssueLines(grouped);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, issueVersionKey]);

  // Available CTN per source carton: carton.ctn_qty - sum(open issue lines.ctn_qty - returned)
  const availableForCarton = (cartonId: string, excludeLineIds: string[] = [], excludeDraftIdx: number | null = null, ignoreDrafts = false) => {
    const c = cartons.find(x => x.id === cartonId);
    if (!c) return 0;
    let used = 0;
    for (const ls of Object.values(issueLines)) {
      for (const l of ls) {
        if (l.source_carton_id !== cartonId) continue;
        if (excludeLineIds.includes(l.id)) continue;
        used += Math.max((l.ctn_qty || 0) - (l.returned_ctn || 0), 0);
      }
    }
    if (!ignoreDrafts) {
      // Also subtract unsaved draft lines (in this dialog) that point to the same carton,
      // so adding multiple "Done" rows can never exceed available stock.
      lines.forEach((l, idx) => {
        if (l.source_carton_id !== cartonId) return;
        if (excludeDraftIdx !== null && idx === excludeDraftIdx) return;
        if (l.id && excludeLineIds.includes(l.id)) return; // already counted via DB rows
        if (l.id) return; // saved lines are already in issueLines
        used += Math.max((Number(l.ctn_qty) || 0) - (Number(l.returned_ctn) || 0), 0);
      });
    }
    return Math.max(c.ctn_qty - used, 0);
  };

  // For opening a fresh add form — ignore stale draft lines that haven't been saved.
  const firstAvailableCarton = (ignoreDrafts = false) => cartons.find(c => availableForCarton(c.id, [], null, ignoreDrafts) > 0);

  const openAdd = () => {
    if (!canEdit) return toast.error('No permission');
    const c = firstAvailableCarton(true);
    if (!c) return toast.error('No Available stock at any location. Cannot create new issue.');
    setEditingId(null); setHeader(blankHeader());
    setLines([{ source_carton_id: c.id, ctn_qty: availableForCarton(c.id, [], null, true), pcs_per_ctn: c.pcs_per_ctn || 0, returned_ctn: 0, returned_pcs: 0, remarks: '', editing: true }]);
    setView('form');
  };
  const openEdit = (i: RIssue) => {
    if (!canEdit) return toast.error('No permission');
    setEditingId(i.id);
    setHeader({
      issued_at: i.issued_at.slice(0, 10), remarks: i.remarks || '', issued_to: i.issued_to || '',
      destination: i.destination || '', receiver_name: i.receiver_name || '', designation: i.designation || '',
      department: i.department || '', unit_office: i.unit_office || '',
      port: i.port || '', truck_no: i.truck_no || '', driver_name: i.driver_name || '',
      driver_mobile: i.driver_mobile || '', lock_no: i.lock_no || '', export_by: i.export_by || '', ar_desh: i.ar_desh || '',
    });
    const ls = issueLines[i.id] || [];
    setLines(ls.length === 0
      ? [{ source_carton_id: cartons[0]?.id || '', ctn_qty: 1, pcs_per_ctn: cartons[0]?.pcs_per_ctn || 0, returned_ctn: 0, returned_pcs: 0, remarks: '', editing: true }]
      : ls.map(l => ({ id: l.id, source_carton_id: l.source_carton_id || '', ctn_qty: l.ctn_qty, pcs_per_ctn: l.pcs_per_ctn, returned_ctn: l.returned_ctn, returned_pcs: l.returned_pcs, remarks: l.remarks || '', editing: false })));
    setView('form');
  };
  const openView = (i: RIssue) => { setViewingId(i.id); setView('view'); };

  const addLine = () => {
    const c = firstAvailableCarton();
    if (!c) return toast.error('No Available stock at any location to add a new line.');
    setLines([{ source_carton_id: c.id, ctn_qty: availableForCarton(c.id), pcs_per_ctn: c.pcs_per_ctn || 0, returned_ctn: 0, returned_pcs: 0, remarks: '', editing: true }, ...lines]);
  };
  const removeLine = async (i: number) => {
    const l = lines[i];
    const msg = l?.id
      ? 'Are you sure you want to delete this line? This will be removed permanently when you save.'
      : 'Are you sure you want to delete this line?';
    if (!(await confirmDialog({ title: 'Delete Line', description: msg }))) return;
    setLines(lines.filter((_, idx) => idx !== i));
    toast.success('Line removed');
  };

  const setLineEditing = (i: number, editing: boolean) => setLines(lines.map((l, idx) => idx === i ? { ...l, editing } : l));
  const tryFinishLine = (i: number): boolean => {
    const l = lines[i];
    if (!l) return false;
    if (!l.source_carton_id) { toast.error('Pick a source location'); return false; }
    if (Number(l.ctn_qty) <= 0 || Number(l.pcs_per_ctn) <= 0) { toast.error('CTN & Pcs/CTN required'); return false; }
    const avail = availableForCarton(l.source_carton_id, l.id ? [l.id] : [], i);
    const need = Number(l.ctn_qty) - Number(l.returned_ctn || 0);
    if (need > avail) {
      const c = cartons.find(x => x.id === l.source_carton_id);
      toast.error(`Only ${avail} CTN available at "${c?.location || 'this location'}". Reduce the quantity.`);
      return false;
    }
    return true;
  };
  const updateLine = (i: number, k: keyof DraftLine, v: string | number) => setLines(lines.map((l, idx) => {
    if (idx !== i) return l;
    const next = { ...l, [k]: v } as DraftLine;
    if (k === 'source_carton_id') {
      const c = cartons.find(x => x.id === v);
      if (c) {
        next.pcs_per_ctn = c.pcs_per_ctn;
        const avail = availableForCarton(String(v), l.id ? [l.id] : [], i);
        next.ctn_qty = avail; // auto-fill with available CTN
      }
    }
    // Clamp ctn_qty to available — user can decrease, never exceed available.
    if (k === 'ctn_qty') {
      const avail = availableForCarton(next.source_carton_id, l.id ? [l.id] : [], i);
      const num = Math.max(0, Number(v || 0));
      if (num > avail) {
        toast.error(`Only ${avail} CTN available at this location`);
        next.ctn_qty = avail;
      } else {
        next.ctn_qty = num;
      }
    }
    // When the user enters Return CTN, auto-fill Return Pcs = returned_ctn * pcs_per_ctn
    if (k === 'returned_ctn') {
      next.returned_pcs = Number(v || 0) * Number(next.pcs_per_ctn || 0);
    }
    if (k === 'pcs_per_ctn' && next.returned_ctn) {
      next.returned_pcs = Number(next.returned_ctn || 0) * Number(v || 0);
    }
    return next;
  }));


  const draftTotals = {
    ctn: lines.reduce((a, l) => a + Math.max(Number(l.ctn_qty || 0) - Number(l.returned_ctn || 0), 0), 0),
    pcs: lines.reduce((a, l) => a + Math.max(Number(l.ctn_qty || 0) * Number(l.pcs_per_ctn || 0) - Number(l.returned_pcs || 0), 0), 0),
  };

  const save = async (opts?: { keepOpen?: boolean }) => {
    if (savingRef.current) return;
    if (lines.length === 0) return toast.error('Add at least one carton line');
    if (lines.some(l => !l.source_carton_id)) return toast.error('Each line needs a source location');
    if (lines.some(l => l.ctn_qty <= 0 || l.pcs_per_ctn <= 0)) return toast.error('CTN & Pcs/CTN required on every line');
    if (type === 'sample') {
      if (!header.destination?.trim()) return toast.error('Destination is required for Sample issue');
      if (!header.receiver_name?.trim()) return toast.error('Receiver Name is required for Sample issue');
      if (!header.department?.trim()) return toast.error('Department is required for Sample issue');
      if (!header.unit_office?.trim()) return toast.error('Unit / Office is required for Sample issue');
    }
    if (type === 'inspection') {
      if (!header.issued_at?.trim()) return toast.error('Date is required for Inspection issue');
      if (!header.destination?.trim()) return toast.error('Destination is required for Inspection issue');
      if (!header.receiver_name?.trim()) return toast.error('Receiver Name is required for Inspection issue');
      if (!header.driver_mobile?.trim()) return toast.error('Receiver Phone is required for Inspection issue');
      if (!header.designation?.trim()) return toast.error('Designation is required for Inspection issue');
      if (!header.department?.trim()) return toast.error('Department is required for Inspection issue');
      if (!header.unit_office?.trim()) return toast.error('Unit / Office is required for Inspection issue');
    }
    if (type === 'shipment') {
      if (!header.port?.trim()) return toast.error('Destination Port is required for Shipment');
      if (!header.truck_no?.trim()) return toast.error('Truck No is required for Shipment');
      if (!header.driver_name?.trim()) return toast.error('Driver Name is required for Shipment');
      if (!header.driver_mobile?.trim()) return toast.error('Driver Mobile is required for Shipment');
      if (!header.lock_no?.trim()) return toast.error('Lock No is required for Shipment');
    }
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx];
      const avail = availableForCarton(l.source_carton_id, l.id ? [l.id] : [], idx);
      if (Number(l.ctn_qty) - Number(l.returned_ctn || 0) > avail) {
        const c = cartons.find(x => x.id === l.source_carton_id);
        return toast.error(`Only ${avail} CTN available at "${c?.location || 'this location'}"`);
      }
    }
    savingRef.current = true;
    try {
    const headerPayload = {
      receive_id: receive.id, issue_type: type,
      issued_at: new Date(header.issued_at).toISOString(),
      issued_to: header.issued_to || null, remarks: header.remarks || null,
      destination: header.destination || null, receiver_name: header.receiver_name || null,
      designation: header.designation || null, department: header.department || null,
      unit_office: header.unit_office || null,
      port: header.port || null, truck_no: header.truck_no || null,
      driver_name: header.driver_name || null, driver_mobile: header.driver_mobile || null,
      lock_no: header.lock_no || null, export_by: header.export_by || null, ar_desh: header.ar_desh || null,
    };
    const currentEditingId = editingIdRef.current;
    let issueId = currentEditingId;
    const wasUpdate = !!currentEditingId;
    if (currentEditingId) {
      const { error } = await supabase.from('receive_issues').update(headerPayload).eq('id', currentEditingId);
      if (error) return toast.error(error.message);
      const keep = lines.map(l => l.id).filter(Boolean) as string[];
      const existingLs = issueLines[currentEditingId] || [];
      const toDel = existingLs.filter(l => !keep.includes(l.id)).map(l => l.id);
      if (toDel.length) await supabase.from('receive_issue_lines').delete().in('id', toDel);
    } else {
      const { data, error } = await supabase.from('receive_issues').insert({ ...headerPayload, created_by: userId, ctn_qty: 0, pcs_per_ctn: 0 }).select('id').single();
      if (error) return toast.error(error.message);
      issueId = data.id;
      editingIdRef.current = issueId;
      setEditingId(issueId);
    }
    const updatedLines: typeof lines = [];
    for (const l of lines) {
      const row = {
        issue_id: issueId!, source_carton_id: l.source_carton_id || null,
        ctn_qty: Number(l.ctn_qty), pcs_per_ctn: Number(l.pcs_per_ctn),
        returned_ctn: Number(l.returned_ctn || 0), returned_pcs: Number(l.returned_pcs || 0),
        remarks: (l.remarks || '').trim() || null,
      };
      if (l.id) {
        await supabase.from('receive_issue_lines').update(row).eq('id', l.id);
        updatedLines.push({ ...l, editing: false });
      } else {
        const { data: ins } = await supabase.from('receive_issue_lines').insert(row).select('id').single();
        updatedLines.push({ ...l, id: ins?.id, editing: false });
      }
    }
    setLines(updatedLines);
    setIssueLines(prev => ({
      ...prev,
      [issueId!]: updatedLines.map(l => ({
        id: l.id || '',
        issue_id: issueId!,
        source_carton_id: l.source_carton_id || null,
        ctn_qty: Number(l.ctn_qty || 0),
        pcs_per_ctn: Number(l.pcs_per_ctn || 0),
        returned_ctn: Number(l.returned_ctn || 0),
        returned_pcs: Number(l.returned_pcs || 0),
        remarks: (l.remarks || '').trim() || null,
      })),
    }));
    toast.success('Saved');
    if (!opts?.keepOpen) setView('list');
    const totalCtn = updatedLines.reduce((a, l) => a + Math.max(Number(l.ctn_qty || 0) - Number(l.returned_ctn || 0), 0), 0);
    const totalPcs = updatedLines.reduce((a, l) => a + Math.max(Number(l.ctn_qty || 0) * Number(l.pcs_per_ctn || 0) - Number(l.returned_pcs || 0), 0), 0);
    const returnedCtn = updatedLines.reduce((a, l) => a + Number(l.returned_ctn || 0), 0);
    const returnedPcs = updatedLines.reduce((a, l) => a + Number(l.returned_pcs || 0), 0);
    const fullyReturned = wasUpdate && totalCtn === 0 && totalPcs === 0 && returnedCtn > 0;
    const actionLabel = fullyReturned ? 'Returned' : (wasUpdate ? 'Updated' : 'Issued');
    await logHistoryAndNotify({
      user: appUser, officeId: receive.office_id, officeName,
      cartonId: null, cartonNo: receive.challan_no || receive.si_no || 'entry',
      action: wasUpdate ? 'updated' : 'issued',
      message: `${actionLabel} ${TYPE_LABEL[type]} for ${buyerName} (PO: ${receive.po_no || '—'}, Style: ${receive.style || '—'})`,
      details: {
        receive_id: receive.id, issue_type: type, si_no: receive.si_no, po_no: receive.po_no, style_no: receive.style, buyer: buyerName,
        issued_at: header.issued_at,
        destination: header.destination, receiver_name: header.receiver_name,
        designation: header.designation, department: header.department, unit_office: header.unit_office,
        issued_to: header.issued_to, remarks: header.remarks,
        port: header.port, truck_no: header.truck_no, driver_name: header.driver_name,
        driver_mobile: header.driver_mobile, lock_no: header.lock_no, export_by: header.export_by, ar_desh: header.ar_desh,
        total_ctn: totalCtn, total_pcs: totalPcs,
        returned_ctn: returnedCtn, returned_pcs: returnedPcs,
        fully_returned: fullyReturned,
      },
      route: routeFor(receive.id),
    });
    onReload();
    } finally {
      savingRef.current = false;
    }
  };

  const remove = async (id: string) => {
    if (!canDelete) return toast.error('No delete permission');
    if (!await confirmDialog({ description: 'Delete this issue and all its lines?' })) return;
    try { await softDelete('receive_issues', [id], { user: appUser }); }
    catch (e) { return toast.error((e as Error).message); }
    toast.success('Deleted');
    await logHistoryAndNotify({
      user: appUser, officeId: receive.office_id, officeName,
      cartonId: null, cartonNo: receive.challan_no || receive.si_no || 'entry',
      action: 'deleted',
      message: `Deleted ${TYPE_LABEL[type]} for ${buyerName} (PO: ${receive.po_no || '—'}, Style: ${receive.style || '—'})`,
      details: { receive_id: receive.id, issue_type: type, si_no: receive.si_no, po_no: receive.po_no, style_no: receive.style, buyer: buyerName },
      route: routeFor(receive.id),
    });
    onReload();
  };


  // Hide fully-returned issues from list (totals = 0) — they remain visible in View History
  const visible = existing.filter(i => (i.total_ctn || 0) > 0 || (i.total_pcs || 0) > 0);
  const totalSummary = {
    ctn: visible.reduce((a, b) => a + (b.total_ctn || 0), 0),
    pcs: visible.reduce((a, b) => a + (b.total_pcs || 0), 0),
  };

  const isShipment = type === 'shipment';
  const isInspection = type === 'inspection';

  const viewing = viewingId ? existing.find(i => i.id === viewingId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[90vh] overflow-y-auto text-xs sm:text-sm [&>button[type=button]]:bg-destructive [&>button[type=button]]:text-destructive-foreground [&>button[type=button]]:opacity-100 [&>button[type=button]]:rounded-md [&>button[type=button]]:p-1 [&>button[type=button]]:shadow-md [&>button[type=button]]:ring-2 [&>button[type=button]]:ring-destructive/30 [&>button[type=button]]:hover:bg-destructive/90 ${autoOpenHistory ? 'hidden' : ''}`}>
        <DialogHeader className="space-y-2">
          {view === 'list' && (
            <div className="flex gap-2 flex-wrap">
              {canEdit && (
                <Button size="sm" onClick={openAdd} className="h-8 px-3 text-[11px] sm:text-sm font-semibold"><Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" /> Add {TYPE_LABEL[type]}</Button>
              )}
              <Button size="sm" variant="outline" onClick={openHistory} className="h-8 px-3 text-[11px] sm:text-sm font-semibold"><History className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" /> View History</Button>
            </div>
          )}

          <DialogTitle className="flex flex-row items-center gap-2 pr-8 text-[13px] sm:text-base">
            {view !== 'list' && (
              <Button size="icon" variant="default" onClick={() => setView('list')} className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md ring-2 ring-primary/30" aria-label="Back to History"><ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></Button>
            )}
            <span className="text-left flex-1 min-w-0 truncate">Issue {TYPE_LABEL[type]} — {receive.challan_no || receive.si_no || 'Entry'}</span>
          </DialogTitle>
        </DialogHeader>



        {view === 'list' && (
          <>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] tracking-tight">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-left">{isShipment ? 'Destination / Truck' : 'Destination / Receiver'}</th>
                    <th className="px-2 py-1.5 text-right">CTN</th>
                    <th className="px-2 py-1.5 text-right">Pcs</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No {TYPE_LABEL[type]} issues yet</td></tr>
                  ) : visible.map(i => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="px-2 py-1.5 text-xs">{new Date(i.issued_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {isShipment
                          ? `${i.port || '—'}${i.truck_no ? ` · ${i.truck_no}` : ''}`
                          : `${i.destination || '—'}${i.receiver_name ? ` · ${i.receiver_name}` : ''}`}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">{i.total_ctn}</td>
                      <td className="px-2 py-1.5 text-right text-primary font-semibold">{i.total_pcs}</td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openView(i)} title="View"><History className="h-3 w-3" /></Button>
                          {canEdit && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(i)} title="Edit / Return"><PencilLine className="h-3 w-3" /></Button>}
                          {canDelete && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(i.id)} title="Delete"><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-semibold">
                  <tr>
                    <td colSpan={2} className="px-2 py-2 text-xs font-semibold">Total</td>
                    <td className="px-2 py-2 text-right">{totalSummary.ctn}</td>
                    <td className="px-2 py-2 text-right text-primary">{totalSummary.pcs}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">Tip: Edit an issue to {isInspection || type === 'sample' ? 'mark returned' : 'mark missing/returned'} cartons — stock at that location goes back up automatically.</p>
          </>
        )}

        {view === 'form' && (
          <div className="space-y-4">
            {/* Header fields by type */}
            {isShipment ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div><label className="text-xs">Destination Port<span className="text-destructive"> *</span></label><Input required value={header.port} onChange={e => setHeader({ ...header, port: e.target.value })} /></div>
                <div><label className="text-xs">Truck No<span className="text-destructive"> *</span></label><Input required value={header.truck_no} onChange={e => setHeader({ ...header, truck_no: e.target.value })} /></div>
                <div>
                  <label className="text-xs">Date</label>
                  <div className="relative">
                    <Input type="date" className="pr-9" value={header.issued_at} onChange={e => setHeader({ ...header, issued_at: e.target.value })} ref={(el) => { if (el) (el as HTMLInputElement & { _dp?: HTMLInputElement })._dp = el; }} />
                    <button type="button" onClick={(e) => { const inp = (e.currentTarget.previousSibling as HTMLInputElement); try { inp?.showPicker?.(); } catch { /* cross-origin */ } inp?.focus(); inp?.click(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80" aria-label="Open calendar"><Calendar className="h-4 w-4" /></button>
                  </div>
                </div>
                <div><label className="text-xs">Driver Name<span className="text-destructive"> *</span></label><Input required value={header.driver_name} onChange={e => setHeader({ ...header, driver_name: e.target.value })} /></div>
                <div><label className="text-xs">Driver Mobile<span className="text-destructive"> *</span></label><Input required type="tel" inputMode="tel" value={header.driver_mobile} onChange={e => setHeader({ ...header, driver_mobile: e.target.value })} /></div>
                <div><label className="text-xs">Lock No<span className="text-destructive"> *</span></label><Input required value={header.lock_no} onChange={e => setHeader({ ...header, lock_no: e.target.value })} /></div>
                <div><label className="text-xs">Export By</label><Input value={header.export_by} onChange={e => setHeader({ ...header, export_by: e.target.value })} /></div>
                <div><label className="text-xs">AR / Desh</label><Input value={header.ar_desh} onChange={e => setHeader({ ...header, ar_desh: e.target.value })} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {isInspection && <div><label className="text-xs">Designation<span className="text-destructive"> *</span></label><Input required value={header.designation} onChange={e => setHeader({ ...header, designation: e.target.value })} /></div>}
                <div><label className="text-xs">Destination{(type === 'sample' || isInspection) && <span className="text-destructive"> *</span>}</label><Input required={type === 'sample' || isInspection} value={header.destination} onChange={e => setHeader({ ...header, destination: e.target.value })} /></div>
                <div><label className="text-xs">Receiver Name{(type === 'sample' || isInspection) && <span className="text-destructive"> *</span>}</label><Input required={type === 'sample' || isInspection} value={header.receiver_name} onChange={e => setHeader({ ...header, receiver_name: e.target.value })} /></div>
                <div><label className="text-xs">Receiver Phone{isInspection && <span className="text-destructive"> *</span>}</label><Input required={isInspection} type="tel" inputMode="tel" value={header.driver_mobile} onChange={e => setHeader({ ...header, driver_mobile: e.target.value })} /></div>
                <div>
                  <label className="text-xs">Date{isInspection && <span className="text-destructive"> *</span>}</label>
                  <div className="relative">
                    <Input required={isInspection} type="date" className="pr-9" value={header.issued_at} onChange={e => setHeader({ ...header, issued_at: e.target.value })} />
                    <button type="button" onClick={(e) => { const inp = (e.currentTarget.previousSibling as HTMLInputElement); try { inp?.showPicker?.(); } catch { /* cross-origin */ } inp?.focus(); inp?.click(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80" aria-label="Open calendar"><Calendar className="h-4 w-4" /></button>
                  </div>
                </div>
                <div><label className="text-xs">Department{(type === 'sample' || isInspection) && <span className="text-destructive"> *</span>}</label><Input required={type === 'sample' || isInspection} value={header.department} onChange={e => setHeader({ ...header, department: e.target.value })} /></div>
                <div><label className="text-xs">Unit / Office{(type === 'sample' || isInspection) && <span className="text-destructive"> *</span>}</label><Input required={type === 'sample' || isInspection} value={header.unit_office} onChange={e => setHeader({ ...header, unit_office: e.target.value })} /></div>
              </div>
            )}


            {/* Lines: pick from carton locations */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 bg-muted/40 px-3 py-2">
                <Button size="sm" variant="outline" onClick={addLine} className="h-7 sm:h-8 px-2 text-[11px] sm:text-xs"><Plus className="h-3 w-3 mr-1" /> Add Carton</Button>
                <p className="text-sm font-semibold">Carton Lines (pick from locations)</p>
              </div>
              <div>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/20 text-[11px] tracking-tightd-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Location <span className="text-destructive">*</span></th>
                        <th className="px-2 py-1.5 text-left">CTN <span className="text-destructive">*</span></th>
                        <th className="px-2 py-1.5 text-left">Every CTN Pcs <span className="text-destructive">*</span></th>
                        <th className="px-2 py-1.5 text-right">Total Pcs</th>
                        {type !== 'shipment' && <th className="px-2 py-1.5 text-left">Return CTN</th>}
                        {type !== 'shipment' && <th className="px-2 py-1.5 text-left">Return Pcs</th>}
                        {type !== 'shipment' && <th className="px-2 py-1.5 text-left">Remarks</th>}

                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const avail = availableForCarton(l.source_carton_id, l.id ? [l.id] : []);
                        const isEd = l.editing !== false;
                        const ctn = cartons.find(c => c.id === l.source_carton_id);
                        const locLabel = ctn ? `${ctn.location || 'No location'}${ctn.rack ? ' · ' + ctn.rack : ''}` : '—';
                        return (
                          <tr key={i} className="border-t border-border">
                            <td className="px-2 py-1.5">
                              {isEd ? (
                                <Select value={l.source_carton_id} onValueChange={(v) => updateLine(i, 'source_carton_id', v)}>
                                  <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Pick" /></SelectTrigger>
                                  <SelectContent>
                                    {cartons.map(c => (
                                      <SelectItem key={c.id} value={c.id} className="focus:bg-accent focus:text-accent-foreground">
                                        <span className="font-medium">{c.location || 'No location'}</span>
                                        {c.rack ? <span className="opacity-70"> · {c.rack}</span> : null}
                                        <span className="opacity-70"> — {c.ctn_qty} CTN × {c.pcs_per_ctn} pcs = {(c.ctn_qty * c.pcs_per_ctn).toLocaleString()} pcs</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm font-medium">{locLabel}</span>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-0.5">Available: {avail} CTN{ctn ? ` · ${ctn.pcs_per_ctn} pcs/CTN` : ''}</p>
                            </td>
                            <td className="px-2 py-1.5">{isEd
                              ? <Input type="number" className="h-8 w-20" value={l.ctn_qty} onChange={e => updateLine(i, 'ctn_qty', Number(e.target.value))} />
                              : <span className="text-sm">{l.ctn_qty}</span>}</td>
                            <td className="px-2 py-1.5">{isEd
                              ? <Input type="number" className="h-8 w-20" value={l.pcs_per_ctn} onChange={e => updateLine(i, 'pcs_per_ctn', Number(e.target.value))} />
                              : <span className="text-sm">{l.pcs_per_ctn}</span>}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-primary">{((Number(l.ctn_qty) || 0) * (Number(l.pcs_per_ctn) || 0)).toLocaleString()}</td>
                            {type !== 'shipment' && <td className="px-2 py-1.5">{isEd
                              ? <Input type="number" className="h-8 w-20" value={l.returned_ctn} onChange={e => updateLine(i, 'returned_ctn', Number(e.target.value))} />
                              : <span className="text-sm">{l.returned_ctn}</span>}</td>}
                            {type !== 'shipment' && <td className="px-2 py-1.5">{isEd
                              ? <Input type="number" className="h-8 w-20" value={l.returned_pcs} onChange={e => updateLine(i, 'returned_pcs', Number(e.target.value))} />
                              : <span className="text-sm">{l.returned_pcs}</span>}</td>}
                            {type !== 'shipment' && <td className="px-2 py-1.5">{isEd
                              ? <Input className="h-8 w-40" placeholder="why returned?" value={l.remarks} onChange={e => updateLine(i, 'remarks', e.target.value)} />
                              : <span className="text-sm text-muted-foreground">{l.remarks || '—'}</span>}</td>}

                            <td className="px-2 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isEd ? (
                                  <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={() => { if (!tryFinishLine(i)) return; setLineEditing(i, false); save({ keepOpen: true }); }}>Done</Button>
                                ) : (
                                  (!l.id || canEdit) && <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => setLineEditing(i, true)} title="Edit"><PencilLine className="h-3.5 w-3.5" /></Button>
                                )}
                                {(isEd || !l.id) && (!l.id || canDelete) && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(i)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="px-2 py-2 text-xs font-semibold">Net Total</td>
                        <td className="px-2 py-2">{draftTotals.ctn} CTN</td>
                        <td></td>
                        <td className="px-2 py-2 text-right text-primary">{draftTotals.pcs} pcs</td>
                        <td colSpan={type === 'shipment' ? 1 : 4}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile stacked lines */}
                <div className="md:hidden space-y-3 p-2">
                  {lines.map((l, i) => {
                    const avail = availableForCarton(l.source_carton_id, l.id ? [l.id] : []);
                    const isEd = l.editing !== false;
                    const ctn = cartons.find(c => c.id === l.source_carton_id);
                    const locLabel = ctn ? `${ctn.location || 'No location'}${ctn.rack ? ' · ' + ctn.rack : ''}` : '—';
                    const accent = isEd ? 'border-primary/60 bg-primary/5 shadow-sm shadow-primary/10' : 'border-border bg-card';
                    return (
                      <div key={i} className={`rounded-xl border-2 ${accent} p-3 space-y-2 relative`}>
                        <span className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tracking-wide">LINE {i + 1}</span>
                        <div className="flex items-center justify-end gap-1">
                          {isEd ? (
                            <Button variant="default" size="sm" className="h-7 px-3 text-xs" onClick={() => { if (!tryFinishLine(i)) return; setLineEditing(i, false); save({ keepOpen: true }); }}>Done</Button>
                          ) : (
                            (!l.id || canEdit) && <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => setLineEditing(i, true)}><PencilLine className="h-4 w-4" /></Button>
                          )}
                          {(isEd || !l.id) && (!l.id || canDelete) && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>}
                        </div>

                        <div>
                          <label className="text-[10px] uppercase text-muted-foreground">Location <span className="text-destructive">*</span></label>
                          {isEd ? (
                            <Select value={l.source_carton_id} onValueChange={(v) => updateLine(i, 'source_carton_id', v)}>
                            <SelectTrigger className="h-9 w-full text-xs text-foreground"><SelectValue placeholder="Pick location" /></SelectTrigger>
                              <SelectContent className="max-w-[calc(100vw-2rem)] bg-popover text-popover-foreground">
                                {cartons.map(c => (
                                  <SelectItem key={c.id} value={c.id} className="text-xs focus:bg-accent focus:text-accent-foreground">
                                    <div className="flex flex-col gap-0.5 max-w-full">
                                      <span className="font-semibold truncate">{(c.location || 'No location')}{c.rack ? ` · ${c.rack}` : ''}</span>
                                      <span className="text-[10px] opacity-70 truncate">{c.ctn_qty} CTN × {c.pcs_per_ctn} = {(c.ctn_qty * c.pcs_per_ctn).toLocaleString()} pcs</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>

                            </Select>

                          ) : (
                            <div className="text-sm font-medium py-1.5">{locLabel}</div>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Available: {avail} CTN</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase text-muted-foreground">CTN <span className="text-destructive">*</span></label>
                            {isEd
                              ? <Input type="number" inputMode="numeric" className="h-9 w-full" value={l.ctn_qty} onChange={e => updateLine(i, 'ctn_qty', Number(e.target.value))} />
                              : <div className="text-sm font-medium py-1.5">{l.ctn_qty}</div>}
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-muted-foreground">Every CTN Pcs <span className="text-destructive">*</span></label>

                            {isEd
                              ? <Input type="number" inputMode="numeric" className="h-9 w-full" value={l.pcs_per_ctn} onChange={e => updateLine(i, 'pcs_per_ctn', Number(e.target.value))} />
                              : <div className="text-sm font-medium py-1.5">{l.pcs_per_ctn}</div>}
                          </div>
                          {type !== 'shipment' && (
                            <div>
                              <label className="text-[10px] uppercase text-muted-foreground">Return CTN</label>
                              {isEd
                                ? <Input type="number" inputMode="numeric" className="h-9 w-full" value={l.returned_ctn} onChange={e => updateLine(i, 'returned_ctn', Number(e.target.value))} />
                                : <div className="text-sm py-1.5">{l.returned_ctn}</div>}
                            </div>
                          )}
                          {type !== 'shipment' && (
                            <div>
                              <label className="text-[10px] uppercase text-muted-foreground">Return Pcs</label>
                              {isEd
                                ? <Input type="number" inputMode="numeric" className="h-9 w-full" value={l.returned_pcs} onChange={e => updateLine(i, 'returned_pcs', Number(e.target.value))} />
                                : <div className="text-sm py-1.5">{l.returned_pcs}</div>}
                            </div>
                          )}
                          {type !== 'shipment' && (
                            <div className="col-span-2">
                              <label className="text-[10px] uppercase text-muted-foreground">Return Remarks</label>
                              {isEd
                                ? <Input className="h-9 w-full" placeholder="why returned?" value={l.remarks} onChange={e => updateLine(i, 'remarks', e.target.value)} />
                                : <div className="text-sm py-1.5 text-muted-foreground">{l.remarks || '—'}</div>}
                            </div>
                          )}

                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border/60">
                          <span className="text-[11px] uppercase text-muted-foreground">Total</span>
                          <span className="text-sm font-semibold text-primary">{((Number(l.ctn_qty) || 0) * (Number(l.pcs_per_ctn) || 0)).toLocaleString()} pcs</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs">Remarks</label>
              <Textarea value={header.remarks} onChange={e => setHeader({ ...header, remarks: e.target.value })} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
              <Button onClick={() => save()}>{editingId ? 'Update' : `Save ${TYPE_LABEL[type]}`}</Button>
            </DialogFooter>
          </div>
        )}

        {view === 'view' && viewing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm bg-muted/20 rounded-lg p-3">
              <div><span className="text-muted-foreground text-xs">Date</span><p>{new Date(viewing.issued_at).toLocaleString('en-GB')}</p></div>
              {isShipment ? (
                <>
                  <div><span className="text-muted-foreground text-xs">Port</span><p>{viewing.port || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Truck No</span><p>{viewing.truck_no || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Driver</span><p>{viewing.driver_name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Mobile</span><p>{viewing.driver_mobile || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Lock No</span><p>{viewing.lock_no || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Export By</span><p>{viewing.export_by || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">AR / Desh</span><p>{viewing.ar_desh || '—'}</p></div>
                </>
              ) : (
                <>
                  <div><span className="text-muted-foreground text-xs">Destination</span><p>{viewing.destination || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Receiver</span><p>{viewing.receiver_name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Receiver Phone</span><p>{viewing.driver_mobile || '—'}</p></div>

                  {isInspection && <div><span className="text-muted-foreground text-xs">Designation</span><p>{viewing.designation || '—'}</p></div>}
                  <div><span className="text-muted-foreground text-xs">Department</span><p>{viewing.department || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Unit / Office</span><p>{viewing.unit_office || '—'}</p></div>
                </>
              )}
              {viewing.remarks && <div className="md:col-span-3"><span className="text-muted-foreground text-xs">Remarks</span><p>{viewing.remarks}</p></div>}
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] tracking-tight">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Location</th>
                    <th className="px-2 py-1.5 text-right">CTN</th>
                    <th className="px-2 py-1.5 text-right">Pcs/CTN</th>
                    <th className="px-2 py-1.5 text-right">Returned CTN</th>
                    <th className="px-2 py-1.5 text-right">Returned Pcs</th>
                    <th className="px-2 py-1.5 text-right">Net Pcs</th>
                  </tr>
                </thead>
                <tbody>
                  {(issueLines[viewing.id] || []).map(l => {
                    const c = cartons.find(x => x.id === l.source_carton_id);
                    return (
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-2 py-1.5 text-xs">{c?.location || '—'}</td>
                        <td className="px-2 py-1.5 text-right">{l.ctn_qty}</td>
                        <td className="px-2 py-1.5 text-right">{l.pcs_per_ctn}</td>
                        <td className="px-2 py-1.5 text-right text-stock">{l.returned_ctn}</td>
                        <td className="px-2 py-1.5 text-right text-stock">{l.returned_pcs}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-primary">{Math.max(l.ctn_qty * l.pcs_per_ctn - l.returned_pcs, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
      <Dialog open={historyOpen} onOpenChange={(o) => { setHistoryOpen(o); if (!o) { setHistorySearch(''); if (autoOpenHistory) onOpenChange(false); } }}>
        <DialogContent className="max-w-2xl lg:max-w-5xl xl:max-w-6xl max-h-[85vh] overflow-y-auto text-xs sm:text-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base pr-10">
              {!autoOpenHistory && (
                <Button size="icon" variant="outline" className="h-7 w-7 flex-shrink-0 border-2 border-primary text-primary hover:bg-primary/10 hover:text-primary" title="Back" onClick={() => { setHistoryOpen(false); setHistorySearch(''); }}><ArrowLeft className="h-3.5 w-3.5" /></Button>
              )}
              <span className="flex items-center gap-2 flex-1 min-w-0"><History className="h-4 w-4" /> {TYPE_LABEL[type]} History — {receive.challan_no || receive.si_no || 'Entry'}</span>
              {historyEntries.length > 0 && (
                <Button size="sm" variant="destructive" className="h-7 px-2 text-[11px] font-bold mr-2 flex-shrink-0" title="Clear All" onClick={async () => {
                  if (!await confirmDialog({ description: `Clear all ${historyEntries.length} history entries from your view?` })) return;
                  try { await hideHistoryForMe(historyEntries.map(h => h.id)); }
                  catch (e) { return toast.error((e as Error).message); }
                  setHistoryEntries([]);
                }}><Trash2 className="h-3 w-3 mr-1" />Clear</Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Search receiver, destination, PO, action…" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
          </div>
          {historyLoading ? (
            <p className="text-center text-muted-foreground py-6">Loading…</p>
          ) : historyEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No history yet</p>
          ) : (
            <ul className="space-y-2">
              {historyEntries.filter(h => {
                const q = historySearch.trim().toLowerCase();
                if (!q) return true;
                const d = (h.details as Record<string, unknown>) || {};
                return JSON.stringify({ a: h.action, by: h.changed_by_name, ...d }).toLowerCase().includes(q);
              }).map(h => {
                const d = (h.details as Record<string, unknown>) || {};
                const isShip = type === 'shipment';
                const fullyReturned = !!d.fully_returned;
                const label = fullyReturned ? `Fully Returned ${TYPE_LABEL[type]}`
                  : h.action === 'issued' ? `Issued ${TYPE_LABEL[type]}`
                  : h.action === 'updated' ? `Updated / Partial Return ${TYPE_LABEL[type]}`
                  : h.action === 'deleted' ? `Deleted ${TYPE_LABEL[type]}`
                  : h.action;
                const rows: Array<[string, unknown]> = isShip
                  ? [['Port', d.port], ['Truck', d.truck_no], ['Driver', d.driver_name], ['Driver Mobile', d.driver_mobile], ['Lock No', d.lock_no], ['Export By', d.export_by], ['AR/Desh', d.ar_desh]]
                  : [['Destination', d.destination], ['Receiver', d.receiver_name], ['Phone', d.driver_mobile], ['Designation', d.designation], ['Department', d.department], ['Unit/Office', d.unit_office], ['Issued To', d.issued_to]];
                const issuedAt = d.issued_at ? new Date(String(d.issued_at)) : null;
                const issuedCtn = Number(d.total_ctn || 0) + Number(d.returned_ctn || 0);
                const issuedPcs = Number(d.total_pcs || 0) + Number(d.returned_pcs || 0);
                const styleCls = fullyReturned
                  ? 'border-emerald-500 bg-emerald-500/15'
                  : h.action === 'deleted' ? 'border-destructive bg-destructive/15'
                  : h.action === 'updated' ? 'border-amber-500 bg-amber-500/15'
                  : 'border-sky-500 bg-sky-500/10';
                const canDeleteHist = true;
                const printOne = () => {
                  const esc = (s: unknown) => String(s ?? '—').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
                  const detailRows = rows.filter(([, v]) => v).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
                  const body = `
                    <h3 style="margin:0 0 8px">${esc(label)}</h3>
                    <p style="margin:0 0 8px;color:#555">by ${esc(h.changed_by_name)} · ${esc(new Date(h.created_at).toLocaleString('en-GB'))}</p>
                    <table style="border-collapse:collapse;width:100%;font-size:12px">
                      ${issuedAt ? `<tr><td><b>Date</b></td><td>${esc(issuedAt.toLocaleDateString('en-GB'))} ${esc(issuedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))} (${esc(issuedAt.toLocaleDateString('en-GB', { weekday: 'long' }))})</td></tr>` : ''}
                      ${detailRows}
                      <tr><td><b>Issued CTN / Pcs</b></td><td>${issuedCtn} / ${issuedPcs}</td></tr>
                      <tr><td><b>Remaining CTN / Pcs</b></td><td>${Number(d.total_ctn || 0)} / ${Number(d.total_pcs || 0)}</td></tr>
                      <tr><td><b>Returned CTN / Pcs</b></td><td>${Number(d.returned_ctn || 0)} / ${Number(d.returned_pcs || 0)}</td></tr>
                      ${d.remarks ? `<tr><td><b>Remarks</b></td><td>${esc(d.remarks)}</td></tr>` : ''}
                    </table>`;
                  printHTML(body, `${TYPE_LABEL[type]} History — ${receive.challan_no || receive.si_no || 'Entry'}`, `${officeName} · ${buyerName}`);
                };
                return (
                  <li key={h.id} className={`border-2 rounded-md p-2 ${styleCls}`}>
                    <div className="flex justify-between gap-2 flex-wrap">
                      <span className="font-semibold">{label}</span>
                      <span className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground mr-1">{new Date(h.created_at).toLocaleString('en-GB')}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Print" onClick={printOne}><Printer className="h-3 w-3" /></Button>
                        {canDeleteHist && (
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={async () => {
                            if (!await confirmDialog({ description: 'Remove this history entry from your view?' })) return;
                            try { await hideHistoryForMe([h.id]); }
                            catch (e) { return toast.error((e as Error).message); }
                            setHistoryEntries(prev => prev.filter(x => x.id !== h.id));
                          }}><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      by {h.changed_by_name || '—'}
                      {d.po_no ? ` · PO: ${d.po_no}` : ''}
                      {d.style_no ? ` · Style: ${d.style_no}` : ''}
                      {d.si_no ? ` · SI: ${d.si_no}` : ''}
                    </div>
                    {issuedAt && (
                      <div className="flex flex-wrap gap-3 mt-1 text-[11px]">
                        <span><span className="text-muted-foreground">Date:</span> <b>{issuedAt.toLocaleDateString('en-GB')}</b></span>
                        <span><span className="text-muted-foreground">Time:</span> <b>{issuedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b></span>
                        <span><span className="text-muted-foreground">Day:</span> <b>{issuedAt.toLocaleDateString('en-GB', { weekday: 'long' })}</b></span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 mt-2 text-[11px]">
                      {rows.filter(([, v]) => v).map(([k, v]) => (
                        <div key={k}><span className="text-muted-foreground">{k}:</span> <span className="font-medium">{String(v)}</span></div>
                      ))}
                    </div>
                    {(d.total_ctn !== undefined || d.returned_ctn !== undefined) && (
                      <div className="flex flex-wrap gap-3 mt-2 text-[11px]">
                        <span>Issued CTN: <b>{issuedCtn}</b></span>
                        <span>Issued Pcs: <b>{issuedPcs}</b></span>
                        <span>CTN remaining: <b>{Number(d.total_ctn || 0)}</b></span>
                        <span>Pcs remaining: <b className="text-primary">{Number(d.total_pcs || 0)}</b></span>
                        {Number(d.returned_ctn || 0) > 0 && <span className="text-emerald-600">Returned CTN: <b>{Number(d.returned_ctn)}</b></span>}
                        {Number(d.returned_pcs || 0) > 0 && <span className="text-emerald-600">Returned Pcs: <b>{Number(d.returned_pcs)}</b></span>}
                      </div>
                    )}
                    {d.remarks ? <div className="text-[11px] mt-1"><span className="text-muted-foreground">Remarks:</span> {String(d.remarks)}</div> : null}
                  </li>
                );
              })}
            </ul>
          )}
          {historyEntries.length > 0 && (() => {
            const q = historySearch.trim().toLowerCase();
            const visible = historyEntries.filter(h => {
              if (!q) return true;
              const d = (h.details as Record<string, unknown>) || {};
              return JSON.stringify({ a: h.action, by: h.changed_by_name, ...d }).toLowerCase().includes(q);
            });
            let iCtn = 0, iPcs = 0, rCtn = 0, rPcs = 0;
            visible.forEach(h => {
              const d = (h.details as Record<string, unknown>) || {};
              iCtn += Number(d.total_ctn || 0) + Number(d.returned_ctn || 0);
              iPcs += Number(d.total_pcs || 0) + Number(d.returned_pcs || 0);
              rCtn += Number(d.returned_ctn || 0);
              rPcs += Number(d.returned_pcs || 0);
            });
            return (
              <div className="mt-3 p-2 border-2 border-primary rounded-md bg-primary/5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold">
                <span>Total Issued CTN: <b className="text-primary">{iCtn}</b></span>
                <span>Total Issued Pcs: <b className="text-primary">{iPcs}</b></span>
                <span className="text-emerald-600">Total Returned CTN: <b>{rCtn}</b></span>
                <span className="text-emerald-600">Total Returned Pcs: <b>{rPcs}</b></span>
                <span>Entries: <b>{visible.length}</b></span>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Dialog>

  );
};

// Shows the date as a clickable button. Popover lists who created / updated / deleted
// this entry, with detail-diff view, delete-one and clear-all (super_admin) controls.
interface AuditEntry {
  id: string; action: string; message: string;
  created_by_name: string | null; created_at: string;
  field_changed: string | null;
  details: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; buyer?: string } | null;
}
const DateAuditPopover = ({ date, receiveId }: { date: string; receiveId: string }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const fmt = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return d; }
  };
  const reload = () => {
    setItems(null);
    supabase.from('notifications')
      .select('id,action,message,created_by_name,created_at,field_changed,details,hidden_by')
      .filter('details->>receive_id', 'eq', receiveId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const uid = user?.id;
        const rows = ((data as unknown as (AuditEntry & { hidden_by?: unknown })[]) || []).filter(r => {
          const h = Array.isArray(r.hidden_by) ? (r.hidden_by as string[]) : [];
          return !uid || !h.includes(uid);
        });
        setItems(rows);
      });
  };
  useEffect(() => { if (open) reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, receiveId]);

  const hideForMe = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const { data } = await supabase.from('notifications').select('id, hidden_by').in('id', ids);
    await Promise.all((data || []).map(row => {
      const arr = Array.isArray((row as { hidden_by?: unknown }).hidden_by) ? ((row as { hidden_by: string[] }).hidden_by) : [];
      if (arr.includes(user.id)) return Promise.resolve();
      return supabase.from('notifications').update({ hidden_by: [...arr, user.id] } as never).eq('id', (row as { id: string }).id);
    }));
  };

  const deleteOne = async (id: string) => {
    if (!await confirmDialog({ description: 'Remove this audit entry from your view?' })) return;
    try { await hideForMe([id]); }
    catch (e) { return toast.error((e as Error).message); }
    setItems(prev => (prev || []).filter(i => i.id !== id));
  };
  const clearAll = async () => {
    if (!items || items.length === 0) return;
    if (!await confirmDialog({ description: `Clear all ${items.length} audit entries from your view?` })) return;
    try { await hideForMe(items.map(i => i.id)); }
    catch (e) { return toast.error((e as Error).message); }
    setItems([]);
  };

  const allKeys = (a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined) => {
    const s = new Set<string>();
    if (a) Object.keys(a).forEach(k => s.add(k));
    if (b) Object.keys(b).forEach(k => s.add(k));
    return Array.from(s);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-left hover:text-primary hover:underline cursor-pointer text-[10px] sm:text-sm whitespace-nowrap" title="Click to see who created / updated this entry">
            {fmt(date)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="px-3 py-2 border-b bg-muted/40 text-xs font-semibold flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><History className="h-3.5 w-3.5" /> Update history</span>
            {true && items && items.length > 0 && (
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive" onClick={clearAll}>
                <Trash2 className="h-3 w-3 mr-1" />Clear all
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-2 space-y-2">
            {items === null ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No history yet</p>
            ) : items.map(h => {
              const a = (h.action || '').toLowerCase();
              const tone = a.includes('delete') ? 'border-destructive bg-destructive/5'
                : a.includes('edit') || a.includes('update') || a.includes('change') ? 'border-blue-500 bg-blue-500/5'
                : a.includes('ship') ? 'border-orange-500 bg-orange-500/5'
                : a.includes('sample') || a.includes('insp') ? 'border-purple-500 bg-purple-500/5'
                : a.includes('return') ? 'border-amber-500 bg-amber-500/5'
                : 'border-emerald-500 bg-emerald-500/5';
              const dt = new Date(h.created_at);
              return (
              <div key={h.id} className={`text-xs rounded-lg border-2 border-l-[4px] ${tone} px-2.5 py-2 flex items-start justify-between gap-2 hover:shadow-sm transition-shadow`}>
                <div className="text-left flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold capitalize text-foreground">{h.action}</span>
                    <span className="text-[10px] font-semibold text-primary/80">{dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' })}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate">{h.message}</p>
                  <div className="text-[10px] mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground">
                    <span>by <b className="text-foreground">{h.created_by_name || 'Unknown'}</b></span>
                    <span className="opacity-50">•</span>
                    <span>{dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Dhaka' })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => setDetail(h)} aria-label="View details" title="View details">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {true && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteOne(h.id)} aria-label="Delete entry" title="Delete entry">
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );})}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="capitalize flex items-center gap-2">
              <History className="h-4 w-4" />
              {detail?.action} — {detail && new Date(detail.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <p><b>By:</b> {detail.created_by_name || 'Unknown'}</p>
              <p className="text-muted-foreground">{detail.message}</p>
              {(detail.details?.before || detail.details?.after) && (
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr><th className="text-left px-2 py-1.5">Field</th><th className="text-left px-2 py-1.5">Before</th><th className="text-left px-2 py-1.5">After</th></tr>
                    </thead>
                    <tbody>
                      {allKeys(detail.details?.before, detail.details?.after).map(k => {
                        const b = (detail.details?.before as Record<string, unknown> | null | undefined)?.[k];
                        const a = (detail.details?.after as Record<string, unknown> | null | undefined)?.[k];
                        const changed = JSON.stringify(b ?? null) !== JSON.stringify(a ?? null);
                        return (
                          <tr key={k} className={`border-t border-border ${changed ? 'bg-amber-500/10' : ''}`}>
                            <td className={`px-2 py-1.5 font-medium ${changed ? 'text-amber-600 dark:text-amber-400 border-2 border-amber-500' : ''}`}>
                              {changed && <span className="mr-1">●</span>}{k}
                            </td>
                            <td className={`px-2 py-1.5 ${changed ? 'bg-destructive/15 text-destructive font-medium line-through decoration-destructive/60 border-2 border-destructive' : 'text-muted-foreground'}`}>
                              {b == null || b === '' ? '—' : String(b)}
                            </td>
                            <td className={`px-2 py-1.5 ${changed ? 'bg-success/20 text-success font-bold border-2 border-success' : 'text-muted-foreground'}`}>
                              {a == null || a === '' ? '—' : String(a)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};


export default BuyerPage;


