import { useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Trash2, X, Bell, Search, Plus, Pencil, Trash, Package,
  Sparkles, Filter, ChevronRight, Clock, User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { softDelete } from '@/lib/recycleBin';

interface N {
  id: string; office_id: string | null; office_name: string | null;
  carton_id: string | null; carton_no: string | null;
  action: string; message: string;
  created_by_name: string | null; created_at: string;
  route: string | null; field_changed: string | null;
  details: Record<string, unknown> | null;
}

type ActionMeta = { icon: typeof Plus; tone: string; bg: string; ring: string; label: string };

const META: Record<string, ActionMeta> = {
  create:  { icon: Plus,    tone: 'text-emerald-600',  bg: 'bg-emerald-500/10',  ring: 'ring-emerald-500/30',  label: 'Created' },
  insert:  { icon: Plus,    tone: 'text-emerald-600',  bg: 'bg-emerald-500/10',  ring: 'ring-emerald-500/30',  label: 'Created' },
  update:  { icon: Pencil,  tone: 'text-sky-600',      bg: 'bg-sky-500/10',      ring: 'ring-sky-500/30',      label: 'Updated' },
  edit:    { icon: Pencil,  tone: 'text-sky-600',      bg: 'bg-sky-500/10',      ring: 'ring-sky-500/30',      label: 'Updated' },
  delete:  { icon: Trash,   tone: 'text-rose-600',     bg: 'bg-rose-500/10',     ring: 'ring-rose-500/30',     label: 'Deleted' },
  issue:   { icon: Package, tone: 'text-violet-600',   bg: 'bg-violet-500/10',   ring: 'ring-violet-500/30',   label: 'Issued' },
  default: { icon: Sparkles,tone: 'text-primary',      bg: 'bg-primary/10',      ring: 'ring-primary/30',      label: 'Activity' },
};
const metaFor = (a: string) => META[a.toLowerCase()] || META.default;

const bucketLabel = (d: Date) => {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, d MMM yyyy');
};

const NotificationsTab = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<N[]>([]);
  const [query, setQuery] = useState('');
  const [activeAction, setActiveAction] = useState<string>('all');
  const [activeOffice, setActiveOffice] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('notifications').select('*').order('created_at', { ascending: false }).limit(200);
      setItems(((data || []) as unknown) as N[]);
    };
    load();
    const ch = supabase.channel('notifs-tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const open = (n: N) => {
    if (n.route) navigate(n.route);
    else if (n.carton_id) navigate(`/stock?highlight=${n.carton_id}${n.field_changed ? `&field=${n.field_changed}` : ''}`);
  };

  const canClear = !!(user?.can_clear_notifications || user?.role === 'super_admin');

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canClear) return toast.error('No permission to delete notifications');
    try { await softDelete('notifications', [id], { user }); }
    catch (err) { return toast.error((err as Error).message); }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const clearAll = async () => {
    if (!canClear) return toast.error('No permission to clear notifications');
    if (!await confirmDialog({ description: 'Clear all notifications?' })) return;
    try { await softDelete('notifications', items.map(i => i.id), { user }); }
    catch (err) { return toast.error((err as Error).message); }
    setItems([]);
    toast.success('Deleted');
  };

  const actions = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach(i => counts.set(i.action, (counts.get(i.action) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const offices = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => i.office_name && s.add(i.office_name));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(n => {
      if (activeAction !== 'all' && n.action !== activeAction) return false;
      if (activeOffice !== 'all' && n.office_name !== activeOffice) return false;
      if (!q) return true;
      const hay = [n.message, n.office_name, n.carton_no, n.created_by_name, n.action,
        (n.details as { si_no?: string })?.si_no, (n.details as { style_no?: string })?.style_no,
        (n.details as { po_no?: string })?.po_no].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, activeAction, activeOffice]);

  const grouped = useMemo(() => {
    const g = new Map<string, N[]>();
    filtered.forEach(n => {
      const key = bucketLabel(new Date(n.created_at));
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(n);
    });
    return Array.from(g.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Hero header */}
      <Card className="border-primary/20 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight">Notifications</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filtered.length} of {items.length} activity {items.length === 1 ? 'event' : 'events'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && canClear && (
                <Button variant="outline" size="sm" onClick={clearAll} className="border-destructive/40 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4 mr-1.5" />Clear all
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by buyer, SI, style, carton, user…"
                className="pl-8 h-9 bg-background/70 backdrop-blur"
              />
            </div>
            {offices.length > 0 && (
              <select
                value={activeOffice}
                onChange={e => setActiveOffice(e.target.value)}
                className="h-9 px-2.5 rounded-md border border-input bg-background/70 text-sm"
              >
                <option value="all">All offices</option>
                {offices.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </div>

          {actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 items-center">
              <Filter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
              <button
                onClick={() => setActiveAction('all')}
                className={cn(
                  'text-[11px] px-2.5 py-1 rounded-full border transition',
                  activeAction === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background/60 border-border hover:bg-primary/10',
                )}
              >
                All <span className="opacity-70">· {items.length}</span>
              </button>
              {actions.map(([a, c]) => {
                const m = metaFor(a);
                const active = activeAction === a;
                return (
                  <button
                    key={a}
                    onClick={() => setActiveAction(active ? 'all' : a)}
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : `${m.bg} ${m.tone} border-transparent hover:ring-1 ${m.ring}`,
                    )}
                  >
                    <m.icon className="h-3 w-3" />
                    {m.label} <span className="opacity-70">· {c}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs text-muted-foreground mt-1">You'll see live activity here as it happens.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, ns]) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  {day} · {ns.length}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="relative pl-4 sm:pl-6">
                {/* Timeline rail */}
                <div className="absolute left-1.5 sm:left-2.5 top-1 bottom-1 w-px bg-border" />
                <div className="space-y-2">
                  {ns.map(n => {
                    const m = metaFor(n.action);
                    const d = n.details || {};
                    const si = (d as { si_no?: string }).si_no;
                    const style = (d as { style_no?: string }).style_no;
                    const po = (d as { po_no?: string }).po_no;
                    return (
                      <div key={n.id} className="relative group">
                        {/* Timeline dot */}
                        <div className={cn(
                          'absolute -left-[14px] sm:-left-[18px] top-3 h-3 w-3 rounded-full ring-2 ring-background',
                          m.bg.replace('/10', ''),
                        )} />
                        <Card
                          onClick={() => open(n)}
                          className={cn(
                            'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5',
                            'border-l-4 overflow-hidden',
                          )}
                          style={{ borderLeftColor: `hsl(var(--primary) / 0.45)` }}
                        >
                          <CardContent className="p-3 sm:p-3.5 flex items-start gap-3">
                            <div className={cn(
                              'h-9 w-9 rounded-lg flex-shrink-0 flex items-center justify-center ring-1',
                              m.bg, m.ring,
                            )}>
                              <m.icon className={cn('h-4 w-4', m.tone)} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {n.office_name && (
                                  <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
                                    {n.office_name}
                                  </span>
                                )}
                                <Badge variant="outline" className={cn('text-[10px] border-0', m.bg, m.tone)}>
                                  {m.label}
                                </Badge>
                                {n.field_changed && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {n.field_changed}
                                  </Badge>
                                )}
                              </div>

                              <p className="text-sm font-medium mt-1 leading-snug">{n.message}</p>

                              {(n.carton_no || si || style || po) && (
                                <div className="flex gap-1.5 flex-wrap mt-2">
                                  {n.carton_no && <Chip k="CTN" v={n.carton_no} />}
                                  {si && <Chip k="SI" v={String(si)} />}
                                  {style && <Chip k="Style" v={String(style)} />}
                                  {po && <Chip k="PO" v={String(po)} />}
                                </div>
                              )}

                              <div className="flex items-center gap-3 mt-2 text-[10.5px] text-muted-foreground">
                                {n.created_by_name && (
                                  <span className="inline-flex items-center gap-1">
                                    <User className="h-3 w-3" />{n.created_by_name}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                                </span>
                                <span className="opacity-60 hidden sm:inline">
                                  {format(new Date(n.created_at), 'p')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 self-center">
                              {canClear && (
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                                  onClick={(e) => del(n.id, e)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition" />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Chip = ({ k, v }: { k: string; v: string }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 border border-border text-[10px]">
    <span className="text-muted-foreground font-semibold">{k}</span>
    <span className="font-bold text-foreground">{v}</span>
  </span>
);

export default NotificationsTab;
