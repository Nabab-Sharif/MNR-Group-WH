import { useEffect, useState } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Building2, Package, MapPin, Truck, TestTube2, Database, MoreVertical, Search, FileDown, Users, Filter, BarChart3, Wrench } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import DataManagement from '@/components/admin/DataManagement';
import RecycleBin from '@/components/admin/RecycleBin';
import AdminInsights from '@/components/admin/AdminInsights';
import AdminTools from '@/components/admin/AdminTools';
import { useSessions, PresenceDot, UserSessionsDialog } from '@/components/admin/UserPresence';
import { exportToExcel } from '@/lib/exportExcel';
import { softDelete } from '@/lib/recycleBin';
import { toast } from 'sonner';
import type { Role } from '@/contexts/AuthContext';

interface Office { id: string; name: string; location: string | null; is_active: boolean; }
interface AppUserRow {
  id: string; access_id: string; name: string; role: Role; office_id: string | null;
  phone: string | null; destination: string | null;
  can_add: boolean; can_edit: boolean; can_delete: boolean; can_print: boolean; can_excel: boolean; can_delete_history: boolean; can_clear_notifications: boolean; is_active: boolean;
}
interface RecvRow {
  office_id: string;
  receive_cartons: { ctn_qty: number; pcs_per_ctn: number }[] | null;
  receive_issues: { issue_type: string; total_ctn: number; total_pcs: number }[] | null;
}
interface Summary {
  id: string; name: string; location: string | null;
  recvCtn: number; recvPcs: number;
  stockCtn: number; stockPcs: number;
  shipmentCtn: number; shipmentPcs: number;
  sampleCtn: number; samplePcs: number;
}

const AdminPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offices, setOffices] = useState<Office[]>([]);
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [rows, setRows] = useState<RecvRow[]>([]);
  const presence = useSessions();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [officeSearch, setOfficeSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');

  // Office dialog
  const [oOpen, setOOpen] = useState(false);
  const [oEdit, setOEdit] = useState<Office | null>(null);
  const [oForm, setOForm] = useState({ name: '', location: '' });

  // User dialog
  const [uOpen, setUOpen] = useState(false);
  const [uEdit, setUEdit] = useState<AppUserRow | null>(null);
  const [uForm, setUForm] = useState<Omit<AppUserRow, 'id'>>({
    access_id: '', name: '', role: 'store_user', office_id: null,
    phone: '', destination: '',
    can_add: false, can_edit: false, can_delete: false, can_print: false, can_excel: false, can_delete_history: false, can_clear_notifications: false, is_active: true,
  });

  const load = async () => {
    const [o, u, c] = await Promise.all([
      supabase.from('offices').select('*').order('name'),
      supabase.from('app_users').select('*').order('created_at', { ascending: false }),
      supabase.from('receives').select('office_id, receive_cartons(ctn_qty, pcs_per_ctn), receive_issues(issue_type, total_ctn, total_pcs)'),
    ]);
    setOffices((o.data as Office[]) || []);
    setUsers((u.data as AppUserRow[]) || []);
    setRows((c.data as unknown as RecvRow[]) || []);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase.channel('admin-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receives' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_cartons' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receive_issues' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offices' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'super_admin') return <Navigate to="/management" replace />;

  // Office ops
  const openOAdd = () => { setOEdit(null); setOForm({ name: '', location: '' }); setOOpen(true); };
  const openOEdit = (o: Office) => { setOEdit(o); setOForm({ name: o.name, location: o.location || '' }); setOOpen(true); };
  const saveO = async () => {
    if (!oForm.name.trim()) { toast.error('Name required'); return; }
    if (oEdit) {
      const { error } = await supabase.from('offices').update({ name: oForm.name, location: oForm.location || null }).eq('id', oEdit.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from('offices').insert({ name: oForm.name, location: oForm.location || null });
      if (error) { toast.error(error.message); return; }
    }
    toast.success('Saved'); setOOpen(false); load();
  };
  const delO = async (o: Office) => {
    if (!await confirmDialog({ description: `Delete office ${o.name}? এর সব data মুছে যাবে।` })) return;
    try {
      await softDelete('offices', [o.id], { user });
      toast.success('Deleted'); load();
    } catch (e) { toast.error((e as Error).message); }
  };

  // User ops
  const openUAdd = () => {
    setUEdit(null);
    setUForm({
      access_id: '', name: '', role: 'store_user', office_id: null,
      phone: '', destination: '',
      can_add: false, can_edit: false, can_delete: false, can_print: false, can_excel: false, can_delete_history: false, can_clear_notifications: false, is_active: true,
    });
    setUOpen(true);
  };
  const openUEdit = (u: AppUserRow) => {
    setUEdit(u);
    setUForm({
      access_id: u.access_id, name: u.name, role: u.role, office_id: u.office_id,
      phone: u.phone || '', destination: u.destination || '',
      can_add: u.can_add, can_edit: u.can_edit, can_delete: u.can_delete,
      can_print: u.can_print, can_excel: u.can_excel, can_delete_history: u.can_delete_history, can_clear_notifications: u.can_clear_notifications, is_active: u.is_active,
    });
    setUOpen(true);
  };
  const saveU = async () => {
    if (!uForm.access_id.trim() || !uForm.name.trim()) { toast.error('Access ID and Name required'); return; }
    if (uForm.role === 'store_user' && !uForm.office_id) { toast.error('Store user must have an office'); return; }
    const payload = { ...uForm, phone: (uForm.phone || '').trim() || null, destination: (uForm.destination || '').trim() || null };
    if (uEdit) {
      const { error } = await supabase.from('app_users').update(payload).eq('id', uEdit.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from('app_users').insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success('Saved'); setUOpen(false); load();
  };
  const delU = async (u: AppUserRow) => {
    if (!await confirmDialog({ description: `Delete user ${u.name}?` })) return;
    try {
      await softDelete('app_users', [u.id], { user });
      toast.success('Deleted'); load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const summary: Summary[] = offices.map(o => {
    const list = rows.filter(r => r.office_id === o.id);
    let recvCtn = 0, recvPcs = 0, shipCtn = 0, shipPcs = 0, sampleCtn = 0, samplePcs = 0, issuedCtn = 0, issuedPcs = 0;
    for (const r of list) {
      for (const c of (r.receive_cartons || [])) {
        recvCtn += c.ctn_qty || 0;
        recvPcs += (c.ctn_qty || 0) * (c.pcs_per_ctn || 0);
      }
      for (const i of (r.receive_issues || [])) {
        const ctn = i.total_ctn || 0, pcs = i.total_pcs || 0;
        issuedCtn += ctn; issuedPcs += pcs;
        if (i.issue_type === 'shipment') { shipCtn += ctn; shipPcs += pcs; }
        else if (i.issue_type === 'sample') { sampleCtn += ctn; samplePcs += pcs; }
      }
    }
    return {
      id: o.id, name: o.name, location: o.location,
      recvCtn, recvPcs,
      stockCtn: Math.max(recvCtn - issuedCtn, 0), stockPcs: Math.max(recvPcs - issuedPcs, 0),
      shipmentCtn: shipCtn, shipmentPcs: shipPcs,
      sampleCtn, samplePcs,
    };
  });

  const totals = summary.reduce((acc, s) => ({
    recvCtn: acc.recvCtn + s.recvCtn,
    recvPcs: acc.recvPcs + s.recvPcs,
    stockCtn: acc.stockCtn + s.stockCtn,
    stockPcs: acc.stockPcs + s.stockPcs,
    shipmentCtn: acc.shipmentCtn + s.shipmentCtn,
    shipmentPcs: acc.shipmentPcs + s.shipmentPcs,
    sampleCtn: acc.sampleCtn + s.sampleCtn,
    samplePcs: acc.samplePcs + s.samplePcs,
  }), {
    recvCtn: 0, recvPcs: 0,
    stockCtn: 0, stockPcs: 0,
    shipmentCtn: 0, shipmentPcs: 0,
    sampleCtn: 0, samplePcs: 0,
  });

  const filteredOffices = offices.filter(o => {
    const q = officeSearch.toLowerCase().trim();
    if (!q) return true;
    return o.name.toLowerCase().includes(q) || (o.location || '').toLowerCase().includes(q);
  });

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase().trim();
    if (q && !(u.name.toLowerCase().includes(q) || u.access_id.toLowerCase().includes(q))) return false;
    if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
    if (userStatusFilter === 'active' && !u.is_active) return false;
    if (userStatusFilter === 'inactive' && u.is_active) return false;
    if (userStatusFilter === 'online' && !presence.isOnline(u.id)) return false;
    return true;
  });

  const exportOffices = () => {
    if (filteredOffices.length === 0) { toast.error('Nothing to export'); return; }
    exportToExcel(filteredOffices.map(o => ({
      Name: o.name, Location: o.location || '', Status: o.is_active ? 'Active' : 'Inactive',
    })), `units-${new Date().toISOString().slice(0, 10)}`);
  };

  const exportUsers = () => {
    if (filteredUsers.length === 0) { toast.error('Nothing to export'); return; }
    exportToExcel(filteredUsers.map(u => ({
      'Access ID': u.access_id, Name: u.name, Role: u.role,
      Office: offices.find(o => o.id === u.office_id)?.name || '',
      Permissions: [u.can_add && 'Add', u.can_edit && 'Edit', u.can_delete && 'Delete', u.can_print && 'Print', u.can_excel && 'Excel', u.can_delete_history && 'DelHistory', u.can_clear_notifications && 'ClearNotif'].filter(Boolean).join(', '),
      Status: u.is_active ? 'Active' : 'Inactive',
      Online: presence.isOnline(u.id) ? 'Yes' : 'No',
      'Last Seen': presence.lastSeen(u.id) ? new Date(presence.lastSeen(u.id)!).toLocaleString() : '',
    })), `users-${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-8 shadow-lg">
          <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Super Admin Control
              </div>
              <h2 className="text-2xl sm:text-3xl xl:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Super Admin Dashboard
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl">Manage units, offices, access IDs, and view warehouse statistics in real time.</p>
            </div>
          </div>
        </div>


        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'TOTAL RECV CTN', ctn: totals.recvCtn, pcs: totals.recvPcs, icon: Package, color: 'text-recv', border: 'hsl(var(--recv))' },
            { label: 'TOTAL STOCK CTN', ctn: totals.stockCtn, pcs: totals.stockPcs, icon: MapPin, color: 'text-stock', border: 'hsl(var(--stock))' },
            { label: 'TOTAL SHIPMENT CTN', ctn: totals.shipmentCtn, pcs: totals.shipmentPcs, icon: Truck, color: 'text-ship', border: 'hsl(var(--ship))' },
            { label: 'TOTAL SAMPLE CTN', ctn: totals.sampleCtn, pcs: totals.samplePcs, icon: TestTube2, color: 'text-sample', border: 'hsl(var(--sample))' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="group bg-card rounded-[2rem] p-5 shadow-lg shadow-black/10 transition professional-hover"
                style={{ border: `2px solid ${item.border}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-semibold tracking-tight text-muted-foreground">{item.label}</p>
                  <div
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-background/70 transition"
                    style={{ border: `2px solid ${item.border}`, color: item.border }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-6 flex items-end gap-3">
                  <p className={`text-4xl font-semibold ${item.color}`}>{item.ctn.toLocaleString()}</p>
                  <span className="text-xs text-muted-foreground">CTN</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.pcs.toLocaleString()} pcs</p>
              </div>
            );
          })}
        </div>

        {/* Office Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary.length === 0 && (
            <div className="col-span-full text-center py-10 text-muted-foreground bg-card border border-border rounded-xl">No offices yet</div>
          )}
          {summary.map(s => (
            <button key={s.id} onClick={() => navigate(`/office/${s.id}`)}
              style={{ border: '3px solid hsl(var(--primary))', minHeight: '180px' }}
              className="bg-card rounded-xl p-6 text-left transition professional-hover hover:shadow-xl cursor-pointer">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-base md:text-lg">{s.name}</p>
                  {s.location && <p className="text-sm md:text-base text-muted-foreground truncate">{s.location}</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { l: 'Recv', v: s.recvCtn, p: s.recvPcs, c: 'text-recv' },
                  { l: 'Stock', v: s.stockCtn, p: s.stockPcs, c: 'text-stock' },
                  { l: 'Ship', v: s.shipmentCtn, p: s.shipmentPcs, c: 'text-ship' },
                  { l: 'Sample', v: s.sampleCtn, p: s.samplePcs, c: 'text-sample' },
                ].map(x => (
                  <div key={x.l}>
                    <p className="text-[10px] md:text-xs tracking-tight text-muted-foreground">{x.l}</p>
                    <p className={`text-2xl md:text-3xl font-bold ${x.c}`}>{x.v.toLocaleString()}</p>
                    <p className="text-xs md:text-sm text-muted-foreground">{x.p.toLocaleString()} pcs</p>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* CRUD Management Tabs */}
        <div className="mt-8 pt-6 border-t border-border/60">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-primary to-primary/40" />
            <h3 className="text-xl font-bold tracking-tight">Management</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
          </div>
        </div>

      </div>

      <div>
      <Tabs defaultValue="insights">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:grid-cols-6 sm:inline-flex h-auto p-1.5 gap-1 bg-card border border-border rounded-xl shadow-sm">
          <TabsTrigger value="insights" className="text-[11px] sm:text-sm px-2 sm:px-3 py-1.5 gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline sm:inline">Insights</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-[11px] sm:text-sm px-2 sm:px-3 py-1.5 gap-1">
            <Wrench className="h-3.5 w-3.5" />
            <span className="hidden xs:inline sm:inline">Tools</span>
          </TabsTrigger>
          <TabsTrigger value="offices" className="text-[11px] sm:text-sm px-2 sm:px-3 py-1.5 gap-1">
            <Building2 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline sm:inline">Units</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="text-[11px] sm:text-sm px-2 sm:px-3 py-1.5 gap-1">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden xs:inline sm:inline">Users</span>
            {presence.onlineCount > 0 && (
              <span className="ml-0.5 inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {presence.onlineCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="data" className="text-[11px] sm:text-sm px-2 sm:px-3 py-1.5 gap-1">
            <Database className="h-3.5 w-3.5" />
            <span className="hidden xs:inline sm:inline">Data</span>
          </TabsTrigger>
          <TabsTrigger value="bin" className="text-[11px] sm:text-sm px-2 sm:px-3 py-1.5 gap-1">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline sm:inline">Recycle Bin</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights">
          <AdminInsights onlineCount={presence.onlineCount} />
        </TabsContent>

        <TabsContent value="tools">
          <AdminTools />
        </TabsContent>



        <TabsContent value="offices">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
              <CardTitle className="text-base sm:text-lg">Units / Offices ({filteredOffices.length}/{offices.length})</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-9 text-sm" placeholder="Search units…" value={officeSearch} onChange={(e) => setOfficeSearch(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={exportOffices} title="Export filtered to Excel"><FileDown className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Excel</span></Button>
                <Button size="sm" onClick={openOAdd}><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Add</span></Button>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filteredOffices.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">No units</p>}
                {filteredOffices.map(o => (
                  <div key={o.id} className="border border-border rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{o.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{o.location || '—'}</p>
                      <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${o.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                        {o.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openOEdit(o)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delO(o)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto rounded-lg border border-primary/30">
                <Table className="[&_th]:border-2 [&_th]:border-primary/40 [&_td]:border-2 [&_td]:border-primary/30 [&_th]:py-3 [&_td]:py-3">
                  <TableHeader><TableRow className="bg-primary/10 hover:bg-primary/10">
                    <TableHead>Name</TableHead><TableHead>Location</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredOffices.map(o => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>{o.location}</TableCell>
                        <TableCell>{o.is_active ? 'Active' : 'Inactive'}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openOEdit(o)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delO(o)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-col gap-3 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-base sm:text-lg">Users ({filteredUsers.length}/{users.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={exportUsers} title="Export filtered to Excel"><FileDown className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Excel</span></Button>
                  <Button size="sm" onClick={openUAdd}><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Add</span></Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-9 text-sm" placeholder="Search name / access id…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                </div>
                <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                  <SelectTrigger className="h-9 text-sm sm:w-36"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="store_user">Store User</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                  <SelectTrigger className="h-9 text-sm sm:w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="online">Online now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filteredUsers.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">No users</p>}
                {filteredUsers.map(u => {
                  const ls = presence.lastSeen(u.id);
                  const online = presence.isOnline(u.id);
                  return (
                    <div key={u.id} className="border border-border rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <button onClick={() => setSessionUserId(u.id)} className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2">
                            <PresenceDot online={online} />
                            <span className="font-semibold text-sm truncate">{u.name}</span>
                          </div>
                          <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">{u.access_id}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{online ? 'Active now' : ls ? `Last: ${new Date(ls).toLocaleString()}` : 'Never signed in'}</p>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openUEdit(u)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSessionUserId(u.id)}>Login history</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delU(u)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{u.role}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${u.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>{u.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                        {u.office_id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted">{offices.find(o => o.id === u.office_id)?.name}</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {[u.can_add && 'Add', u.can_edit && 'Edit', u.can_delete && 'Del', u.can_print && 'Print', u.can_excel && 'Excel'].filter(Boolean).join(' · ') || 'No perms'}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto rounded-lg border border-primary/30">
                <Table className="[&_th]:border-2 [&_th]:border-primary/40 [&_td]:border-2 [&_td]:border-primary/30 [&_th]:py-3 [&_td]:py-3">
                  <TableHeader><TableRow className="bg-primary/10 hover:bg-primary/10">
                    <TableHead>Access ID</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead>
                    <TableHead>Office</TableHead><TableHead>Permissions</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredUsers.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-mono text-xs">{u.access_id}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => setSessionUserId(u.id)}
                            className="inline-flex items-center gap-2 hover:text-primary hover:underline cursor-pointer text-left"
                            title="Click to view login history"
                          >
                            <PresenceDot online={presence.isOnline(u.id)} />
                            <span className="font-medium">{u.name}</span>
                          </button>
                          {(() => {
                            const ls = presence.lastSeen(u.id);
                            if (!ls) return <p className="text-[10px] text-muted-foreground mt-0.5">Never signed in</p>;
                            return <p className="text-[10px] text-muted-foreground mt-0.5">{presence.isOnline(u.id) ? 'Active now' : `Last seen ${new Date(ls).toLocaleString()}`}</p>;
                          })()}
                        </TableCell>
                        <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{u.role}</span></TableCell>
                        <TableCell>{offices.find(o => o.id === u.office_id)?.name || '-'}</TableCell>
                        <TableCell className="text-xs">
                          {[u.can_add && 'Add', u.can_edit && 'Edit', u.can_delete && 'Del', u.can_print && 'Print', u.can_excel && 'Excel'].filter(Boolean).join(', ') || '-'}
                        </TableCell>
                        <TableCell>{u.is_active ? 'Active' : 'Inactive'}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openUEdit(u)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setSessionUserId(u.id)}>Login history</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delU(u)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <DataManagement />
        </TabsContent>

        <TabsContent value="bin">
          <RecycleBin />
        </TabsContent>
      </Tabs>


      {/* Office dialog */}
      <Dialog open={oOpen} onOpenChange={setOOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{oEdit ? 'Edit' : 'Add'} Office</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs">Name *</label><Input value={oForm.name} onChange={e => setOForm({ ...oForm, name: e.target.value })} /></div>
            <div><label className="text-xs">Location</label><Input value={oForm.location} onChange={e => setOForm({ ...oForm, location: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOOpen(false)}>Cancel</Button><Button onClick={saveO}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User dialog */}
      <Dialog open={uOpen} onOpenChange={setUOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{uEdit ? 'Edit' : 'Add'} User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs">Access ID *</label><Input value={uForm.access_id} onChange={e => setUForm({ ...uForm, access_id: e.target.value })} /></div>
              <div><label className="text-xs">Name *</label><Input value={uForm.name} onChange={e => setUForm({ ...uForm, name: e.target.value })} /></div>
              <div>
                <label className="text-xs">Role</label>
                <Select value={uForm.role} onValueChange={(v) => setUForm({ ...uForm, role: v as Role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store_user">Store User</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs">Office {uForm.role === 'store_user' && '*'}</label>
                <Select value={uForm.office_id || 'none'} onValueChange={(v) => setUForm({ ...uForm, office_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {offices.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs">Phone</label>
                <Input type="tel" inputMode="tel" placeholder="e.g. 01XXXXXXXXX" value={uForm.phone || ''} onChange={e => setUForm({ ...uForm, phone: e.target.value })} maxLength={20} />
              </div>
              <div>
                <label className="text-xs">Destination</label>
                <Input placeholder="e.g. Dhaka HQ, Chittagong Port" value={uForm.destination || ''} onChange={e => setUForm({ ...uForm, destination: e.target.value })} maxLength={120} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold">Permissions</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {([
                  ['can_add', 'Add'], ['can_edit', 'Edit'], ['can_delete', 'Delete'],
                  ['can_print', 'Print'], ['can_excel', 'Excel'], ['can_delete_history', 'Delete History'], ['can_clear_notifications', 'Clear Notifications'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={uForm[k]} onCheckedChange={(v) => setUForm({ ...uForm, [k]: !!v })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={uForm.is_active} onCheckedChange={(v) => setUForm({ ...uForm, is_active: !!v })} />
              Active
            </label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setUOpen(false)}>Cancel</Button><Button onClick={saveU}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User sessions / online history */}
      <UserSessionsDialog
        open={!!sessionUserId}
        onOpenChange={(o) => !o && setSessionUserId(null)}
        userName={users.find(u => u.id === sessionUserId)?.name || ''}
        sessions={sessionUserId ? presence.forUser(sessionUserId) : []}
        isCurrentlyOnline={sessionUserId ? presence.isOnline(sessionUserId) : false}
      />
      </div>
    </AppLayout>
  );
};

export default AdminPanel;
