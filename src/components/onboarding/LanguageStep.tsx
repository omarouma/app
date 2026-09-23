import { useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { supportedLanguages, setLanguage, getLanguage, type LangCode } from '@/lib/i18n';

export default function LanguageStep() {
  const [selected, setSelected] = useState<LangCode>(getLanguage());

  const choose = (code: LangCode) => {
    setSelected(code);
    setLanguage(code);
  };

  return (
    <div className="w-full max-w-sm mx-auto text-center">
      <div className="w-20 h-20 rounded-3xl bg-[#2196F3]/10 flex items-center justify-center mx-auto mb-6">
        <Globe size={36} className="text-[#2196F3]" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-3">Choose your language</h2>
      <p className="text-muted-foreground text-sm leading-relaxed mb-6">
        You can change this later in Settings.
      </p>

      <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
        {supportedLanguages.map((lang) => {
          const active = selected === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => choose(lang.code)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#00C300]/10 text-[#00C300] ring-1 ring-[#00C300]'
                  : 'bg-muted text-foreground hover:bg-muted'
              }`}
              aria-pressed={active}
            >
              <span className="flex flex-col items-start">
                <span>{lang.native}</span>
                <span className="text-[11px] text-muted-foreground font-normal">{lang.label}</span>
              </span>
              {active && <Check size={18} className="text-[#00C300]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
