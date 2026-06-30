import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Copy, HeartPulse, FileDown, Loader2, CheckCircle2, XCircle, Bell, Info } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/exportExcel';

interface Recv {
  id: string; office_id: string; buyer: string; si_no: string | null; po_no: string | null;
  challan_no: string | null; style: string | null; entry_date: string; created_at: string; updated_at: string;
}
interface RecvCarton { id: string; receive_id: string; ctn_qty: number; pcs_per_ctn: number; }
interface Issue { id: string; receive_id: string; issue_type: string; total_ctn: number; total_pcs: number; }
interface IssueLine { id: string; issue_id: string; ctn_qty: number; pcs_per_ctn: number; returned_ctn: number; returned_pcs: number; }
interface Office { id: string; name: string; }

const DAY_MS = 86_400_000;

const AdminTools = () => {
  const [recvs, setRecvs] = useState<Recv[]>([]);
  const [cartons, setCartons] = useState<RecvCarton[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(false);

  // Tunable alert thresholds
  const [lowStockCtn, setLowStockCtn] = useState(20);
  const [inactivityDays, setInactivityDays] = useState(30);

  // Health check result
  const [health, setHealth] = useState<null | {
    counts: Record<string, number>;
    orphanIssues: number;
    orphanLines: number;
    orphanCartons: number;
    emptyIssues: number;
    ranAt: string;
  }>(null);
  const [healthRunning, setHealthRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [r, c, i, l, o] = await Promise.all([
      supabase.from('receives').select('id,office_id,buyer,si_no,po_no,challan_no,style,entry_date,created_at,updated_at'),
      supabase.from('receive_cartons').select('id,receive_id,ctn_qty,pcs_per_ctn'),
      supabase.from('receive_issues').select('id,receive_id,issue_type,total_ctn,total_pcs'),
      supabase.from('receive_issue_lines').select('id,issue_id,ctn_qty,pcs_per_ctn,returned_ctn,returned_pcs'),
      supabase.from('offices').select('id,name'),
    ]);
    setRecvs((r.data as Recv[]) || []);
    setCartons((c.data as RecvCarton[]) || []);
    setIssues((i.data as Issue[]) || []);
    setLines((l.data as IssueLine[]) || []);
    setOffices((o.data as Office[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const officeName = useMemo(() => {
    const m = new Map<string, string>();
    offices.forEach(o => m.set(o.id, o.name));
    return m;
  }, [offices]);

  // ---------- Alerts (live, derived) ----------
  const alerts = useMemo(() => {
    const ctnByRecv = new Map<string, number>();
    cartons.forEach(c => ctnByRecv.set(c.receive_id, (ctnByRecv.get(c.receive_id) || 0) + (c.ctn_qty || 0)));
    const issuedByRecv = new Map<string, number>();
    issues.forEach(i => issuedByRecv.set(i.receive_id, (issuedByRecv.get(i.receive_id) || 0) + (i.total_ctn || 0)));
    const out: Array<{ id: string; kind: 'low' | 'aging'; office: string; buyer: string; ctn: number; days: number; }> = [];
    const now = Date.now();
    recvs.forEach(r => {
      const stock = (ctnByRecv.get(r.id) || 0) - (issuedByRecv.get(r.id) || 0);
      if (stock <= 0) return;
      const days = Math.floor((now - new Date(r.updated_at || r.created_at).getTime()) / DAY_MS);
      if (stock <= lowStockCtn) {
        out.push({ id: `low-${r.id}`, kind: 'low', office: officeName.get(r.office_id) || '—', buyer: r.buyer || '—', ctn: stock, days });
      } else if (days >= inactivityDays) {
        out.push({ id: `age-${r.id}`, kind: 'aging', office: officeName.get(r.office_id) || '—', buyer: r.buyer || '—', ctn: stock, days });
      }
    });
    return out.sort((a, b) => b.days - a.days).slice(0, 25);
  }, [recvs, cartons, issues, lowStockCtn, inactivityDays, officeName]);

  // ---------- Duplicate detection (same SI/PO across offices) ----------
  const duplicates = useMemo(() => {
    const groupBy = (key: 'si_no' | 'po_no') => {
      const m = new Map<string, Recv[]>();
      recvs.forEach(r => {
        const v = (r[key] || '').trim();
        if (!v) return;
        if (!m.has(v)) m.set(v, []);
        m.get(v)!.push(r);
      });
      return Array.from(m.entries())
        .filter(([, arr]) => new Set(arr.map(r => r.office_id)).size > 1)
        .map(([value, arr]) => ({ key, value, items: arr }))
        .slice(0, 20);
    };
    return [...groupBy('si_no'), ...groupBy('po_no')];
  }, [recvs]);

  // ---------- Health check ----------
  const runHealth = async () => {
    setHealthRunning(true);
    try {
      const tables = ['receives', 'receive_cartons', 'receive_issues', 'receive_issue_lines', 'app_users', 'offices', 'notifications', 'carton_history', 'deleted_items'] as const;
      const counts: Record<string, number> = {};
      await Promise.all(tables.map(async (t) => {
        const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
        counts[t] = count || 0;
      }));
      const recvIds = new Set(recvs.map(r => r.id));
      const issueIds = new Set(issues.map(i => i.id));
      const orphanIssues = issues.filter(i => !recvIds.has(i.receive_id)).length;
      const orphanCartons = cartons.filter(c => !recvIds.has(c.receive_id)).length;
      const orphanLines = lines.filter(l => !issueIds.has(l.issue_id)).length;
      const emptyIssues = issues.filter(i => (i.total_ctn || 0) === 0 && (i.total_pcs || 0) === 0).length;
      setHealth({ counts, orphanIssues, orphanLines, orphanCartons, emptyIssues, ranAt: new Date().toLocaleString() });
      toast.success('Health check complete');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setHealthRunning(false);
    }
  };

  // ---------- Snapshot export ----------
  const exportSnapshot = () => {
    const rows = alerts.map(a => ({
      Type: a.kind === 'low' ? 'Low Stock' : 'Aging Stock',
      Office: a.office,
      Buyer: a.buyer,
      'Stock CTN': a.ctn,
      'Days Inactive': a.days,
    }));
    const dupRows = duplicates.flatMap(d => d.items.map(r => ({
      'Duplicate Field': d.key.toUpperCase(),
      Value: d.value,
      Office: officeName.get(r.office_id) || '—',
      Buyer: r.buyer,
      SI: r.si_no || '',
      PO: r.po_no || '',
      Style: r.style || '',
      'Entry Date': r.entry_date,
    })));
    exportToExcel([...rows, ...dupRows.map(d => ({ Type: 'Duplicate', ...d }))], `admin-snapshot-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Snapshot');
    toast.success('Snapshot exported');
  };

  return (
    <div className="space-y-5">

      {/* Duplicate detection */}
      <Card className="border-2 border-violet-500/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Copy className="h-4 w-4 text-violet-600" /> Duplicate SI / PO Across Offices ({duplicates.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {duplicates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No cross-office duplicates detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Offices</TableHead>
                    <TableHead>Entries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicates.map((d) => (
                    <TableRow key={`${d.key}-${d.value}`}>
                      <TableCell><Badge variant="outline">{d.key.toUpperCase()}</Badge></TableCell>
                      <TableCell className="font-medium">{d.value}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Array.from(new Set(d.items.map(r => officeName.get(r.office_id) || '—'))).map(n => (
                            <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.items.map(r => `${r.buyer} (${r.entry_date})`).join(' · ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health Check */}
      <Card className="border-2 border-emerald-500/50">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-emerald-600" /> Database Health Check
          </CardTitle>
          <Button size="sm" onClick={runHealth} disabled={healthRunning}>
            {healthRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <HeartPulse className="h-3.5 w-3.5 mr-1" />}
            Run Health Check
          </Button>
        </CardHeader>
        <CardContent>
          {!health ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Click "Run Health Check" to scan table sizes, orphan records, and empty issues.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {Object.entries(health.counts).map(([t, n]) => (
                  <div key={t} className="border-2 border-border rounded-lg p-2.5 bg-card">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t}</div>
                    <div className="text-lg font-bold">{n.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <HealthItem ok={health.orphanIssues === 0} label="Orphan issues" value={health.orphanIssues} />
                <HealthItem ok={health.orphanLines === 0} label="Orphan issue lines" value={health.orphanLines} />
                <HealthItem ok={health.orphanCartons === 0} label="Orphan cartons" value={health.orphanCartons} />
                <HealthItem ok={health.emptyIssues === 0} label="Empty (0/0) issues" value={health.emptyIssues} />
              </div>
              <p className="text-[11px] text-muted-foreground text-right">Last run: {health.ranAt}</p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

const HealthItem = ({ ok, label, value }: { ok: boolean; label: string; value: number }) => (
  <div className={`flex items-center justify-between gap-2 rounded-lg border-2 p-2.5 ${ok ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-red-500/50 bg-red-500/5'}`}>
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
      <span className="text-xs font-medium">{label}</span>
    </div>
    <span className="text-base font-bold">{value}</span>
  </div>
);

export default AdminTools;
