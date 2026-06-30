import { useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Printer, FileSpreadsheet, Search, ArrowLeft, MoreVertical, ListChecks, PencilLine, Trash2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel, printElement } from '@/lib/exportExcel';
import { logHistoryAndNotify } from '@/lib/notify';
import { softDelete } from '@/lib/recycleBin';

interface Carton {
  id: string;
  office_id: string;
  carton_no: string;
  si_no: string | null;
  style_no: string | null;
  po_no: string | null;
  buyer: string | null;
  style: string | null;
  color: string | null;
  size: string | null;
  quantity: number;
  entry_date: string;
  status: string;
  category: string;
}

const empty = {
  carton_no: '', si_no: '', style_no: '', po_no: '',
  buyer: '', style: '', color: '', size: '',
  quantity: 0, entry_date: new Date().toISOString().slice(0, 10), category: 'stock',
};

const CATEGORIES = ['stock', 'shipment', 'sample'];

const StockEntry = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const highlightId = params.get('highlight');
  const highlightField = params.get('field');

  const [rows, setRows] = useState<Carton[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'stock' | 'shipment' | 'sample'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Carton | null>(null);
  const [form, setForm] = useState(empty);
  const [officeName, setOfficeName] = useState('');
  const [officeShort, setOfficeShort] = useState('');

  const officeId = user?.office_id;

  const load = async () => {
    if (!officeId) return;
    const { data } = await supabase.from('cartons').select('*').eq('office_id', officeId).order('created_at', { ascending: false });
    setRows((data as Carton[]) || []);
  };

  useEffect(() => {
    if (!officeId) return;
    load();
    supabase.from('offices').select('name').eq('id', officeId).maybeSingle().then(({ data }) => {
      setOfficeName(data?.name || '');
      // Build short tag like "M&S" from initials
      const parts = (data?.name || '').split(/\s+/).filter(Boolean);
      setOfficeShort(parts.map(p => p[0]).join('').slice(0, 4).toUpperCase());
    });
    const ch = supabase.channel('stock-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons', filter: `office_id=eq.${officeId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [officeId]);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`row-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => {
      params.delete('highlight'); params.delete('field');
      setParams(params, { replace: true });
    }, 4500);
    return () => clearTimeout(t);
  }, [highlightId, rows.length, params, setParams]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'store_user') return <Navigate to="/dashboard" replace />;
  if (!officeId) return <AppLayout><div className="p-6 text-center text-muted-foreground">No office assigned. Please contact admin.</div></AppLayout>;

  const openAdd = () => {
    if (!user.can_add) { toast.error('No add permission'); return; }
    setEditing(null); setForm(empty); setOpen(true);
  };

  const openEdit = (r: Carton) => {
    if (!user.can_edit) { toast.error('No edit permission'); return; }
    setEditing(r);
    setForm({
      carton_no: r.carton_no, si_no: r.si_no || '', style_no: r.style_no || '', po_no: r.po_no || '',
      buyer: r.buyer || '', style: r.style || '', color: r.color || '', size: r.size || '',
      quantity: r.quantity, entry_date: r.entry_date, category: r.category || 'stock',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.carton_no.trim()) { toast.error('Carton No required'); return; }
    if (form.quantity <= 0) { toast.error('Quantity required'); return; }
    const payload = {
      carton_no: form.carton_no,
      si_no: form.si_no || null,
      style_no: form.style_no || null,
      po_no: form.po_no || null,
      buyer: form.buyer || null,
      style: form.style || null,
      color: form.color || null,
      size: form.size || null,
      quantity: form.quantity,
      entry_date: form.entry_date,
      category: form.category,
    };
    if (editing) {
      const changed = Object.entries(payload).find(([k, v]) => {
        const old = (editing as unknown as Record<string, unknown>)[k];
        return (old ?? null) !== (v ?? null);
      });
      const fieldName = changed?.[0];
      const { error } = await supabase.from('cartons').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      const route = `/stock?highlight=${editing.id}${fieldName ? `&field=${fieldName}` : ''}`;
      await logHistoryAndNotify({
        user, officeId, officeName, cartonId: editing.id, cartonNo: form.carton_no,
        action: 'updated',
        message: `Carton ${form.carton_no} updated${fieldName ? ` (${fieldName})` : ''}`,
        details: payload, route, fieldChanged: fieldName,
      });
      toast.success('Updated');
    } else {
      const { data, error } = await supabase.from('cartons').insert({
        office_id: officeId, ...payload, status: 'in_stock', created_by: user.id,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      await logHistoryAndNotify({
        user, officeId, officeName, cartonId: data.id, cartonNo: form.carton_no,
        action: 'created',
        message: `New ${form.category} carton ${form.carton_no} added (${form.quantity} pcs)`,
        details: payload, route: `/stock?highlight=${data.id}`,
      });
      toast.success('Added');
    }
    setOpen(false);
  };

  const remove = async (r: Carton) => {
    if (!user.can_delete) { toast.error('No delete permission'); return; }
    if (!await confirmDialog({ description: `Delete carton ${r.carton_no}?` })) return;
    try {
      await softDelete('cartons', [r.id], { user });
    } catch (e) { toast.error((e as Error).message); return; }
    await logHistoryAndNotify({
      user, officeId, officeName, cartonId: null, cartonNo: r.carton_no,
      action: 'deleted', message: `Carton ${r.carton_no} deleted`,
      details: { carton_no: r.carton_no, si_no: r.si_no, style_no: r.style_no, po_no: r.po_no },
    });
    toast.success('Deleted');
  };

  // Filtering
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && r.category !== filter) return false;
      if (from && r.entry_date < from) return false;
      if (to && r.entry_date > to) return false;
      if (!q) return true;
      return (
        r.carton_no.toLowerCase().includes(q) ||
        (r.si_no || '').toLowerCase().includes(q) ||
        (r.style_no || '').toLowerCase().includes(q) ||
        (r.po_no || '').toLowerCase().includes(q) ||
        (r.buyer || '').toLowerCase().includes(q) ||
        (r.style || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter, from, to]);

  // Summary tiles (across filtered = respect filter)
  const sumBy = (cat: string | null) => {
    const list = cat ? filtered.filter(r => r.category === cat) : filtered;
    return { ctn: list.length, pcs: list.reduce((a, b) => a + b.quantity, 0), issued: list.filter(r => r.status === 'issued').length };
  };
  const allSum = sumBy(null);
  const recvTile = allSum; // all received
  const stockTile = { ctn: filtered.filter(r => r.status !== 'issued' && r.category === 'stock').length,
                      pcs: filtered.filter(r => r.status !== 'issued' && r.category === 'stock').reduce((a, b) => a + b.quantity, 0) };
  const sampleTile = sumBy('sample');
  const shipTile = sumBy('shipment');

  const tiles = [
    { key: 'recv', label: 'Recv CTN (Pcs)', ctn: recvTile.ctn, pcs: recvTile.pcs, ring: 'stat-card-recv', color: 'text-recv' },
    { key: 'stock', label: 'Stock CTN (Pcs)', ctn: stockTile.ctn, pcs: stockTile.pcs, ring: 'stat-card-stock', color: 'text-stock' },
    { key: 'sample', label: 'Sample CTN (Pcs)', ctn: sampleTile.ctn, pcs: sampleTile.pcs, ring: 'stat-card-sample', color: 'text-sample' },
    { key: 'ship', label: 'Ship CTN (Pcs)', ctn: shipTile.ctn, pcs: shipTile.pcs, ring: 'stat-card-ship', color: 'text-ship' },
  ];

  const doExcel = () => {
    if (!user.can_excel) { toast.error('No excel permission'); return; }
    exportToExcel(filtered.map(r => ({
      'SI No': r.si_no, Date: r.entry_date, 'Carton No': r.carton_no, 'PO No': r.po_no,
      Style: r.style, Buyer: r.buyer, Color: r.color, Size: r.size,
      Qty: r.quantity, Category: r.category, Status: r.status,
    })), `stock-${officeName}-${new Date().toISOString().slice(0, 10)}`);
  };
  const doPrint = () => {
    if (!user.can_print) { toast.error('No print permission'); return; }
    printElement('stock-table', `Stock - ${officeName}`);
  };

  const hl = (rowId: string, field: string) =>
    rowId === highlightId && field === highlightField ? 'ring-2 ring-warning rounded animate-pulse' : '';

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return d; }
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header with Back + breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {false && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            <h2 className="text-2xl font-bold tracking-tight">Stock Entries</h2>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm font-medium text-muted-foreground">{officeShort || officeName}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {user.can_print && <Button variant="outline" size="sm" onClick={doPrint}><Printer className="h-4 w-4 mr-1.5" />Print</Button>}
            {user.can_excel && <Button variant="outline" size="sm" onClick={doExcel}><FileSpreadsheet className="h-4 w-4 mr-1.5" />Excel</Button>}
            {user.can_add && (
              <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-1.5" />Add Stock Carton Information
              </Button>
            )}
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map(t => (
            <div key={t.key} className={`stat-card ${t.ring} rounded-xl p-4`}>
              <div className="flex items-start justify-between">
                <p className="text-[11px] tracking-tight text-muted-foreground font-medium">{t.label}</p>
                <button className="text-[10px] text-primary hover:underline">View →</button>
              </div>
              <p className={`text-2xl font-bold mt-2 ${t.color}`}>
                {t.ctn.toLocaleString()} <span className="text-muted-foreground text-sm font-normal">({t.pcs.toLocaleString()})</span>
              </p>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search SI / PO / Style" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filter} onValueChange={(v: 'all' | 'stock' | 'shipment' | 'sample') => setFilter(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entries</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">From</span>
            <Input type="date" className="w-40" value={from} onChange={e => setFrom(e.target.value)} />
            <span className="text-muted-foreground">To</span>
            <Input type="date" className="w-40" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm shadow-black/5">
          <div id="stock-table" className="overflow-x-auto">
            <h1 className="hidden print:block">Stock List — {officeName}</h1>
            <Table className="border-separate border-spacing-y-3">
              <TableHeader className="bg-muted/80">
                <TableRow className="border-transparent bg-muted/80">
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 first:rounded-l-2xl last:rounded-r-2xl px-4 py-3">SI</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 px-4 py-3">Date</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 px-4 py-3">Challan</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 px-4 py-3">PO No</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 px-4 py-3">Style</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 text-right px-4 py-3">Recv CTN (Pcs)</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 text-right px-4 py-3">Stock CTN (Pcs)</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 text-center px-4 py-3">Issue</TableHead>
                  <TableHead className="text-[11px] tracking-tight uppercase text-muted-foreground bg-muted/90 border border-border/70 text-right first:rounded-l-2xl last:rounded-r-2xl px-4 py-3">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">No entries found</TableCell></TableRow>
                ) : filtered.map(r => {
                  const isHL = r.id === highlightId;
                  const issuedCount = r.status === 'issued' ? 1 : 0;
                  return (
                    <TableRow key={r.id} id={`row-${r.id}`} className={`bg-background/90 shadow-sm border border-border/70 hover:bg-background/95 transition ${isHL ? 'ring-2 ring-warning/40' : ''}`}>
                      <TableCell className="border-l border-border/70 first:rounded-l-2xl last:rounded-r-none px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/30 ${hl(r.id, 'si_no')}`}>
                          {r.si_no || '—'}
                        </span>
                      </TableCell>
                      <TableCell className={`text-primary text-sm border-l border-border/70 px-4 py-3 ${hl(r.id, 'entry_date')}`}>{fmtDate(r.entry_date)}</TableCell>
                      <TableCell className={`text-sm border-l border-border/70 px-4 py-3 ${hl(r.id, 'carton_no')}`}>{r.carton_no}</TableCell>
                      <TableCell className={`text-primary text-sm border-l border-border/70 px-4 py-3 ${hl(r.id, 'po_no')}`}>{r.po_no || '—'}</TableCell>
                      <TableCell className={`text-sm border-l border-border/70 px-4 py-3 ${hl(r.id, 'style')}`}>{r.style || r.style_no || '—'}</TableCell>
                      <TableCell className={`text-right font-semibold border-l border-border/70 px-4 py-3 ${hl(r.id, 'quantity')}`}>
                        {r.quantity > 0 ? '1' : '0'} <span className="text-muted-foreground font-normal">({r.quantity.toLocaleString()})</span>
                      </TableCell>
                      <TableCell className="text-right border-l border-border/70 px-4 py-3">
                        <span className={r.status !== 'issued' ? 'text-primary font-semibold' : 'text-muted-foreground'}>
                          {r.status !== 'issued' ? '1' : '0'} <span className="text-muted-foreground font-normal">({r.status !== 'issued' ? r.quantity.toLocaleString() : 0})</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-center border-l border-border/70 px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border text-xs bg-muted/30">
                          <ListChecks className="h-3 w-3" />
                          {issuedCount > 0 ? issuedCount : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right border-l border-border/70 border-r first:rounded-l-none last:rounded-r-2xl px-4 py-3">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-56 p-1">
                            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border mb-1">Recv CTN — {r.quantity}</div>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                              <ChevronRight className="h-3.5 w-3.5 text-primary" /> Show Locations
                            </button>
                            {user.can_edit && (
                              <button onClick={() => openEdit(r)} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted">
                                <PencilLine className="h-3.5 w-3.5 text-stock" /> Add / Edit Carton
                              </button>
                            )}
                            {user.can_delete && (
                              <button onClick={() => remove(r)} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted text-destructive">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            )}
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit Carton' : 'Add Stock Carton Information'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className="text-xs">SI No</label><Input value={form.si_no} onChange={e => setForm({ ...form, si_no: e.target.value })} placeholder="SI-001" /></div>
            <div><label className="text-xs">Challan / Carton No *</label><Input value={form.carton_no} onChange={e => setForm({ ...form, carton_no: e.target.value })} /></div>
            <div><label className="text-xs">PO No</label><Input value={form.po_no} onChange={e => setForm({ ...form, po_no: e.target.value })} /></div>
            <div><label className="text-xs">Style No</label><Input value={form.style_no} onChange={e => setForm({ ...form, style_no: e.target.value })} /></div>
            <div><label className="text-xs">Style</label><Input value={form.style} onChange={e => setForm({ ...form, style: e.target.value })} /></div>
            <div><label className="text-xs">Buyer</label><Input value={form.buyer} onChange={e => setForm({ ...form, buyer: e.target.value })} /></div>
            <div><label className="text-xs">Color</label><Input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></div>
            <div><label className="text-xs">Size</label><Input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} /></div>
            <div><label className="text-xs">Quantity (Pcs) *</label><Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
            <div><label className="text-xs">Date *</label><Input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
            <div>
              <label className="text-xs">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default StockEntry;
