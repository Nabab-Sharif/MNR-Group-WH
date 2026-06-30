import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, CheckCircle, AlertCircle, Send } from 'lucide-react';

interface Stats { total: number; in_stock: number; issued: number; pending: number; pass: number; fail: number; }

const Dashboard = () => {
  const { user, isLoading } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, in_stock: 0, issued: 0, pending: 0, pass: 0, fail: 0 });
  const [officeName, setOfficeName] = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let q = supabase.from('cartons').select('status, quantity, office_id');
      if (user.role === 'store_user' && user.office_id) q = q.eq('office_id', user.office_id);
      const { data } = await q;
      const rows = data || [];
      const s: Stats = { total: 0, in_stock: 0, issued: 0, pending: 0, pass: 0, fail: 0 };
      rows.forEach(r => {
        s.total += r.quantity || 0;
        if (r.status === 'in_stock') s.in_stock += r.quantity || 0;
        if (r.status === 'issued') s.issued += r.quantity || 0;
        if (r.status === 'inspection_pending') s.pending += r.quantity || 0;
        if (r.status === 'pass') s.pass += r.quantity || 0;
        if (r.status === 'fail') s.fail += r.quantity || 0;
      });
      setStats(s);
      if (user.office_id) {
        const { data: o } = await supabase.from('offices').select('name').eq('id', user.office_id).maybeSingle();
        setOfficeName(o?.name || '');
      }
    };
    load();
    const ch = supabase.channel('dash-cartons')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'store_user' && user.office_id) return <Navigate to={`/office/${user.office_id}`} replace />;
  if (user.role === 'management' || user.role === 'super_admin') return <Navigate to="/management" replace />;

  const cards = [
    { label: 'Total Pcs', value: stats.total, icon: Package, color: 'bg-blue-500' },
    { label: 'In Stock', value: stats.in_stock, icon: Package, color: 'bg-green-500' },
    { label: 'Issued', value: stats.issued, icon: Send, color: 'bg-amber-500' },
    { label: 'Inspection Pending', value: stats.pending, icon: AlertCircle, color: 'bg-orange-500' },
    { label: 'Pass', value: stats.pass, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Fail', value: stats.fail, icon: AlertCircle, color: 'bg-red-500' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Warehouse Dashboard</h2>
          {officeName && <p className="text-muted-foreground text-sm">{officeName}</p>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map(c => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center mb-2`}>
                  <c.icon className="h-5 w-5 text-white" />
                </div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold mt-1">{c.value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Your Permissions</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-xs">
              {[['Add', user.can_add], ['Edit', user.can_edit], ['Delete', user.can_delete], ['Print', user.can_print], ['Excel', user.can_excel]].map(([k, v]) => (
                <span key={k as string} className={`px-2 py-1 rounded ${v ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {v ? '✓' : '✗'} {k}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
