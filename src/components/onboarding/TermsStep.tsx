import { useState } from 'react';
import { Shield, ExternalLink } from 'lucide-react';
import { CURRENT_TERMS_VERSION } from '@/lib/onboarding';

interface TermsStepProps {
  onValidityChange?: (valid: boolean) => void;
}

export default function TermsStep({ onValidityChange }: TermsStepProps) {
  const [accepted, setAccepted] = useState(false);

  const toggle = (value: boolean) => {
    setAccepted(value);
    onValidityChange?.(value);
  };

  return (
    <div className="w-full max-w-sm mx-auto text-center">
      <div className="w-20 h-20 rounded-3xl bg-[#00C3C3]/10 flex items-center justify-center mx-auto mb-6">
        <Shield size={36} className="text-[#00C3C3]" />
      </div>
      <h2 className="text-2xl font-bold text-[#111111] mb-3">Privacy &amp; Terms</h2>
      <p className="text-[#8D8D8D] text-sm leading-relaxed mb-6">
        Please review and accept our Terms of Service and Privacy Policy to continue using GaGa Chat.
      </p>

      <div className="text-left bg-[#F5F5F5] rounded-2xl p-4 mb-5 space-y-3">
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between text-sm text-[#111111] font-medium hover:text-[#00C300] transition-colors"
        >
          Terms of Service <ExternalLink size={14} className="text-[#8D8D8D]" />
        </a>
        <div className="h-px bg-[#EBEBEB]" />
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between text-sm text-[#111111] font-medium hover:text-[#00C300] transition-colors"
        >
          Privacy Policy <ExternalLink size={14} className="text-[#8D8D8D]" />
        </a>
      </div>

      <label className="flex items-start gap-3 text-left cursor-pointer select-none">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded accent-[#00C300] shrink-0"
          aria-label="Accept Terms of Service and Privacy Policy"
        />
        <span className="text-sm text-[#111111] leading-relaxed">
          I agree to the Terms of Service and Privacy Policy.
        </span>
      </label>

      <p className="text-[11px] text-[#8D8D8D] mt-4">Version {CURRENT_TERMS_VERSION}</p>
    </div>
  );
}
