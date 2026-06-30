import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Send, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { logHistoryAndNotify } from '@/lib/notify';

interface Carton {
  id: string; office_id: string; carton_no: string; buyer: string | null;
  style: string | null; color: string | null; size: string | null;
  quantity: number; status: string; issued_to: string | null; inspection_notes: string | null;
}

const IssueInspection = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Carton[]>([]);
  const [officeName, setOfficeName] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [target, setTarget] = useState<Carton | null>(null);
  const [issueTo, setIssueTo] = useState('');
  const [inspectStatus, setInspectStatus] = useState<'pass' | 'fail' | 'inspection_pending'>('pass');
  const [inspectNotes, setInspectNotes] = useState('');

  const officeId = user?.office_id;

  const load = async () => {
    if (!officeId) return;
    const { data } = await supabase.from('cartons').select('*').eq('office_id', officeId).order('created_at', { ascending: false });
    setRows((data as Carton[]) || []);
  };

  useEffect(() => {
    if (!officeId) return;
    load();
    supabase.from('offices').select('name').eq('id', officeId).maybeSingle().then(({ data }) => setOfficeName(data?.name || ''));
    const ch = supabase.channel('issue-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons', filter: `office_id=eq.${officeId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [officeId]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'store_user') return <Navigate to="/dashboard" replace />;
  if (!officeId) return <AppLayout><div className="p-6 text-center text-muted-foreground">No office assigned.</div></AppLayout>;

  const openIssue = (r: Carton) => {
    if (!user.can_edit) { toast.error('Permission নেই'); return; }
    setTarget(r); setIssueTo(''); setIssueOpen(true);
  };
  const openInspect = (r: Carton) => {
    if (!user.can_edit) { toast.error('Permission নেই'); return; }
    setTarget(r); setInspectStatus('pass'); setInspectNotes(''); setInspectOpen(true);
  };

  const doIssue = async () => {
    if (!target || !issueTo.trim()) { toast.error('Issued To দিন'); return; }
    const { error } = await supabase.from('cartons').update({
      status: 'issued', issued_to: issueTo, issued_at: new Date().toISOString(),
    }).eq('id', target.id);
    if (error) { toast.error(error.message); return; }
    await logHistoryAndNotify({
      user, officeId, officeName, cartonId: target.id, cartonNo: target.carton_no,
      action: 'issued', message: `Carton ${target.carton_no} issued to ${issueTo}`,
      details: { issued_to: issueTo },
    });
    toast.success('Issued');
    setIssueOpen(false);
  };

  const doInspect = async () => {
    if (!target) return;
    const { error } = await supabase.from('cartons').update({
      status: inspectStatus, inspection_notes: inspectNotes || null,
    }).eq('id', target.id);
    if (error) { toast.error(error.message); return; }
    await logHistoryAndNotify({
      user, officeId, officeName, cartonId: target.id, cartonNo: target.carton_no,
      action: 'inspected', message: `Carton ${target.carton_no} inspected: ${inspectStatus}`,
      details: { status: inspectStatus, notes: inspectNotes },
    });
    toast.success('Inspection saved');
    setInspectOpen(false);
  };

  return (
    <AppLayout>
      <Card>
        <CardHeader><CardTitle>Issue & Inspection — {officeName}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carton No</TableHead>
                  <TableHead>Buyer/Style</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">কোনো carton নেই</TableCell></TableRow>
                ) : rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.carton_no}</TableCell>
                    <TableCell>{r.buyer} / {r.style}</TableCell>
                    <TableCell>{r.quantity}</TableCell>
                    <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span></TableCell>
                    <TableCell>{r.issued_to || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {user.can_edit && r.status !== 'issued' && (
                          <Button variant="outline" size="sm" onClick={() => openIssue(r)}><Send className="h-3.5 w-3.5 mr-1" />Issue</Button>
                        )}
                        {user.can_edit && (
                          <Button variant="outline" size="sm" onClick={() => openInspect(r)}><ClipboardCheck className="h-3.5 w-3.5 mr-1" />Inspect</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue Carton {target?.carton_no}</DialogTitle></DialogHeader>
          <div><label className="text-xs">Issue To *</label><Input value={issueTo} onChange={e => setIssueTo(e.target.value)} placeholder="Party / Truck / Dispatch ref" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button><Button onClick={doIssue}>Confirm Issue</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inspection — {target?.carton_no}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs">Status</label>
              <Select value={inspectStatus} onValueChange={(v) => setInspectStatus(v as typeof inspectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                  <SelectItem value="inspection_pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs">Notes</label><Textarea value={inspectNotes} onChange={e => setInspectNotes(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setInspectOpen(false)}>Cancel</Button><Button onClick={doInspect}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default IssueInspection;
