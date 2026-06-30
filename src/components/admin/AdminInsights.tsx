import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts';
import {
  PackagePlus, Truck, RotateCcw, Users, AlertTriangle, TrendingUp, Activity, Clock,
} from 'lucide-react';

interface Recv {
  id: string; office_id: string; buyer: string; entry_date: string; created_at: string; updated_at: string;
}
interface RecvCarton { receive_id: string; ctn_qty: number; pcs_per_ctn: number; created_at: string; }
interface Issue { id: string; receive_id: string; issue_type: 'shipment' | 'sample' | 'inspection'; total_ctn: number; total_pcs: number; issued_at: string; }
interface IssueLine { issue_id: string; ctn_qty: number; pcs_per_ctn: number; returned_ctn: number; returned_pcs: number; created_at: string; }
interface Office { id: string; name: string; }

const DAY_MS = 86_400_000;
const dayKey = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const shortDay = (k: string) => k.slice(5); // MM-DD

const AdminInsights = ({ onlineCount }: { onlineCount: number }) => {
  const [recvs, setRecvs] = useState<Recv[]>([]);
  const [cartons, setCartons] = useState<RecvCarton[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);

  const load = async () => {
    const [r, c, i, l, o] = await Promise.all([
      supabase.from('receives').select('id,office_id,buyer,entry_date,created_at,updated_at'),
      supabase.from('receive_cartons').select('receive_id,ctn_qty,pcs_per_ctn,created_at'),
      supabase.from('receive_issues').select('id,receive_id,issue_type,total_ctn,total_pcs,issued_at'),
      supabase.from('receive_issue_lines').select('issue_id,ctn_qty,pcs_per_ctn,returned_ctn,returned_pcs,created_at'),
      supabase.from('offices').select('id,name'),
    ]);
    setRecvs((r.data as Recv[]) || []);
    setCartons((c.data as RecvCarton[]) || []);
    setIssues((i.data as Issue[]) || []);
    setLines((l.data as IssueLine[]) || []);
    setOffices((o.data as Office[]) || []);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('admin-insights-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receives' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_cartons' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_issues' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_issue_lines' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const officeName = useMemo(() => {
    const m = new Map<string, string>();
    offices.forEach(o => m.set(o.id, o.name));
    return m;
  }, [offices]);

  // ---------- KPIs ----------
  const today = dayKey(new Date());

  const todayRecvCtn = useMemo(() => {
    const todayRecvIds = new Set(recvs.filter(r => dayKey(r.entry_date || r.created_at) === today).map(r => r.id));
    return cartons.filter(c => todayRecvIds.has(c.receive_id)).reduce((s, c) => s + (c.ctn_qty || 0), 0);
  }, [recvs, cartons, today]);

  const todayShipCtn = useMemo(() =>
    issues.filter(i => i.issue_type === 'shipment' && dayKey(i.issued_at) === today)
      .reduce((s, i) => s + (i.total_ctn || 0), 0),
    [issues, today]
  );

  const pendingReturns = useMemo(() =>
    lines.filter(l => (l.ctn_qty || 0) > (l.returned_ctn || 0)).length,
    [lines]
  );

  const totalActiveStockCtn = useMemo(() => {
    const recvByCtn = cartons.reduce((s, c) => s + (c.ctn_qty || 0), 0);
    const issued = issues.reduce((s, i) => s + (i.total_ctn || 0), 0);
    return Math.max(0, recvByCtn - issued);
  }, [cartons, issues]);

  // ---------- Top 5 buyers (last 7 days, recv+issue ctn) ----------
  const topBuyers = useMemo(() => {
    const cutoff = Date.now() - 7 * DAY_MS;
    const recvById = new Map(recvs.map(r => [r.id, r] as const));
    const tally = new Map<string, { recv: number; issue: number }>();
    const ensure = (b: string) => {
      if (!tally.has(b)) tally.set(b, { recv: 0, issue: 0 });
      return tally.get(b)!;
    };
    cartons.forEach(c => {
      const r = recvById.get(c.receive_id);
      if (!r || !r.buyer) return;
      if (new Date(c.created_at).getTime() < cutoff) return;
      ensure(r.buyer).recv += c.ctn_qty || 0;
    });
    issues.forEach(i => {
      const r = recvById.get(i.receive_id);
      if (!r || !r.buyer) return;
      if (new Date(i.issued_at).getTime() < cutoff) return;
      ensure(r.buyer).issue += i.total_ctn || 0;
    });
    return Array.from(tally.entries())
      .map(([buyer, v]) => ({ buyer, recv: v.recv, issue: v.issue, total: v.recv + v.issue }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [recvs, cartons, issues]);

  // ---------- Daily timeline (last 14 days) ----------
  const timeline = useMemo(() => {
    const days: string[] = [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    for (let n = 13; n >= 0; n--) days.push(dayKey(new Date(start.getTime() - n * DAY_MS)));
    const map = new Map<string, { day: string; receives: number; issues: number; returns: number }>();
    days.forEach(d => map.set(d, { day: shortDay(d), receives: 0, issues: 0, returns: 0 }));
    cartons.forEach(c => {
      const k = dayKey(c.created_at);
      if (map.has(k)) map.get(k)!.receives += c.ctn_qty || 0;
    });
    issues.forEach(i => {
      const k = dayKey(i.issued_at);
      if (map.has(k)) map.get(k)!.issues += i.total_ctn || 0;
    });
    lines.forEach(l => {
      if (!l.returned_ctn) return;
      const k = dayKey(l.created_at);
      if (map.has(k)) map.get(k)!.returns += l.returned_ctn || 0;
    });
    return days.map(d => map.get(d)!);
  }, [cartons, issues, lines]);

  // ---------- Stock aging (30+ days, still has stock) ----------
  const agingStock = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY_MS;
    const ctnByRecv = new Map<string, number>();
    cartons.forEach(c => ctnByRecv.set(c.receive_id, (ctnByRecv.get(c.receive_id) || 0) + (c.ctn_qty || 0)));
    const issuedByRecv = new Map<string, number>();
    issues.forEach(i => issuedByRecv.set(i.receive_id, (issuedByRecv.get(i.receive_id) || 0) + (i.total_ctn || 0)));
    return recvs
      .map(r => {
        const stock = (ctnByRecv.get(r.id) || 0) - (issuedByRecv.get(r.id) || 0);
        const ageDays = Math.floor((Date.now() - new Date(r.updated_at || r.created_at).getTime()) / DAY_MS);
        return { ...r, stock, ageDays };
      })
      .filter(r => r.stock > 0 && new Date(r.updated_at || r.created_at).getTime() < cutoff)
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 10);
  }, [recvs, cartons, issues]);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI icon={<PackagePlus className="h-4 w-4" />} label="Today's Receives" value={`${todayRecvCtn} CTN`} accent="border-blue-500/70 bg-blue-500/5 text-blue-700 dark:text-blue-300" />
        <KPI icon={<Truck className="h-4 w-4" />} label="Today's Shipments" value={`${todayShipCtn} CTN`} accent="border-violet-500/70 bg-violet-500/5 text-violet-700 dark:text-violet-300" />
        <KPI icon={<RotateCcw className="h-4 w-4" />} label="Pending Returns" value={`${pendingReturns}`} accent="border-amber-500/70 bg-amber-500/5 text-amber-700 dark:text-amber-300" />
        <KPI icon={<Activity className="h-4 w-4" />} label="Active Stock" value={`${totalActiveStockCtn} CTN`} accent="border-emerald-500/70 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" />
        <KPI icon={<Users className="h-4 w-4" />} label="Users Online" value={`${onlineCount}`} accent="border-pink-500/70 bg-pink-500/5 text-pink-700 dark:text-pink-300" pulse={onlineCount > 0} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-2 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Top 5 Active Buyers (last 7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topBuyers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No activity in the last 7 days.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topBuyers} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="buyer" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="recv" name="Received" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="issue" name="Issued" fill="hsl(262 83% 58%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Daily Activity (last 14 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="receives" name="Receives" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="issues" name="Issues" stroke="hsl(262 83% 58%)" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="returns" name="Returns" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock alerts */}
      <Card className="border-2 border-amber-500/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Aging Stock Alert
            <span className="text-xs font-normal text-muted-foreground">(no movement in 30+ days, top 10)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agingStock.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No aging stock. All recent activity is healthy.</p>
          ) : (
            <div className="space-y-2">
              {agingStock.map(s => (
                <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-2 border-amber-500/40 bg-amber-500/5 rounded-lg p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">
                        {officeName.get(s.office_id) || '—'}
                      </Badge>
                      <span className="text-sm font-semibold truncate">{s.buyer || 'Unknown buyer'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {s.ageDays} days since last activity · entry {s.entry_date}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-amber-700 dark:text-amber-300 leading-none">{s.stock}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CTN in stock</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const KPI = ({
  icon, label, value, accent, pulse,
}: { icon: React.ReactNode; label: string; value: string; accent: string; pulse?: boolean }) => (
  <div className={`rounded-xl border-2 p-3 ${accent} relative overflow-hidden`}>
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-90">
      {icon} {label}
      {pulse && <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
    </div>
    <div className="mt-1.5 text-xl sm:text-2xl font-bold">{value}</div>
  </div>
);

export default AdminInsights;
