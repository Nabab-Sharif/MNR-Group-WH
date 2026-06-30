import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Palette, Check } from 'lucide-react';
import { ACCENTS, MODES, useTheme } from '@/contexts/ThemeContext';

const ThemePicker = () => {
  const { mode, accent, setMode, setAccent } = useTheme();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-foreground hover:text-foreground hover:bg-primary/10" title="Theme">
          <Palette className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 max-h-[80vh] overflow-y-auto">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] tracking-tight text-muted-foreground mb-2">Appearance</p>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  title={m.label}
                  className={`relative h-14 rounded-lg border-2 transition hover:scale-[1.03] overflow-hidden flex items-end justify-center pb-1 ${mode === m.key ? 'border-primary ring-2 ring-primary/50' : 'border-border'}`}
                  style={{ background: m.swatch }}
                >
                  <span className="text-[10px] font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
                    {m.label}
                  </span>
                  {mode === m.key && (
                    <Check className="absolute top-1 right-1 h-3.5 w-3.5 text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] tracking-tight text-muted-foreground mb-2">Accent color</p>
            <div className="grid grid-cols-5 gap-2">
              {ACCENTS.map(a => (
                <button
                  key={a.key}
                  onClick={() => setAccent(a.key)}
                  title={a.label}
                  className="relative w-10 h-10 rounded-lg border border-border flex items-center justify-center transition hover:scale-110"
                  style={{ background: `hsl(${a.hsl})` }}
                >
                  {accent === a.key && <Check className="h-4 w-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ThemePicker;
