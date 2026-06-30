import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, Fingerprint, ShieldCheck, Package, BarChart3, Sparkles } from 'lucide-react';
import logo from '@/assets/logo.jpg';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [accessId, setAccessId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessId.trim()) { toast.error('Enter Access ID'); return; }
    setLoading(true);
    try {
      const user = await login(accessId.trim());
      if (user) {
        if (user.role === 'store_user' && user.office_id) return navigate(`/office/${user.office_id}`);
        if (user.role === 'super_admin') return navigate('/admin');
        if (user.role === 'management') return navigate('/management');
        return navigate('/dashboard');
      }
      toast.error('Invalid Access ID');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-primary/30 blur-3xl animate-pulse" />
        <div className="absolute -bottom-32 -right-32 w-[520px] h-[520px] rounded-full bg-primary/20 blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="w-full max-w-7xl grid lg:grid-cols-[1.1fr,1fr] gap-10 lg:gap-24 xl:gap-32 items-center px-2 sm:px-6 lg:px-10">
        {/* Brand / pitch side */}
        <div className="hidden lg:flex flex-col items-center text-center justify-center space-y-8 lg:pr-8 xl:pr-12 animate-slide-in-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Smart Stock Monitoring
          </div>
          <div>
            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.05]">
              MNR Group
              <br />
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Finished Goods Warehouse
              </span>
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
            {[
              { icon: Package, label: 'Live Stock' },
              { icon: BarChart3, label: 'Analytics' },
              { icon: ShieldCheck, label: 'Secure' },
            ].map(f => (
              <div key={f.label} className="bg-card/60 backdrop-blur border border-border rounded-xl p-3 flex flex-col items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <f.icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Login card */}
        <div className="relative animate-slide-in-right">
          {/* Glow */}
          <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-primary/40 via-primary/10 to-primary/40 opacity-60 blur-md" />
          <div className="relative bg-card/90 backdrop-blur-xl border border-border rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl" />
                <div className="relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-primary/40 shadow-lg">
                  <img src={logo} alt="MNR Group" className="w-full h-full object-cover" />
                </div>
              </div>

              <h2 className="mt-4 text-xl sm:text-2xl font-bold tracking-tight">Welcome back</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Sign in with your Access ID to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Access ID
                </label>
                <div className="relative">
                  <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-primary" />
                  <Input
                    autoFocus
                    inputMode="numeric"
                    placeholder="Enter your Access ID"
                    value={accessId}
                    onChange={(e) => setAccessId(e.target.value)}
                    className="h-12 pl-10 text-base tracking-wider font-semibold bg-background/60 border-primary/20 focus-visible:ring-primary focus-visible:border-primary"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="group w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Sign In <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>

              <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Encrypted access · authorised personnel only</span>
              </div>
            </form>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-4">
            © {new Date().getFullYear()} MNR Group · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
