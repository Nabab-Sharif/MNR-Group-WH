import { ReactNode, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LogOut, ShieldCheck, Hash } from 'lucide-react';
import NotificationBell from './NotificationBell';
import ThemePicker from './ThemePicker';
import logo from '@/assets/logo.jpg';

const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || 'U';

const ProfileMenu = ({ user, onLogout }: { user: any; onLogout: () => void }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Profile"
          className="w-9 h-9 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/30 text-foreground font-bold text-[12px] flex items-center justify-center transition focus:outline-none focus:ring-2 focus:ring-primary/50 professional-hover"
        >
          {initials(user.name)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">

        <div className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-background/20 border border-background/40 flex items-center justify-center font-bold">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{user.name}</p>
            <p className="text-[11px] opacity-80 capitalize">{user.role.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            <span className="font-mono">{user.access_id}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="capitalize">{user.role.replace('_', ' ')}</span>
          </div>
          <Button size="sm" variant="destructive" className="w-full mt-2" onClick={onLogout}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Logout
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};


const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const homeHref =
    user.role === 'store_user' && user.office_id ? `/office/${user.office_id}` :
    user.role === 'super_admin' ? '/admin' :
    '/management';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40">
        <div className="bg-card text-card-foreground w-full shadow-md header-underline">
          <div className="w-full px-3 sm:px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-3">
            <Link to={homeHref} className="flex items-center gap-2.5 min-w-0 professional-hover">
              <img
                src={logo}
                alt="MNR"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full ring-2 ring-primary/40 object-cover bg-background flex-shrink-0"
              />
              <div className="min-w-0">
                <h1 className="font-bold text-[13px] sm:text-sm md:text-base truncate leading-tight tracking-tight">
                  MNR Group Warehouse
                </h1>
                <p className="hidden sm:block text-[10px] md:text-[11px] opacity-80 truncate normal-case tracking-tight">
                  Smart Stock Monitoring
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ThemePicker />
              <NotificationBell />
              <ProfileMenu user={user} onLogout={() => { logout(); navigate('/login'); }} />

            </div>
          </div>
        </div>
      </header>
      <main className="w-full p-3 sm:p-4 md:p-6">{children}</main>
    </div>
  );
};

export default AppLayout;
