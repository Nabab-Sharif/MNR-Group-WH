import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Monitor, Smartphone, History as HistoryIcon } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

const ONLINE_THRESHOLD_MS = 90_000; // 90s — heartbeat is 45s

export interface Session {
  id: string;
  user_id: string;
  login_at: string;
  last_seen_at: string;
  logout_at: string | null;
  user_agent: string | null;
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('user_sessions')
        .select('*')
        .order('login_at', { ascending: false })
        .limit(2000);
      setSessions((data as Session[]) || []);
    };
    load();
    const ch = supabase.channel('user-sessions-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_sessions' }, load)
      .subscribe();
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { supabase.removeChannel(ch); window.clearInterval(tick); };
  }, []);

  // latest session per user
  const latestByUser = useMemo(() => {
    const m = new Map<string, Session>();
    for (const s of sessions) {
      const prev = m.get(s.user_id);
      if (!prev || new Date(s.last_seen_at) > new Date(prev.last_seen_at)) m.set(s.user_id, s);
    }
    return m;
  }, [sessions]);

  const isOnline = (userId: string) => {
    const s = latestByUser.get(userId);
    if (!s || s.logout_at) return false;
    return now - new Date(s.last_seen_at).getTime() < ONLINE_THRESHOLD_MS;
  };

  const lastSeen = (userId: string) => latestByUser.get(userId)?.last_seen_at || null;

  const forUser = (userId: string) => sessions.filter(s => s.user_id === userId);

  return { sessions, isOnline, lastSeen, forUser, onlineCount: [...latestByUser.values()].filter(s => !s.logout_at && now - new Date(s.last_seen_at).getTime() < ONLINE_THRESHOLD_MS).length };
}

export function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      title={online ? 'Online' : 'Offline'}
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${online ? 'bg-emerald-500 animate-pulse ring-2 ring-emerald-500/30' : 'bg-muted-foreground/40'}`}
    />
  );
}

const deviceIcon = (ua: string | null) => {
  if (!ua) return <Monitor className="h-3.5 w-3.5" />;
  return /mobile|android|iphone|ipad/i.test(ua)
    ? <Smartphone className="h-3.5 w-3.5" />
    : <Monitor className="h-3.5 w-3.5" />;
};

const shortDevice = (ua: string | null) => {
  if (!ua) return '—';
  const m = ua.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/);
  const browser = m ? m[0].split('/')[0] : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ' · ' + os : ''}`;
};

export function UserSessionsDialog({
  open, onOpenChange, userName, sessions, isCurrentlyOnline,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userName: string;
  sessions: Session[];
  isCurrentlyOnline: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-primary" />
            {userName}
            <Badge variant={isCurrentlyOnline ? 'default' : 'secondary'} className={isCurrentlyOnline ? 'bg-emerald-500 hover:bg-emerald-500' : ''}>
              {isCurrentlyOnline ? 'Online now' : 'Offline'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Login activity (most recent first) — {sessions.length} session{sessions.length === 1 ? '' : 's'}</p>
        <div className="max-h-[60vh] overflow-y-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Last seen / Logout</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No sessions yet</TableCell></TableRow>
              ) : sessions.map(s => {
                const login = new Date(s.login_at);
                const end = new Date(s.logout_at || s.last_seen_at);
                const mins = Math.max(1, Math.round((end.getTime() - login.getTime()) / 60000));
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-medium">{format(login, 'EEE')}</TableCell>
                    <TableCell className="text-xs">{format(login, 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-xs">{format(login, 'hh:mm a')}</TableCell>
                    <TableCell className="text-xs">
                      {s.logout_at
                        ? <span>{format(new Date(s.logout_at), 'hh:mm a')} <Badge variant="outline" className="ml-1 text-[10px]">logged out</Badge></span>
                        : <span>{format(new Date(s.last_seen_at), 'hh:mm a')} <span className="text-muted-foreground">({formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true })})</span></span>}
                    </TableCell>
                    <TableCell className="text-xs">{mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}</TableCell>
                    <TableCell className="text-xs flex items-center gap-1.5">
                      {deviceIcon(s.user_agent)} {shortDevice(s.user_agent)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
