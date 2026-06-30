import { useState, useEffect, useRef } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Bell, X, Trash2, Package, PencilLine, Truck, TestTube2, AlertTriangle, Sparkles, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { playBeep } from '@/lib/notify';
import { softDelete } from '@/lib/recycleBin';

interface Notification {
  id: string;
  office_id: string | null;
  office_name: string | null;
  carton_id: string | null;
  carton_no: string | null;
  action: string;
  message: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  read_by: unknown;
  route: string | null;
  field_changed: string | null;
}

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  const canSeeAll = user && (user.role === 'management' || user.role === 'super_admin');

  const load = async () => {
    if (!user) return;
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200);
    if (!canSeeAll && user.office_id) q = q.eq('office_id', user.office_id);
    const { data } = await q;
    const filtered = ((data as (Notification & { hidden_by?: unknown })[]) || []).filter(n => {
      const h = Array.isArray(n.hidden_by) ? (n.hidden_by as string[]) : [];
      return !h.includes(user.id);
    });
    setItems(filtered.slice(0, 100));
  };

  useEffect(() => {
    if (!user) return;
    load();
    firstLoad.current = true;
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new as Notification;
        if (!canSeeAll && user.office_id && n.office_id !== user.office_id) return;
        setItems(prev => prev.some(i => i.id === n.id) ? prev : [n, ...prev].slice(0, 100));
        if (n.created_by !== user.id) {
          playBeep();
          toast.info(`${n.office_name || 'Office'}: ${n.message}`, { id: `notif-${n.id}`, duration: 4000 });
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setItems(prev => prev.filter(i => i.id !== id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [isOpen]);

  const unread = items.filter(n => {
    const arr = Array.isArray(n.read_by) ? (n.read_by as string[]) : [];
    return !arr.includes(user!.id);
  });

  const handleClick = async (n: Notification) => {
    // mark read
    if (user) {
      const arr = Array.isArray(n.read_by) ? (n.read_by as string[]) : [];
      if (!arr.includes(user.id)) {
        await supabase.from('notifications').update({ read_by: [...arr, user.id] }).eq('id', n.id);
      }
    }
    setIsOpen(false);
    if (n.route) {
      navigate(n.route);
    } else if (n.carton_id) {
      const params = new URLSearchParams({ highlight: n.carton_id });
      if (n.field_changed) params.set('field', n.field_changed);
      navigate(`/stock?${params.toString()}`);
    }
  };

  const canClear = true; // per-user hide; everyone can clear their own view

  const hideForMe = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const { data } = await supabase.from('notifications').select('id, hidden_by').in('id', ids);
    await Promise.all((data || []).map(row => {
      const arr = Array.isArray((row as { hidden_by?: unknown }).hidden_by) ? ((row as { hidden_by: string[] }).hidden_by) : [];
      if (arr.includes(user.id)) return Promise.resolve();
      return supabase.from('notifications').update({ hidden_by: [...arr, user.id] } as never).eq('id', (row as { id: string }).id);
    }));
  };

  const deleteOne = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await hideForMe([id]); }
    catch (err) { return toast.error((err as Error).message); }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const clearAll = async () => {
    if (!await confirmDialog({ description: 'Clear all notifications?' })) return;
    const ids = items.map(i => i.id);
    if (ids.length === 0) return;
    try { await hideForMe(ids); }
    catch (err) { return toast.error((err as Error).message); }
    setItems([]);
  };


  const markAllRead = async () => {
    if (!user) return;
    const toMark = items.filter(n => {
      const arr = Array.isArray(n.read_by) ? (n.read_by as string[]) : [];
      return !arr.includes(user.id);
    });
    if (toMark.length === 0) return;
    await Promise.all(toMark.map(n => {
      const arr = Array.isArray(n.read_by) ? (n.read_by as string[]) : [];
      return supabase.from('notifications').update({ read_by: [...arr, user.id] }).eq('id', n.id);
    }));
    setItems(prev => prev.map(n => {
      const arr = Array.isArray(n.read_by) ? (n.read_by as string[]) : [];
      return arr.includes(user.id) ? n : { ...n, read_by: [...arr, user.id] };
    }));
  };

  const getActionMeta = (action: string) => {
    const a = (action || '').toLowerCase();
    if (a.includes('delete') || a.includes('remove')) return { Icon: Trash2, tone: 'bg-destructive/15 text-destructive ring-destructive/20', border: 'border-destructive' };
    if (a.includes('ship')) return { Icon: Truck, tone: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 ring-orange-500/20', border: 'border-orange-500' };
    if (a.includes('sample') || a.includes('insp')) return { Icon: TestTube2, tone: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-purple-500/20', border: 'border-purple-500' };
    if (a.includes('edit') || a.includes('update') || a.includes('change')) return { Icon: PencilLine, tone: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-blue-500/20', border: 'border-blue-500' };
    if (a.includes('alert') || a.includes('warn')) return { Icon: AlertTriangle, tone: 'bg-warning/15 text-warning ring-warning/20', border: 'border-warning' };
    if (a.includes('add') || a.includes('receive') || a.includes('create')) return { Icon: Package, tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20', border: 'border-emerald-500' };
    return { Icon: Sparkles, tone: 'bg-primary/15 text-primary ring-primary/20', border: 'border-primary' };
  };

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      <Button variant="ghost" size="icon" className="text-foreground hover:text-foreground hover:bg-primary/10 relative" onClick={() => setIsOpen(!isOpen)}>
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <>
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white bg-destructive shadow-md shadow-destructive/40">
              {unread.length > 99 ? '99+' : unread.length}
            </span>
            <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-destructive/40 animate-ping" />
          </>
        )}
      </Button>
      {isOpen && (
        <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto top-16 sm:top-12 sm:right-0 sm:left-auto sm:w-[440px] max-h-[80vh] sm:max-h-[78vh] overflow-hidden z-50 bg-card border border-border rounded-2xl shadow-2xl shadow-primary/10 flex flex-col animate-scale-in origin-top-right">

          {/* Header */}
          <div className="relative shrink-0 p-2.5 sm:p-3 border-b border-border bg-card">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/20 shrink-0">
                  <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="leading-tight min-w-0">
                  <p className="text-xs sm:text-sm font-bold tracking-tight text-foreground truncate">Notifications</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">
                    {unread.length > 0 ? `${unread.length} unread · ${items.length} total` : `${items.length} total`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {unread.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 sm:px-2 text-[10px] sm:text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/20" onClick={markAllRead}>
                    <CheckCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Mark read</span>
                  </Button>
                )}
                {items.length > 0 && canClear && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 sm:px-2 text-[10px] sm:text-[11px] text-destructive bg-destructive/10 hover:bg-destructive/20" onClick={clearAll}>
                    <Trash2 className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">Clear</span>
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive ring-1 ring-destructive/20" onClick={() => setIsOpen(false)}>
                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 scrollbar-line">
            {items.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center ring-1 ring-border">
                  <Bell className="h-6 w-6 opacity-40" />
                </div>
                <p className="text-sm font-semibold text-foreground">You're all caught up</p>
                <p className="text-xs mt-0.5">No notifications yet</p>
              </div>
            ) : (
              <ul className="p-1.5 sm:p-2 space-y-1.5 sm:space-y-2">
                {items.map(n => {
                  const arr = Array.isArray(n.read_by) ? (n.read_by as string[]) : [];
                  const isUnread = !arr.includes(user.id);
                  const d = (n as unknown as { details?: Record<string, unknown> }).details || {};
                  const si = (d as { si_no?: string }).si_no;
                  const style = (d as { style_no?: string }).style_no;
                  const po = (d as { po_no?: string }).po_no;
                  const { Icon, tone, border } = getActionMeta(n.action);
                  return (
                    <li
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`group relative cursor-pointer rounded-lg border border-l-[3px] ${border} px-2 py-1.5 sm:px-2.5 sm:py-2 transition-colors ${isUnread ? 'bg-primary/[0.04] hover:bg-primary/[0.08]' : 'bg-card hover:bg-muted/40'}`}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className={`shrink-0 h-7 w-7 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl flex items-center justify-center ring-1 ${tone}`}>
                          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-[10px] sm:text-[11px] font-bold text-foreground break-words flex-1 min-w-0">{n.office_name || 'System'}</span>
                            <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0 h-3 sm:h-3.5 capitalize border-border/80 shrink-0">{n.action}</Badge>
                            {n.field_changed && <Badge variant="secondary" className="text-[8px] sm:text-[9px] px-1 py-0 h-3 sm:h-3.5 shrink-0">{n.field_changed}</Badge>}
                            {isUnread && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]" />}
                          </div>
                          <p className={`text-[10px] sm:text-xs mt-0.5 leading-snug break-words ${isUnread ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>{n.message}</p>
                          {(n.carton_no || si || style || po) && (
                            <div className="flex gap-1 sm:gap-1.5 flex-wrap mt-1 sm:mt-2">
                              {n.carton_no && <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-md bg-muted/70 text-muted-foreground">CTN <b className="text-foreground">{n.carton_no}</b></span>}
                              {si && <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-md bg-muted/70 text-muted-foreground">SI <b className="text-foreground">{String(si)}</b></span>}
                              {style && <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-md bg-muted/70 text-muted-foreground">Style <b className="text-foreground">{String(style)}</b></span>}
                              {po && <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-md bg-muted/70 text-muted-foreground">PO <b className="text-foreground">{String(po)}</b></span>}
                            </div>
                          )}
                          <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-1 sm:mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="truncate font-medium text-foreground/80">{n.created_by_name || 'Unknown'}</span>
                            <span className="opacity-50">•</span>
                            <span className="font-semibold text-primary/80">{new Date(n.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' })}</span>
                            <span className="opacity-50">•</span>
                            <span>{new Date(n.created_at).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Dhaka' })}</span>
                            <span className="opacity-50">•</span>
                            <span className="italic">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                          </div>
                        </div>
                        {canClear && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            onClick={(e) => deleteOne(n.id, e)}
                          >
                            <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
