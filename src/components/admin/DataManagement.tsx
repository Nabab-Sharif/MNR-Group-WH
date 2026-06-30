import { useEffect, useRef, useState } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Upload, Trash2, Database, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { softDelete } from '@/lib/recycleBin';
import { useAuth } from '@/contexts/AuthContext';

interface Office { id: string; name: string }

// Tables we manage in the full export/import
const TABLES = [
  'offices',
  'app_users',
  'receives',
  'receive_cartons',
  'receive_issues',
  'receive_issue_lines',
  'cartons',
  'carton_history',
  'notifications',
] as const;
type T = typeof TABLES[number];

const fetchAll = async (table: T) => {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(table as any) as any).select('*').range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = (data || []) as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
};

const DataManagement = () => {
  const { user } = useAuth();
  const [offices, setOffices] = useState<Office[]>([]);
  const [buyers, setBuyers] = useState<string[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [delOffice, setDelOffice] = useState<string>('all');
  const [delFrom, setDelFrom] = useState('');
  const [delTo, setDelTo] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Export filters
  const [expOffice, setExpOffice] = useState<string>('all');
  const [expBuyer, setExpBuyer] = useState<string>('all');
  const [expFrom, setExpFrom] = useState('');
  const [expTo, setExpTo] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('offices').select('id,name').order('name').then(({ data }) => setOffices((data as Office[]) || []));
    supabase.from('receives').select('buyer').not('buyer', 'is', null).then(({ data }) => {
      const set = new Set<string>();
      (data || []).forEach((r: { buyer: string | null }) => { if (r.buyer) set.add(r.buyer); });
      setBuyers(Array.from(set).sort());
    });
  }, []);

  const hasExportFilter = expOffice !== 'all' || expBuyer !== 'all' || !!expFrom || !!expTo;

  // ===== Export =====
  const doExport = async () => {
    try {
      setBusy(hasExportFilter ? 'Exporting filtered…' : 'Exporting...');
      const wb = XLSX.utils.book_new();

      // Collect IDs for relational filtering
      let receiveIds: string[] | null = null;
      let issueIds: string[] | null = null;
      let cartonIds: string[] | null = null;

      if (hasExportFilter) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let rq: any = supabase.from('receives').select('id');
        if (expOffice !== 'all') rq = rq.eq('office_id', expOffice);
        if (expBuyer !== 'all') rq = rq.eq('buyer', expBuyer);
        if (expFrom) rq = rq.gte('entry_date', expFrom);
        if (expTo) rq = rq.lte('entry_date', expTo);
        const { data: rids, error: rErr } = await rq;
        if (rErr) throw rErr;
        receiveIds = (rids || []).map((r: { id: string }) => r.id);

        if (receiveIds.length) {
          const { data: iids } = await supabase.from('receive_issues').select('id').in('receive_id', receiveIds);
          issueIds = (iids || []).map((r: { id: string }) => r.id);
        } else issueIds = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let cq: any = supabase.from('cartons').select('id');
        if (expOffice !== 'all') cq = cq.eq('office_id', expOffice);
        if (expBuyer !== 'all') cq = cq.eq('buyer', expBuyer);
        if (expFrom) cq = cq.gte('entry_date', expFrom);
        if (expTo) cq = cq.lte('entry_date', expTo);
        const { data: cids } = await cq;
        cartonIds = (cids || []).map((r: { id: string }) => r.id);
      }

      const fetchFiltered = async (t: T): Promise<Record<string, unknown>[]> => {
        if (!hasExportFilter) return fetchAll(t);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const base = (col?: string, vals?: string[] | null) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = (supabase.from(t as any) as any).select('*');
          if (expOffice !== 'all' && ['offices', 'app_users', 'receives', 'cartons', 'carton_history', 'notifications'].includes(t)) {
            if (t === 'offices') q = q.eq('id', expOffice);
            else q = q.eq('office_id', expOffice);
          }
          if (col && vals) {
            if (vals.length === 0) return null;
            q = q.in(col, vals);
          }
          return q;
        };
        const runQ = async (q: ReturnType<typeof base>) => {
          if (q === null) return [];
          const { data, error } = await q;
          if (error) throw error;
          return (data || []) as Record<string, unknown>[];
        };
        switch (t) {
          case 'receives': return runQ(base('id', receiveIds));
          case 'receive_cartons': return runQ(base('receive_id', receiveIds));
          case 'receive_issues': return runQ(base('receive_id', receiveIds));
          case 'receive_issue_lines': return runQ(base('issue_id', issueIds));
          case 'cartons': return runQ(base('id', cartonIds));
          case 'carton_history': return runQ(base('carton_id', cartonIds));
          case 'notifications': return runQ(base());
          case 'offices':
          case 'app_users':
          default:
            return runQ(base());
        }
      };

      for (const t of TABLES) {
        const rows = await fetchFiltered(t);
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: 'empty' }]);
        XLSX.utils.book_append_sheet(wb, ws, t.slice(0, 31));
      }
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      const label = hasExportFilter ? 'filtered' : 'full';
      XLSX.writeFile(wb, `mnr-${label}-backup-${stamp}.xlsx`);
      toast.success(hasExportFilter ? 'Filtered backup exported' : 'Backup exported');
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(''); }
  };

  const resetExportFilters = () => { setExpOffice('all'); setExpBuyer('all'); setExpFrom(''); setExpTo(''); };

  // ===== Import (upsert per table) =====
  const onFile = async (f: File | null) => {
    if (!f) return;
    if (!await confirmDialog({ description: 'Import will UPSERT rows from the file into the database. Continue?' })) return;
    try {
      setBusy('Importing...');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      let total = 0;
      for (const t of TABLES) {
        const sheet = wb.Sheets[t.slice(0, 31)];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
          .filter(r => !(Object.keys(r).length === 1 && 'note' in r));
        if (rows.length === 0) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from(t as any) as any).upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`${t}: ${error.message}`);
        total += rows.length;
      }
      toast.success(`Imported ${total} rows`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ===== Bulk delete (filtered) =====
  const buildReceivesQuery = () => {
    let q = supabase.from('receives').select('id', { count: 'exact', head: false });
    if (delOffice !== 'all') q = q.eq('office_id', delOffice);
    if (delFrom) q = q.gte('entry_date', delFrom);
    if (delTo) q = q.lte('entry_date', delTo);
    return q;
  };

  const doPreview = async () => {
    try {
      setBusy('Counting...');
      const { count, error } = await buildReceivesQuery();
      if (error) throw error;
      setPreviewCount(count ?? 0);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(''); }
  };

  const doBulkDelete = async () => {
    try {
      setBusy('Deleting...');
      const { data: rows, error: e1 } = await buildReceivesQuery();
      if (e1) throw e1;
      const ids = (rows || []).map(r => r.id as string);
      if (ids.length === 0) { toast.info('Nothing matched'); return; }
      const label = delOffice === 'all' ? 'ALL offices' : offices.find(o => o.id === delOffice)?.name;
      if (!await confirmDialog({ description: `DELETE ${ids.length} receive entries (and all linked cartons & issues) from ${label}${delFrom ? ' from ' + delFrom : ''}${delTo ? ' to ' + delTo : ''}? Items will be archived to the Recycle Bin and can be restored.` })) return;
      // Snapshot to Recycle Bin, then delete (cascade handles children)
      await softDelete('receives', ids, { user });
      toast.success(`Moved ${ids.length} entries to Recycle Bin`);
      setPreviewCount(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle>Full Data Export / Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export the entire database to a single Excel workbook (one sheet per table), or import a previously-exported workbook to restore data.
            Importing uses UPSERT — rows with matching IDs are updated, new IDs are added.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-semibold tracking-tight uppercase text-muted-foreground">Export Filters {hasExportFilter && <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary normal-case tracking-normal">active</span>}</p>
              {hasExportFilter && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetExportFilters} disabled={!!busy}>Clear</Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Unit / Office</label>
                <Select value={expOffice} onValueChange={setExpOffice}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All offices</SelectItem>
                    {offices.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Buyer</label>
                <Select value={expBuyer} onValueChange={setExpBuyer}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All buyers</SelectItem>
                    {buyers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">From date</label>
                <Input type="date" className="h-9 text-sm" value={expFrom} onChange={e => setExpFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">To date</label>
                <Input type="date" className="h-9 text-sm" value={expTo} onChange={e => setExpTo(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Filters apply to receives, cartons, issues, history, and notifications. Offices & users export honors the office filter.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={doExport} disabled={!!busy}>
              <Download className="h-4 w-4 mr-1.5" /> {hasExportFilter ? 'Export Filtered Backup' : 'Export Full Backup'}
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              <Upload className="h-4 w-4 mr-1.5" /> Import from Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => onFile(e.target.files?.[0] || null)}
            />
            {busy && <span className="text-sm text-muted-foreground self-center">{busy}</span>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle>Filtered Delete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Delete receive entries (and all their cartons & issues) for a chosen unit/office and date range. Use "Preview" first to see how many entries match.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs">Unit / Office</label>
              <Select value={delOffice} onValueChange={(v) => { setDelOffice(v); setPreviewCount(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All offices</SelectItem>
                  {offices.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs">From date</label>
              <Input type="date" value={delFrom} onChange={e => { setDelFrom(e.target.value); setPreviewCount(null); }} />
            </div>
            <div>
              <label className="text-xs">To date</label>
              <Input type="date" value={delTo} onChange={e => { setDelTo(e.target.value); setPreviewCount(null); }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={doPreview} disabled={!!busy}>Preview matches</Button>
            <Button variant="destructive" onClick={doBulkDelete} disabled={!!busy}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete matching entries
            </Button>
            {previewCount !== null && (
              <span className="text-sm">
                <b>{previewCount}</b> receive entries match.
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataManagement;
