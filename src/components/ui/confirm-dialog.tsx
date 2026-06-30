import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Trash2, Info, ShieldAlert } from 'lucide-react';

type Variant = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: Variant;
}

interface InternalState extends ConfirmOptions {
  open: boolean;
  resolve?: (v: boolean) => void;
}

// Module-level emitter so we can call `confirmDialog(...)` from anywhere
// without prop drilling. A single <ConfirmHost /> mounted in App listens.
type Listener = (s: InternalState) => void;
let listener: Listener | null = null;

export function confirmDialog(opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) { resolve(window.confirm(opts.description || opts.title || 'Are you sure?')); return; }
    listener({ open: true, resolve, ...opts });
  });
}

const styleFor = (v: Variant = 'danger') => {
  switch (v) {
    case 'warning':
      return {
        ring: 'ring-amber-500/40',
        iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        accent: 'border-l-4 border-l-amber-500',
        border: 'border-amber-500',
        glow: '0 0 0 0 rgba(245,158,11,0.55)',
        glowKey: 'confirm-glow-amber',
        btn: 'bg-amber-600 hover:bg-amber-600/90 text-white',
        Icon: AlertTriangle,
      };
    case 'info':
      return {
        ring: 'ring-primary/40',
        iconBg: 'bg-primary/15 text-primary',
        accent: 'border-l-4 border-l-primary',
        border: 'border-primary',
        glow: '0 0 0 0 hsl(var(--primary) / 0.55)',
        glowKey: 'confirm-glow-primary',
        btn: 'bg-primary hover:bg-primary/90 text-primary-foreground',
        Icon: Info,
      };
    default:
      return {
        ring: 'ring-destructive/40',
        iconBg: 'bg-destructive/15 text-destructive',
        accent: 'border-l-4 border-l-destructive',
        border: 'border-destructive',
        glow: '0 0 0 0 hsl(var(--destructive) / 0.6)',
        glowKey: 'confirm-glow-destructive',
        btn: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
        Icon: Trash2,
      };
  }
};

export const ConfirmHost = () => {
  const [s, setS] = useState<InternalState>({ open: false });

  useEffect(() => {
    listener = (next) => setS(next);
    return () => { listener = null; };
  }, []);

  const close = (val: boolean) => {
    s.resolve?.(val);
    setS((prev) => ({ ...prev, open: false, resolve: undefined }));
  };

  const variant = s.variant || 'danger';
  const { iconBg, accent, btn, border, glowKey, Icon } = styleFor(variant);

  return (
    <AlertDialog open={s.open} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent
        className={`max-w-md p-0 overflow-hidden border-2 ${border} ${accent} animate-scale-in`}
        style={{ animation: `${glowKey} 1.8s ease-in-out infinite` }}
      >

        <div className="p-5">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className={`h-11 w-11 rounded-full flex items-center justify-center ${iconBg} flex-shrink-0`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <AlertDialogTitle className="text-base font-semibold flex items-center gap-2">
                  {variant === 'danger' && <ShieldAlert className="h-4 w-4 text-destructive" />}
                  {s.title || (variant === 'danger' ? 'Confirm Deletion' : 'Please Confirm')}
                </AlertDialogTitle>
                {s.description && (
                  <AlertDialogDescription className="mt-1.5 text-sm text-foreground/80 whitespace-pre-line break-words">
                    {s.description}
                  </AlertDialogDescription>
                )}
              </div>
            </div>
          </AlertDialogHeader>
        </div>
        <div className="bg-muted/40 border-t border-border px-5 py-3">
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => close(false)} className="mt-0">
              {s.cancelText || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => close(true)} className={btn}>
              {s.confirmText || (variant === 'danger' ? 'Delete' : 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmHost;
