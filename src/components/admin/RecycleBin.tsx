import { useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RotateCcw, Trash2, Search, RefreshCcw, ArchiveRestore, Trash, Building2, Eye, User as UserIcon, Phone, Shield, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { restoreDeletedItem, restoreMany, emptyRecycleBin, deleteFromBin } from '@/lib/recycleBin';

interface DeleterInfo {
  id: string;
  name: string | null;
  access_id: string | null;
  role: string | null;
  phone: string | null;
  destination: string | null;
  office_id: string | null;
  is_active: boolean | null;
}

interface DeletedItem {
  id: string;
  table_name: string;
  record_id: string;
  label: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  payload: unknown;
}

const TABLE_LABEL: Record<string, string> = {
  receives: 'Stock Entry',
  receive_cartons: 'Receive Carton',
  receive_issues: 'Issue',
  receive_issue_lines: 'Issue Line',
  cartons: 'Carton',
  carton_history: 'History Entry',
  notifications: 'Notification',
  app_users: 'User',
  offices: 'Office/Unit',
};

// Per-type theme: full colored border + soft tinted bg + chip color.
const TABLE_THEME: Record<string, { ring: string; bg: string; chip: string; bar: string }> = {
  receives:            { ring: 'border-blue-500/70',    bg: 'bg-blue-500/5',    chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',       bar: 'bg-blue-500' },
  receive_cartons:     { ring: 'border-sky-500/70',     bg: 'bg-sky-500/5',     chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',          bar: 'bg-sky-500' },
  receive_issues:      { ring: 'border-violet-500/70',  bg: 'bg-violet-500/5',  chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', bar: 'bg-violet-500' },
  receive_issue_lines: { ring: 'border-fuchsia-500/70', bg: 'bg-fuchsia-500/5', chip: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300', bar: 'bg-fuchsia-500' },
  cartons:             { ring: 'border-emerald-500/70', bg: 'bg-emerald-500/5', chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  carton_history:      { ring: 'border-amber-500/70',   bg: 'bg-amber-500/5',   chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',    bar: 'bg-amber-500' },
  notifications:       { ring: 'border-orange-500/70',  bg: 'bg-orange-500/5',  chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', bar: 'bg-orange-500' },
  app_users:           { ring: 'border-pink-500/70',    bg: 'bg-pink-500/5',    chip: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',       bar: 'bg-pink-500' },
  offices:             { ring: 'border-teal-500/70',    bg: 'bg-teal-500/5',    chip: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',       bar: 'bg-teal-500' },
};
const DEFAULT_THEME = { ring: 'border-muted-foreground/40', bg: 'bg-muted/20', chip: 'bg-muted text-foreground', bar: 'bg-muted-foreground/50' };

const RecycleBin = () => {
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [detail, setDetail] = useState<DeletedItem | null>(null);
  const [deleter, setDeleter] = useState<DeleterInfo | null>(null);
  const [loadingDeleter, setLoadingDeleter] = useState(false);

  const openDetail = async (i: DeletedItem) => {
    setDetail(i);
    setDeleter(null);
    if (!i.deleted_by) return;
    setLoadingDeleter(true);
    const { data } = await supabase
      .from('app_users')
      .select('id,name,access_id,role,phone,destination,office_id,is_active')
      .eq('id', i.deleted_by)
      .maybeSingle();
    setDeleter((data as DeleterInfo) || null);
    setLoadingDeleter(false);
  };

  const officeNameById = useMemo(() => {
    const m = new Map<string, string>();
    offices.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [offices]);

  // Resolve which unit/office an archived row belongs to so super admin can
  // see exactly who (and which store) made the deletion.
  const officeForItem = (i: DeletedItem): { id: string | null; name: string | null } => {
    const p = (i.payload as { main?: Record<string, unknown>; children?: Record<string, Array<Record<string, unknown>>> } | null) || {};
    const main = p.main || {};
    let oid =
      (main.office_id as string | undefined) ||
      (i.table_name === 'offices' ? (main.id as string | undefined) : undefined) ||
      undefined;
    if (!oid) {
      const kids = p.children || {};
      for (const arr of Object.values(kids)) {
        const hit = arr?.find?.((r) => r && (r as { office_id?: string }).office_id);
        if (hit) { oid = (hit as { office_id?: string }).office_id; break; }
      }
    }
    if (!oid) return { id: null, name: null };
    return { id: oid, name: officeNameById.get(oid) || null };
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deleted_items')
      .select('*')
      .order('deleted_at', { ascending: false })
      .limit(2000);
    if (error) toast.error(error.message);
    else setItems((data as DeletedItem[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase.from('offices').select('id,name').order('name').then(({ data }) => {
      setOffices((data as { id: string; name: string }[]) || []);
    });
    const ch = supabase
      .channel('recycle-bin-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deleted_items' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((i) => {
      if (typeFilter !== 'all' && i.table_name !== typeFilter) return false;
      if (officeFilter !== 'all') {
        const o = officeForItem(i);
        if (o.id !== officeFilter) return false;
      }
      // Date range filters against the original record's date (entry_date /
      // created_at on payload.main) so users can hunt by business date, not just deletion time.
      const main = ((i.payload as { main?: Record<string, unknown> } | null)?.main) || {};
      const recordDate = String(main.entry_date || main.created_at || i.deleted_at || '').slice(0, 10);
      if (fromDate && recordDate && recordDate < fromDate) return false;
      if (toDate && recordDate && recordDate > toDate) return false;
      if (!q) return true;
      // Search label/user/office/table plus the full payload JSON so PO, style,
      // challan, si_no etc. are matchable without hand-building per-field labels.
      const payloadStr = JSON.stringify(i.payload || {}).toLowerCase();
      const officeName = (officeForItem(i).name || '').toLowerCase();
      return (
        (i.label || '').toLowerCase().includes(q) ||
        (i.deleted_by_name || '').toLowerCase().includes(q) ||
        officeName.includes(q) ||
        i.table_name.toLowerCase().includes(q) ||
        payloadStr.includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, typeFilter, officeFilter, fromDate, toDate, officeNameById]);

  const tableTypes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.table_name));
    return Array.from(set).sort();
  }, [items]);

  const onRestore = async (id: string) => {
    setBusy(true);
    try {
      await restoreDeletedItem(id);
      toast.success('Restored');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRestoreAll = async () => {
    if (filtered.length === 0) return;
    if (!await confirmDialog({ description: `Restore all ${filtered.length} item(s) currently shown?` })) return;
    setBusy(true);
    try {
      const n = await restoreMany(filtered.map((f) => f.id));
      toast.success(`Restored ${n} item(s)`);
      load();
    } finally {
      setBusy(false);
    }
  };

  const onPurgeOne = async (id: string) => {
    if (!await confirmDialog({ description: 'Permanently delete this item from the Recycle Bin? This cannot be undone.' })) return;
    setBusy(true);
    try {
      await deleteFromBin([id]);
      toast.success('Removed from bin');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onEmpty = async () => {
    if (items.length === 0) return;
    if (!await confirmDialog({ description: `Permanently EMPTY the Recycle Bin (${items.length} item(s))? This cannot be undone.` })) return;
    setBusy(true);
    try {
      await emptyRecycleBin();
      toast.success('Recycle Bin emptied');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-primary" /> Recycle Bin ({filtered.length}/{items.length})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Search PO, style, challan, label, user…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Input
            type="date"
            className="h-9 w-[140px] text-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            title="From date"
          />
          <Input
            type="date"
            className="h-9 w-[140px] text-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            title="To date"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All types</option>
            {tableTypes.map((t) => (
              <option key={t} value={t}>
                {TABLE_LABEL[t] || t}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            title="Filter by unit / office"
          >
            <option value="all">All units</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading || busy} title="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={onRestoreAll} disabled={busy || filtered.length === 0}>
            <ArchiveRestore className="h-4 w-4 mr-1" /> Restore all
          </Button>
          <Button size="sm" variant="destructive" onClick={onEmpty} disabled={busy || items.length === 0}>
            <Trash className="h-4 w-4 mr-1" /> Empty bin
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            {items.length === 0 ? 'Recycle Bin is empty.' : 'No items match your search.'}
          </p>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((i) => {
              const office = officeForItem(i);
              const theme = TABLE_THEME[i.table_name] || DEFAULT_THEME;
              return (
              <div
                key={i.id}
                className={`relative overflow-hidden border-2 ${theme.ring} ${theme.bg} rounded-xl pl-4 pr-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.bar}`} aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${theme.chip}`}>
                      {TABLE_LABEL[i.table_name] || i.table_name}
                    </span>
                    {office.name && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-tight bg-teal-500/15 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded">
                        <Building2 className="h-3 w-3" /> {office.name}
                      </span>
                    )}
                    <p className="text-sm font-semibold truncate text-foreground">{i.label || i.record_id}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deleted {new Date(i.deleted_at).toLocaleString()}
                    {i.deleted_by_name ? ` · by ${i.deleted_by_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => openDetail(i)} disabled={busy} title="View full details">
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onRestore(i.id)} disabled={busy}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onPurgeOne(i.id)} disabled={busy} title="Remove from bin permanently">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setDeleter(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-primary" />
              Deletion Details
            </DialogTitle>
          </DialogHeader>
          {detail && (() => {
            const office = officeForItem(detail);
            const deleterOfficeName = deleter?.office_id ? (officeNameById.get(deleter.office_id) || '—') : '—';
            return (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-border p-3 bg-muted/30">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Item</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{TABLE_LABEL[detail.table_name] || detail.table_name}</span></div>
                    <div><span className="text-muted-foreground">Label:</span> <span className="font-medium break-all">{detail.label || detail.record_id}</span></div>
                    <div><span className="text-muted-foreground">Item Unit/Office:</span> <span className="font-medium">{office.name || '—'}</span></div>
                    <div><span className="text-muted-foreground">Deleted At:</span> <span className="font-medium">{new Date(detail.deleted_at).toLocaleString()}</span></div>
                  </div>
                </div>

                <div className="rounded-lg border-2 border-primary/40 p-3 bg-primary/5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-2 flex items-center gap-1">
                    <UserIcon className="h-3.5 w-3.5" /> Deleted By
                  </div>
                  {loadingDeleter ? (
                    <p className="text-muted-foreground">Loading user details…</p>
                  ) : deleter ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{deleter.name || detail.deleted_by_name || '—'}</span></div>
                      <div className="flex items-center gap-1"><Shield className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Role:</span> <span className="font-medium capitalize">{deleter.role || '—'}</span></div>
                      <div><span className="text-muted-foreground">Access ID:</span> <span className="font-medium">{deleter.access_id || '—'}</span></div>
                      <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{deleter.phone || '—'}</span></div>
                      <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Unit/Office:</span> <span className="font-medium">{deleterOfficeName}</span></div>
                      <div className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Destination:</span> <span className="font-medium">{deleter.destination || '—'}</span></div>
                      <div><span className="text-muted-foreground">Status:</span> <span className={`font-medium ${deleter.is_active ? 'text-emerald-600' : 'text-destructive'}`}>{deleter.is_active ? 'Active' : 'Inactive'}</span></div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      {detail.deleted_by_name ? `${detail.deleted_by_name} (user record no longer available)` : 'Unknown user.'}
                    </p>
                  )}
                </div>

              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default RecycleBin;
