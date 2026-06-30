import { supabase } from '@/integrations/supabase/client';
import type { AppUser } from '@/contexts/AuthContext';

type Action = 'created' | 'updated' | 'issued' | 'inspected' | 'deleted';

export async function logHistoryAndNotify(args: {
  user: AppUser;
  officeId: string;
  officeName: string;
  cartonId: string | null;
  cartonNo: string;
  action: Action;
  message: string;
  details?: Record<string, unknown>;
  route?: string;
  fieldChanged?: string;
}) {
  const { user, officeId, officeName, cartonId, cartonNo, action, message, details, route, fieldChanged } = args;
  // Run inserts independently so one failing doesn't block the other.
  const histPromise = supabase.from('carton_history').insert([{
    carton_id: cartonId ?? undefined,
    office_id: officeId,
    action,
    changed_by: user.id,
    changed_by_name: user.name,
    details: (details ?? null) as never,
  }]).then(({ error }) => { if (error) console.error('[notify] carton_history insert failed:', error); });

  const notifPromise = supabase.from('notifications').insert([{
    office_id: officeId,
    office_name: officeName,
    carton_id: cartonId ?? undefined,
    carton_no: cartonNo,
    action,
    message,
    created_by: user.id,
    created_by_name: user.name,
    route: route ?? null,
    field_changed: fieldChanged ?? null,
    details: (details ?? null) as never,
  }]).then(({ error }) => { if (error) console.error('[notify] notifications insert failed:', error); });

  await Promise.allSettled([histPromise, notifPromise]);
}

// Web Audio beep — no asset required
let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    return audioCtx;
  } catch { return null; }
}

// Unlock audio after first user gesture (autoplay policy)
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock);
}

function tone(ctx: AudioContext, freq: number, start: number, dur = 0.18, vol = 0.22) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export function playBeep() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Pleasant 2-tone chime
    tone(ctx, 880, 0);
    tone(ctx, 1320, 0.14);
  } catch { /* ignore */ }
}

