import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Phone, Lock, Eye, EyeOff, User, ArrowLeft,
  Check, Loader, AlertCircle, Sparkles, Home, Send,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import Logo from '@/components/Logo';

// ─── Types ────────────────────────────────────────────────────
type Screen = 'landing' | 'login-email' | 'login-phone' | 'signup-email' | 'signup-phone' | 'magic' | 'forgot';
type InputTab = 'email' | 'phone';

// ─── Helpers ──────────────────────────────────────────────────
function isValidEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidPhone(v: string) { return /^\+?[0-9]{7,15}$/.test(v.replace(/[\s\-()]/g, '')); }
function normalizePhone(v: string) {
  const digits = v.replace(/[\s\-()]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function passwordStrength(p: string) {
  return (
    (p.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(p) ? 1 : 0) +
    (/[a-z]/.test(p) ? 1 : 0) +
    (/[0-9]/.test(p) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(p) ? 1 : 0)
  );
}

// ─── Sub-components ───────────────────────────────────────────
function Bubble({ size, top, left, color, opacity, delay }: { size: number; top: string; left: string; color: string; opacity: number; delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, top, left, backgroundColor: color, opacity, filter: 'blur(70px)' }}
      animate={{ y: [0, -18, 0], x: [0, 8, 0] }}
      transition={{ duration: 7 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

const BUBBLES = [
  { size: 260, top: '2%',  left: '5%',  color: '#00C300', opacity: 0.07, delay: 0 },
  { size: 180, top: '55%', left: '2%',  color: '#00C300', opacity: 0.05, delay: 1.2 },
  { size: 200, top: '10%', left: '60%', color: '#FF9800', opacity: 0.05, delay: 0.8 },
  { size: 300, top: '40%', left: '20%', color: '#00C300', opacity: 0.04, delay: 2 },
  { size: 150, top: '72%', left: '65%', color: '#FF4081', opacity: 0.05, delay: 1.6 },
  { size: 120, top: '20%', left: '80%', color: '#2196F3', opacity: 0.04, delay: 2.4 },
];

function ErrorMsg({ msg }: { msg: string }) {
  return msg ? (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-red-500 text-xs bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">
      <AlertCircle size={13} className="shrink-0" /> {msg}
    </motion.p>
  ) : null;
}

function SuccessMsg({ msg }: { msg: string }) {
  return msg ? (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-[#00C300] text-xs bg-[#00C300]/5 border border-[#00C300]/20 px-3 py-2.5 rounded-xl">
      <Check size={13} className="shrink-0" /> {msg}
    </motion.p>
  ) : null;
}

function InputField({ icon: Icon, type = 'text', value, onChange, placeholder, right }: {
  icon: React.ElementType; type?: string; value: string;
  onChange: (v: string) => void; placeholder: string; right?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ABABAB] z-10" />
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#F7F7F7] border border-transparent focus:border-[#00C300]/40 rounded-2xl pl-11 pr-11 py-3.5 text-sm text-[#111] placeholder:text-[#C0C0C0] outline-none transition-all"
      />
      {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

function PasswordField({ value, onChange, placeholder = 'Password' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <InputField
      icon={Lock} type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder}
      right={
        <button type="button" onClick={() => setShow(s => !s)} className="text-[#ABABAB] hover:text-[#555] transition-colors p-1">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}

function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const s = passwordStrength(password);
  const color = s <= 2 ? 'bg-red-400' : s <= 3 ? 'bg-orange-400' : 'bg-[#00C300]';
  const label = s <= 2 ? 'Weak' : s <= 3 ? 'Fair' : s === 4 ? 'Good' : 'Strong';
  return (
    <div className="space-y-1 px-0.5">
      <div className="flex gap-1 h-1">
        {[0,1,2,3].map(i => <div key={i} className={`flex-1 rounded-full ${s > i ? color : 'bg-[#E8E8E8]'}`} />)}
      </div>
      <p className="text-[10px] text-[#ABABAB]">{label} password</p>
    </div>
  );
}

function AgreeBox({ agreed, setAgreed, navigate }: { agreed: boolean; setAgreed: (v: boolean) => void; navigate: (p: string) => void }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="sr-only" />
      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${agreed ? 'bg-[#00C300] border-[#00C300]' : 'border-[#D0D0D0]'}`}>
        {agreed && <Check size={11} className="text-white" />}
      </span>
      <span className="text-[11px] text-[#888] leading-relaxed">
        I agree to the{' '}
        <button type="button" onClick={() => navigate('/terms')} className="text-[#00C300] font-semibold hover:underline">Terms</button>
        {' '}and{' '}
        <button type="button" onClick={() => navigate('/privacy')} className="text-[#00C300] font-semibold hover:underline">Privacy Policy</button>
      </span>
    </label>
  );
}

function PrimaryBtn({ loading, disabled, children }: { loading?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="submit"
      className="w-full py-3.5 bg-gradient-to-r from-[#00C300] to-[#00A300] hover:from-[#00A300] hover:to-[#008800] text-white rounded-2xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#00C300]/25 active:scale-[0.98]"
      disabled={loading || disabled}>
      {loading ? <Loader size={17} className="animate-spin" /> : children}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.97 }}
      transition={{ duration: 0.35, type: 'spring', bounce: 0.2 }}
      className="bg-white/85 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/60 p-7 w-full relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-[#00C300]/8 to-transparent rounded-bl-full pointer-events-none" />
      {children}
    </motion.div>
  );
}

function LogoHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-col items-center mb-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-lg shadow-[#00C300]/30 mb-3">
        <Logo size={36} />
      </div>
      <h1 className="font-extrabold text-[#111] text-base tracking-tight">GaGa Chat</h1>
      <p className="text-[#ABABAB] text-[11px] mt-0.5">{subtitle}</p>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 text-[#ABABAB] hover:text-[#333] text-xs mb-5 transition-colors">
      <ArrowLeft size={14} /> Back
    </button>
  );
}

function TabSwitch({ tab, setTab }: { tab: InputTab; setTab: (t: InputTab) => void }) {
  return (
    <div className="flex bg-[#F2F2F2] rounded-2xl p-1 mb-5">
      {(['email', 'phone'] as InputTab[]).map(t => (
        <button key={t} type="button" onClick={() => setTab(t)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t ? 'bg-white shadow text-[#111]' : 'text-[#ABABAB]'}`}>
          {t === 'email' ? <Mail size={13} /> : <Phone size={13} />}
          {t === 'email' ? 'Email' : 'Phone'}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function AuthView() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [screen, setScreen] = useState<Screen>('landing');
  const [tab, setTab] = useState<InputTab>('email');

  // Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [agreed, setAgreed] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reset = () => { setError(''); setSuccess(''); };
  const go = (s: Screen) => { reset(); setScreen(s); };

  // ─── Handlers ───────────────────────────────────────────────
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault(); reset();
    if (tab === 'email') {
      if (!isValidEmail(email)) { setError('Enter a valid email'); return; }
    } else {
      if (!isValidPhone(phone)) { setError('Enter a valid phone number (e.g. +8801XXXXXXXXX)'); return; }
    }
    if (!password) { setError('Enter your password'); return; }
    setLoading(true);
    const result = tab === 'email'
      ? await auth.login(email, password)
      : await auth.loginWithPhone(normalizePhone(phone), password);
    setLoading(false);
    if (!result.success) setError(result.error || 'Login failed');
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault(); reset();
    if (!name.trim()) { setError('Enter your name'); return; }
    if (tab === 'email') {
      if (!isValidEmail(email)) { setError('Enter a valid email'); return; }
    } else {
      if (!isValidPhone(phone)) { setError('Enter a valid phone number (e.g. +8801XXXXXXXXX)'); return; }
    }
    if (passwordStrength(password) < 3) { setError('Password too weak — add uppercase, number, or special character'); return; }
    if (password !== confirmPw) { setError('Passwords do not match'); return; }
    if (!agreed) { setError('Please agree to the terms'); return; }
    setLoading(true);
    const result = tab === 'email'
      ? await auth.signup(name, email, password)
      : await auth.signupWithPhone(name, normalizePhone(phone), password);
    setLoading(false);
    if (result.success) {
      if (result.needsEmailVerification) {
        toast.success('Account created! Check your email for a verification link from GaGa Chat.');
        go('login-email');
      } else {
        toast.success('Welcome to GaGa Chat! 🎉');
      }
    } else {
      setError(result.error || 'Signup failed');
    }
  };

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault(); reset();
    if (!isValidEmail(email)) { setError('Enter a valid email'); return; }
    setLoading(true);
    const result = await auth.sendMagicLink(email);
    setLoading(false);
    if (result.success) setSuccess('Magic link sent! Check your inbox — the email is from GaGa Chat.');
    else setError(result.error || 'Failed to send link');
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault(); reset();
    if (!isValidEmail(email)) { setError('Enter a valid email'); return; }
    setLoading(true);
    const result = await auth.resetPassword(email);
    setLoading(false);
    if (result.success) { setSuccess('Reset link sent! Check your inbox.'); setTimeout(() => go('login-email'), 2500); }
    else setError(result.error || 'Failed to send reset link');
  };

  // ─── Screens ─────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#E8F5E9] via-[#FFFDE7] to-[#FCE4EC] relative overflow-hidden flex items-center justify-center px-4 py-8">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {BUBBLES.map((b, i) => <Bubble key={i} {...b} />)}
      </div>

      <button type="button" onClick={() => navigate('/')}
        className="absolute top-5 left-5 z-20 flex items-center gap-1.5 px-3.5 py-2 bg-white/70 backdrop-blur-sm rounded-full border border-white/50 text-[#555] text-xs font-medium hover:bg-white transition-all shadow-sm">
        <Home size={14} /> Home
      </button>

      <div className="relative z-10 w-full max-w-sm">
        <AnimatePresence mode="wait">

          {/* ── LANDING ── */}
          {screen === 'landing' && (
            <Card key="landing">
              <LogoHeader subtitle="Connect. Share. Belong." />

              <div className="space-y-3">
                <button type="button" onClick={() => { reset(); setTab('email'); go('login-email'); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-[#00C300] to-[#00A300] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#00C300]/25 hover:from-[#00A300] hover:to-[#008800] transition-all active:scale-[0.98]">
                  <Mail size={18} /> Sign in with Email
                </button>

                <button type="button" onClick={() => { reset(); setTab('phone'); go('login-phone'); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border-2 border-[#E8E8E8] hover:border-[#00C300]/40 text-[#111] rounded-2xl text-sm font-bold transition-all active:scale-[0.98]">
                  <Phone size={18} className="text-[#00C300]" /> Sign in with Phone
                </button>

                <button type="button" onClick={() => { reset(); go('magic'); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border-2 border-[#E8E8E8] hover:border-[#00C300]/40 text-[#111] rounded-2xl text-sm font-bold transition-all active:scale-[0.98]">
                  <Sparkles size={18} className="text-[#FF9800]" /> Magic Link (no password)
                </button>
              </div>

              <div className="mt-5 pt-4 border-t border-[#F0F0F0] text-center">
                <p className="text-[#ABABAB] text-xs">
                  New here?{' '}
                  <button type="button" onClick={() => { reset(); setTab('email'); go('signup-email'); }}
                    className="text-[#00C300] font-bold hover:underline">Create account</button>
                </p>
              </div>
            </Card>
          )}

          {/* ── LOGIN (email or phone via tab) ── */}
          {(screen === 'login-email' || screen === 'login-phone') && (
            <Card key="login">
              <BackBtn onClick={() => go('landing')} />
              <LogoHeader subtitle="Welcome back" />
              <form onSubmit={handleLogin} className="space-y-3">
                <TabSwitch tab={tab} setTab={t => { reset(); setTab(t); }} />
                {tab === 'email'
                  ? <InputField icon={Mail} type="email" value={email} onChange={setEmail} placeholder="Email address" />
                  : <InputField icon={Phone} value={phone} onChange={setPhone} placeholder="Phone number (e.g. +8801XXXXXXXXX)" />
                }
                <PasswordField value={password} onChange={setPassword} />
                {tab === 'email' && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => go('forgot')} className="text-[10px] text-[#00C300] font-semibold hover:underline">
                      Forgot password?
                    </button>
                  </div>
                )}
                <ErrorMsg msg={error} />
                <PrimaryBtn loading={loading}>Sign In</PrimaryBtn>
                <p className="text-center text-[11px] text-[#ABABAB]">
                  No account?{' '}
                  <button type="button" onClick={() => go('signup-email')} className="text-[#00C300] font-bold hover:underline">Sign up</button>
                </p>
              </form>
            </Card>
          )}

          {/* ── SIGNUP ── */}
          {(screen === 'signup-email' || screen === 'signup-phone') && (
            <Card key="signup">
              <BackBtn onClick={() => go('landing')} />
              <LogoHeader subtitle="Create your account" />
              <form onSubmit={handleSignup} className="space-y-3">
                <TabSwitch tab={tab} setTab={t => { reset(); setTab(t); }} />
                <InputField icon={User} value={name} onChange={setName} placeholder="Full name" />
                {tab === 'email'
                  ? <InputField icon={Mail} type="email" value={email} onChange={setEmail} placeholder="Email address" />
                  : <InputField icon={Phone} value={phone} onChange={setPhone} placeholder="Phone number (e.g. +8801XXXXXXXXX)" />
                }
                <PasswordField value={password} onChange={setPassword} placeholder="Create password" />
                <StrengthBar password={password} />
                <PasswordField value={confirmPw} onChange={setConfirmPw} placeholder="Confirm password" />
                <AgreeBox agreed={agreed} setAgreed={setAgreed} navigate={navigate} />
                <ErrorMsg msg={error} />
                <PrimaryBtn loading={loading} disabled={!agreed}>Create Account</PrimaryBtn>
                <p className="text-center text-[11px] text-[#ABABAB]">
                  Already have an account?{' '}
                  <button type="button" onClick={() => go('login-email')} className="text-[#00C300] font-bold hover:underline">Sign in</button>
                </p>
              </form>
            </Card>
          )}

          {/* ── MAGIC LINK ── */}
          {screen === 'magic' && (
            <Card key="magic">
              <BackBtn onClick={() => go('landing')} />
              <LogoHeader subtitle="Sign in without a password" />
              <form onSubmit={handleMagicLink} className="space-y-3">
                <p className="text-[12px] text-[#888] text-center -mt-2 mb-1">
                  We'll send a one-tap sign-in link to your email — no password needed.
                </p>
                <InputField icon={Mail} type="email" value={email} onChange={setEmail} placeholder="Email address" />
                <ErrorMsg msg={error} />
                <SuccessMsg msg={success} />
                <PrimaryBtn loading={loading}>
                  <Send size={15} /> Send Magic Link
                </PrimaryBtn>
              </form>
            </Card>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {screen === 'forgot' && (
            <Card key="forgot">
              <BackBtn onClick={() => go('login-email')} />
              <LogoHeader subtitle="Reset your password" />
              <form onSubmit={handleForgot} className="space-y-3">
                <p className="text-[12px] text-[#888] text-center -mt-2 mb-1">
                  Enter your email and we'll send a reset link from GaGa Chat.
                </p>
                <InputField icon={Mail} type="email" value={email} onChange={setEmail} placeholder="Email address" />
                <ErrorMsg msg={error} />
                <SuccessMsg msg={success} />
                <PrimaryBtn loading={loading}>Send Reset Link</PrimaryBtn>
              </form>
            </Card>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
