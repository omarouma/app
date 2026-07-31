import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Mail, User, Lock, Eye, EyeOff,
  Check, Loader, AlertCircle,
  Home,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import Logo from '@/components/Logo';

// ─── Glassmorphism Floating Bubbles (brand colors) ───
const floatingBubbles = [
  { size: 240, top: '5%', left: '8%', color: '#00C300', opacity: 0.08, delay: 0 },
  { size: 180, top: '55%', left: '3%', color: '#00C300', opacity: 0.06, delay: 1.2 },
  { size: 140, top: '18%', left: '38%', color: '#FF9800', opacity: 0.06, delay: 0.6 },
  { size: 300, top: '35%', left: '18%', color: '#00C300', opacity: 0.05, delay: 2.1 },
  { size: 160, top: '70%', left: '22%', color: '#FF4081', opacity: 0.06, delay: 1.8 },
  { size: 200, top: '10%', left: '55%', color: '#00C300', opacity: 0.07, delay: 0.9 },
  { size: 100, top: '60%', left: '48%', color: '#2196F3', opacity: 0.05, delay: 2.5 },
  { size: 180, top: '25%', left: '72%', color: '#00C300', opacity: 0.06, delay: 1.5 },
  { size: 140, top: '78%', left: '68%', color: '#FF9800', opacity: 0.06, delay: 0.3 },
  { size: 80, top: '2%', left: '85%', color: '#FF4081', opacity: 0.05, delay: 2.8 },
];

function FloatingBubble({ size, top, left, color, opacity, delay }: typeof floatingBubbles[0]) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{ width: size, height: size, top, left, backgroundColor: color, opacity, zIndex: 1, filter: 'blur(80px)' }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1, y: [0, -20, 0, -10, 0], x: [0, 10, 0, -6, 0] }}
      transition={{
        opacity: { duration: 1, delay: delay * 0.3 },
        scale: { duration: 1.2, delay: delay * 0.3 },
        y: { duration: 8 + delay, repeat: Infinity, ease: 'easeInOut' },
        x: { duration: 9 + delay, repeat: Infinity, ease: 'easeInOut' },
      }}
    />
  );
}

function ErrorMsg({ error }: { error: string }) {
  return error ? (
    <p className="text-red-500 text-sm flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-xl">
      <AlertCircle size={14} /> {error}
    </p>
  ) : null;
}

function SuccessMsg({ success }: { success: string }) {
  return success ? (
    <p className="text-[#00C300] text-sm flex items-center gap-1.5 bg-[#00C300]/5 px-3 py-2 rounded-xl">
      <Check size={14} /> {success}
    </p>
  ) : null;
}

function AgreeCheckbox({ agreed, setAgreed, navigate }: { agreed: boolean; setAgreed: (v: boolean) => void; navigate: (path: string) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer text-[#8D8D8D] text-xs leading-relaxed">
      <input
        type="checkbox"
        checked={agreed}
        onChange={(event) => setAgreed(event.target.checked)}
        className="sr-only"
      />
      <span className={`w-5 h-5 rounded-lg border transition-colors flex items-center justify-center shrink-0 mt-0.5 ${agreed ? 'bg-[#00C300] border-[#00C300]' : 'border-[#C7C7CC]'}`}>
        {agreed && <Check size={12} className="text-white" />}
      </span>
      <span>
        I agree to the{' '}
        <button type="button" onClick={() => navigate('/terms')} className="text-[#00C300] font-medium hover:underline">User Agreement</button>
        {' '}and{' '}
        <button type="button" onClick={() => navigate('/privacy')} className="text-[#00C300] font-medium hover:underline">Privacy Policy</button>
      </span>
    </label>
  );
}

type AuthMode = 'password' | 'signup';

export default function AuthView() {
  const navigate = useNavigate();
  const { login, signup, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('password');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const resetForm = () => { setError(''); setSuccess(''); setLoading(false); };
  const switchMode = (m: AuthMode) => { setMode(m); resetForm(); };

  const handleEmailLogin = async () => {
    setError(''); setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.needsEmailVerification) { toast.info('Please verify your email first'); return; }
    if (!result.success) setError(result.error || 'Login failed');
  };

  const handleEmailSignup = async () => {
    setError('');
    if (!name.trim()) { setError('Enter your name'); return; }
    if (!email.trim()) { setError('Enter your email'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter'); return; }
    if (!/[a-z]/.test(password)) { setError('Password must contain at least one lowercase letter'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must contain at least one number'); return; }
    if (!/[^A-Za-z0-9]/.test(password)) { setError('Password must contain at least one special character'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!agreed) { setError('Please agree to the terms'); return; }
    setLoading(true);
    const result = await signup(name, email, password);
    setLoading(false);
    if (result.success) {
      if (result.needsEmailVerification) {
        toast.success('Account created! Please check your email and click the verification link.');
      } else {
        toast.success('Account created! Welcome to GaGa Chat.');
      }
      setMode('password');
    } else {
      setError(result.error || 'Signup failed');
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    if (!email.trim()) { setError('Enter your email'); return; }
    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);
    if (result.success) { setSuccess('Reset link sent!'); setTimeout(() => setForgotMode(false), 2000); }
    else { setError(result.error || 'Failed to send reset link'); }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (forgotMode) {
      await handleForgotPassword();
      return;
    }

    if (mode === 'signup') {
      await handleEmailSignup();
      return;
    }

    await handleEmailLogin();
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#E8F5E9] via-[#FFF3E0] to-[#FCE4EC] relative overflow-hidden flex items-center justify-center px-4">
      {/* Floating Bubbles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {floatingBubbles.map((bubble, i) => <FloatingBubble key={i} {...bubble} />)}
      </div>

      {/* Back to Home */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="absolute top-5 left-5 z-20 flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-sm rounded-full border border-white/50 text-[#111111] text-sm font-medium hover:bg-white transition-colors shadow-sm"
      >
        <Home size={16} /> Home
      </button>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode + (forgotMode ? '-forgot' : '')}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.4, type: 'spring' }}
            className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 w-full relative overflow-hidden"
          >
            {/* Decorative corner */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#00C300]/10 to-transparent rounded-bl-full" />

            {forgotMode ? (
              /* ─── FORGOT PASSWORD ─── */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-md mx-auto mb-3">
                      <Logo size={32} />
                    </div>
                    <h2 className="font-bold text-[#111111] text-sm">GaGa Chat</h2>
                    <p className="text-[#8D8D8D] text-[10px]">Reset Password</p>
                  </div>
                </div>
                <div className="mb-4">
                  <button type="button" onClick={() => setForgotMode(false)} className="flex items-center gap-1 text-[#8D8D8D] text-sm hover:text-[#111111] mb-4 transition-colors">
                    <ArrowLeft size={16} /> Back to login
                  </button>
                  <h3 className="text-lg font-bold text-[#111111] mb-1">Reset Password</h3>
                  <p className="text-[#8D8D8D] text-sm mb-6">Enter your email to receive reset instructions</p>
                </div>
                <div className="space-y-4">
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                    />
                  </div>
                  <ErrorMsg error={error} />
                  <SuccessMsg success={success} />
                  <button type="submit" className="w-full py-3.5 bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#00C300]/20" disabled={loading}>
                    {loading ? <Loader size={18} className="animate-spin" /> : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            ) : mode === 'signup' ? (
              /* ─── SIGNUP ─── */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-md mx-auto mb-3">
                      <Logo size={32} />
                    </div>
                    <h2 className="font-bold text-[#111111] text-sm">GaGa Chat</h2>
                    <p className="text-[#8D8D8D] text-[10px]">Create your account</p>
                  </div>
                </div>
                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                  <div className="relative">
                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Full name"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignup()}
                    />
                  </div>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignup()}
                    />
                  </div>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Password (min 8 chars)"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-12 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignup()}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] hover:text-[#111111]">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-12 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignup()}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] hover:text-[#111111]">
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {password.length > 0 && (
                    <div className="space-y-1 px-1">
                      <div className="flex gap-1 h-1">
                        {[0, 1, 2, 3].map((i) => {
                          const strength =
                            (password.length >= 8 ? 1 : 0) +
                            (/[A-Z]/.test(password) ? 1 : 0) +
                            (/[a-z]/.test(password) ? 1 : 0) +
                            (/[0-9]/.test(password) ? 1 : 0) +
                            (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
                          const filled = strength > i;
                          const color = strength <= 2 ? 'bg-red-400' : strength <= 3 ? 'bg-orange-400' : 'bg-[#00C300]';
                          return <div key={i} className={`flex-1 rounded-full ${filled ? color : 'bg-[#EBEBEB]'}`} />;
                        })}
                      </div>
                      <p className="text-[10px] text-[#8D8D8D]">
                        {password.length < 8 ? 'Min 8 chars' : /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) ? 'Strong password' : 'Add uppercase, lowercase, number, special char'}
                      </p>
                    </div>
                  )}

                  <AgreeCheckbox agreed={agreed} setAgreed={setAgreed} navigate={navigate} />
                  <ErrorMsg error={error} />
                  <SuccessMsg success={success} />
                  <button type="submit" className="w-full py-3.5 bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#00C300]/20" disabled={loading || !agreed}>
                    {loading ? <Loader size={18} className="animate-spin" /> : 'Create Account'}
                  </button>
                  <p className="text-center text-[#8D8D8D] text-sm">
                    Already have an account?{' '}
                    <button type="button" onClick={() => switchMode('password')} className="text-[#00C300] font-bold hover:underline">Sign In</button>
                  </p>
                </div>
              </form>
            ) : (
              /* ─── PASSWORD LOGIN ─── */
              <form onSubmit={handleSubmit}>
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-md mx-auto mb-3">
                      <Logo size={32} />
                    </div>
                    <h2 className="font-bold text-[#111111] text-sm">GaGa Chat</h2>
                    <p className="text-[#8D8D8D] text-[10px]">Log in with password</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                    />
                  </div>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-12 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] hover:text-[#111111]">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setForgotMode(true)} className="text-[#00C300] text-xs font-medium hover:underline">Forgot password?</button>
                  </div>
                  <ErrorMsg error={error} />
                  <SuccessMsg success={success} />
                  <button type="submit" className="w-full py-3.5 bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#00C300]/20" disabled={loading}>
                    {loading ? <Loader size={18} className="animate-spin" /> : 'Log In'}
                  </button>
                  <p className="text-center text-[#8D8D8D] text-sm">
                    New to GaGa?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="text-[#00C300] font-bold hover:underline">Sign up here</button>
                  </p>
                </div>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
