import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Printer, Search } from 'lucide-react';
import { exportToExcel, printElement } from '@/lib/exportExcel';
import { toast } from 'sonner';

interface HRow {
  id: string; carton_id: string | null; office_id: string | null;
  action: string; changed_by_name: string | null; details: unknown; created_at: string;
}

const CartonHistory = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<HRow[]>([]);
  const [offices, setOffices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const canSeeAll = user && (user.role === 'management' || user.role === 'super_admin');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let q = supabase.from('carton_history').select('*').order('created_at', { ascending: false }).limit(500);
      if (!canSeeAll && user.office_id) q = q.eq('office_id', user.office_id);
      const { data } = await q;
      setRows((data as HRow[]) || []);
      const { data: oData } = await supabase.from('offices').select('id, name');
      const m: Record<string, string> = {};
      (oData || []).forEach(o => { m[o.id] = o.name; });
      setOffices(m);
    };
    load();
    const ch = supabase.channel('hist-ch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'carton_history' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, canSeeAll]);

  if (!user) return <Navigate to="/login" replace />;

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    if (!q) return true;
    const d = JSON.stringify(r.details || '').toLowerCase();
    return (r.changed_by_name || '').toLowerCase().includes(q) || r.action.includes(q) || d.includes(q);
  });

  const doExcel = () => {
    if (!user.can_excel) { toast.error('Excel permission নেই'); return; }
    exportToExcel(filtered.map(r => ({
      Time: new Date(r.created_at).toLocaleString(),
      Office: offices[r.office_id || ''] || '-',
      Action: r.action, User: r.changed_by_name, Details: JSON.stringify(r.details || {}),
    })), `history-${new Date().toISOString().slice(0, 10)}`);
  };
  const doPrint = () => {
    if (!user.can_print) { toast.error('Print permission নেই'); return; }
    printElement('history-table', 'Carton History');
  };

  return (
    <AppLayout>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Update History</CardTitle>
          <div className="flex gap-2">
            <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-48" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            {user.can_excel && <Button variant="outline" size="sm" onClick={doExcel}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>}
            {user.can_print && <Button variant="outline" size="sm" onClick={doPrint}><Printer className="h-4 w-4 mr-1" />Print</Button>}
          </div>
        </CardHeader>
        <CardContent>
          <div id="history-table" className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Time</TableHead><TableHead>Office</TableHead>
                <TableHead>Action</TableHead><TableHead>User</TableHead><TableHead>Details</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No history</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell>{offices[r.office_id || ''] || '-'}</TableCell>
                    <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.action}</span></TableCell>
                    <TableCell>{r.changed_by_name}</TableCell>
                    <TableCell className="text-xs max-w-md truncate">{JSON.stringify(r.details || {})}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default CartonHistory;
