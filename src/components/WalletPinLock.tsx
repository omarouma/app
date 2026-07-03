import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Shield, X } from 'lucide-react';
import Logo from '@/components/Logo';

interface WalletPinLockProps {
  onUnlock: () => void;
  onClose?: () => void;
  mode?: 'verify' | 'set';
  onSetPin?: (pin: string) => void;
  verifyPin?: (pin: string) => Promise<boolean>;
}

export default function WalletPinLock({ onUnlock, onClose, mode = 'verify', onSetPin, verifyPin }: WalletPinLockProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>(mode === 'set' ? 'enter' : 'enter');
  const [verifying, setVerifying] = useState(false);

  const handleKey = async (key: string) => {
    setError('');
    if (key === 'del') {
      if (step === 'confirm') setConfirmPin(p => p.slice(0, -1));
      else setPin(p => p.slice(0, -1));
      return;
    }
    
    const current = step === 'confirm' ? confirmPin : pin;
    if (current.length >= 6) return;
    
    const newVal = current + key;
    if (step === 'confirm') {
      setConfirmPin(newVal);
      if (newVal.length === 6) {
        if (newVal === pin) {
          onSetPin?.(newVal);
        } else {
          setError('PINs do not match. Try again.');
          setConfirmPin('');
        }
      }
    } else {
      setPin(newVal);
      if (newVal.length === 6) {
        if (mode === 'set') {
          setStep('confirm');
        } else if (verifyPin) {
          setVerifying(true);
          const valid = await verifyPin(newVal);
          setVerifying(false);
          if (valid) {
            onUnlock();
          } else {
            setError('Incorrect PIN. Try again.');
            setPin('');
          }
        } else {
          onUnlock();
        }
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] bg-white flex flex-col items-center justify-center"
    >
      <div className="w-full max-w-sm px-8">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4">
            <Logo size={56} />
          </div>
          <div className="w-12 h-12 rounded-full bg-[#00C300]/10 flex items-center justify-center mx-auto mb-3">
            <Lock size={24} className="text-[#00C300]" />
          </div>
          <h2 className="text-xl font-bold text-[#111111]">
            {mode === 'set' ? (step === 'enter' ? 'Set Wallet PIN' : 'Confirm PIN') : 'Wallet Locked'}
          </h2>
          <p className="text-[#8D8D8D] text-sm mt-1">
            {mode === 'set' 
              ? (step === 'enter' ? 'Create a 6-digit PIN to secure your wallet' : 'Re-enter your PIN to confirm')
              : 'Enter your 6-digit PIN to unlock'
            }
          </p>
        </div>

        {/* PIN Dots */}
        <div className="flex justify-center gap-3 mb-8">
          {Array.from({ length: 6 }).map((_, i) => {
            const current = step === 'confirm' ? confirmPin : pin;
            return (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  i < current.length
                    ? 'bg-[#00C300] scale-110'
                    : 'bg-[#EBEBEB]'
                }`}
              />
            );
          })}
        </div>

        {error && (
          <p className="text-center text-[#FF3B30] text-sm mb-4">{error}</p>
        )}

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-1 text-[#8D8D8D] text-xs mb-6">
          <Shield size={12} />
          <span>{verifying ? 'Verifying...' : 'Bank-grade encryption'}</span>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => (
            <button type="button" key={key}
              onClick={() => key && handleKey(key)}
              disabled={!key || verifying}
              className={`h-14 rounded-2xl text-xl font-semibold transition-all active:scale-95 ${
                key === ''
                  ? 'invisible'
                  : key === 'del'
                  ? 'bg-[#F5F5F5] text-[#FF3B30] text-sm font-medium'
                  : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
              } disabled:opacity-50`}
            >
              {key === 'del' ? 'DELETE' : key}
            </button>
          ))}
        </div>

        {onClose && (
          <button type="button" onClick={onClose}
            className="w-full mt-6 py-3 text-[#8D8D8D] text-sm font-medium flex items-center justify-center gap-2 hover:text-[#111111] transition-colors"
          >
            <X size={16} /> Cancel
          </button>
        )}
      </div>
    </motion.div>
  );
}
