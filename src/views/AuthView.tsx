/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Mail, Smartphone, User, Lock, Eye, EyeOff,
  Check, Loader, AlertCircle, QrCode, ChevronRight,
  Home, KeyRound
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getSupabase } from '@/lib/supabase';
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

// ─── QR Code SVG Generator ───
function QRCodeSVG({ data, size = 200 }: { data: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    import('qrcode').then((QR) => {
      QR.toString(data, { type: 'svg', width: size, margin: 2, color: { dark: '#111111', light: '#ffffff' } })
        .then(setSvg).catch(() => setSvg(''));
    });
  }, [data, size]);
  if (!svg) return <div className="w-full h-full bg-[#F5F5F5] rounded-xl animate-pulse" />;
  return <div dangerouslySetInnerHTML={{ __html: svg }} className="w-full h-full flex items-center justify-center" />;
}

// ─── Country codes ───
const countryCodes = [
  { code: '+880', country: 'Bangladesh' },
  { code: '+86', country: 'China' },
  { code: '+1', country: 'USA' },
  { code: '+44', country: 'UK' },
  { code: '+91', country: 'India' },
  { code: '+92', country: 'Pakistan' },
  { code: '+62', country: 'Indonesia' },
  { code: '+65', country: 'Singapore' },
  { code: '+60', country: 'Malaysia' },
  { code: '+66', country: 'Thailand' },
  { code: '+84', country: 'Vietnam' },
  { code: '+95', country: 'Myanmar' },
  { code: '+977', country: 'Nepal' },
  { code: '+93', country: 'Afghanistan' },
  { code: '+94', country: 'Sri Lanka' },
  { code: '+90', country: 'Turkey' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+971', country: 'UAE' },
  { code: '+20', country: 'Egypt' },
  { code: '+27', country: 'South Africa' },
  { code: '+61', country: 'Australia' },
  { code: '+81', country: 'Japan' },
  { code: '+82', country: 'South Korea' },
  { code: '+7', country: 'Russia' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  { code: '+39', country: 'Italy' },
  { code: '+34', country: 'Spain' },
  { code: '+31', country: 'Netherlands' },
  { code: '+46', country: 'Sweden' },
];

type AuthMode = 'sms' | 'password' | 'email_otp' | 'qr' | 'signup';

export default function AuthView() {
  const navigate = useNavigate();
  const { login, signup, resetPassword, sendPhoneOtp, verifyPhoneOtp, sendEmailOtp, verifyEmailOtp, resendVerificationEmail, signInWithGoogle, signInWithFacebook, signInWithApple } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sms');
  const [, setPrevMode] = useState<AuthMode | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+880');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // QR Login states
  const [qrSessionId, setQrSessionId] = useState('');
  const [qrStatus, setQrStatus] = useState<'waiting' | 'scanned' | 'confirmed' | 'expired'>('waiting');
  const qrChannelRef = useRef<ReturnType<ReturnType<typeof getSupabase>['channel']> | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timeout = navTimeoutRef.current;
    return () => { if (timeout) clearTimeout(timeout); };
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((c) => { if (c <= 1) { clearInterval(timer); return 0; } return c - 1; });
    }, 1000);
  }, []);

  const resetForm = () => { setError(''); setSuccess(''); setLoading(false); setOtp(''); };
  const switchMode = (m: AuthMode) => { setPrevMode(mode); setMode(m); resetForm(); };

  // ─── QR Login with Supabase ───
  const generateQRSession = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) { toast.error('Supabase not configured for QR login'); return; }
    const sessionId = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    setQrSessionId(sessionId);
    setQrStatus('waiting');

    // Create session in database (best-effort; table may not exist yet)
    try {
      await supabase.from('qr_sessions').insert({
        session_id: sessionId,
        status: 'waiting',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    } catch { /* noop */ }

    // Listen via realtime
    const channel = supabase.channel(`qr_session_${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'qr_sessions',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const data = payload.new as any;
        if (data?.status === 'scanned') setQrStatus('scanned');
        if (data?.status === 'confirmed' && data?.user_id) {
          setQrStatus('confirmed');
          toast.success('QR login confirmed!');
          navigate('/contacts');
        }
        if (data?.status === 'expired') setQrStatus('expired');
      })
      .subscribe();
    qrChannelRef.current = channel;

    // Auto-expire after 5 minutes
    setTimeout(() => {
      try {
        supabase.from('qr_sessions').update({ status: 'expired' }).eq('session_id', sessionId);
      } catch { /* noop */ }
    }, 5 * 60 * 1000);
  }, [navigate]);

  useEffect(() => {
    if (mode === 'qr' && !qrSessionId) { generateQRSession(); }
    return () => { if (qrChannelRef.current) { getSupabase()?.removeChannel(qrChannelRef.current); qrChannelRef.current = null; } };
  }, [mode, qrSessionId, generateQRSession]);

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
    }
    else { setError(result.error || 'Signup failed'); }
  };

  const handleSendOtp = async () => {
    setError('');
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 6) { setError('Enter a valid phone number'); return; }
    const fullPhone = `${countryCode}${cleanPhone}`;
    setLoading(true);
    const result = await sendPhoneOtp(fullPhone);
    setLoading(false);
    if (result.success) { setSuccess('Code sent!'); startCountdown(); }
    else { setError(result.error || 'Failed to send code'); }
  };

  const handleVerifyOtp = async () => {
    setError(''); setSuccess('');
    if (!otp.trim() || otp.length !== 6) { setError('Enter the 6-digit code'); return; }
    if (!agreed) { setError('Please agree to the terms'); return; }
    setLoading(true);
    const fullPhone = `${countryCode}${phone.trim()}`;
    const nameForPhone = name.trim() || `User_${phone.slice(-4)}`;
    const result = await verifyPhoneOtp(fullPhone, otp, nameForPhone);
    setLoading(false);
    if (!result.success) setError(result.error || 'Invalid code');
  };

  // ─── Email OTP handlers ───
  const handleSendEmailOtp = async () => {
    setError('');
    if (!email.trim()) { setError('Enter your email'); return; }
    setLoading(true);
    const result = await sendEmailOtp(email.trim());
    setLoading(false);
    if (result.success) { setSuccess('OTP sent to your email!'); startCountdown(); }
    else { setError(result.error || 'Failed to send OTP'); }
  };

  const handleVerifyEmailOtp = async () => {
    setError(''); setSuccess('');
    if (!otp.trim() || otp.length !== 6) { setError('Enter the 6-digit code'); return; }
    setLoading(true);
    const result = await verifyEmailOtp(email.trim(), otp);
    setLoading(false);
    if (!result.success) setError(result.error || 'Invalid or expired OTP');
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleResendVerification = async () => {
    setError(''); setSuccess(''); setLoading(true);
    const result = await resendVerificationEmail(email);
    setLoading(false);
    if (result.success) setSuccess('Verification email resent!');
    else setError(result.error || 'Failed to resend email');
  };

  const handleGoogleSignIn = async () => {
    setError(''); setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('provider') || msg.includes('not enabled') || msg.includes('not configured')) {
        setError('Google OAuth not configured. Go to Supabase → Auth → Providers to enable it.');
      } else {
        setError('Google sign-in failed: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    setError(''); setLoading(true);
    try {
      await signInWithFacebook();
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('provider') || msg.includes('not enabled') || msg.includes('not configured')) {
        setError('Facebook OAuth not configured. Go to Supabase → Auth → Providers to enable it.');
      } else {
        setError('Facebook sign-in failed: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAppleSignIn = async () => {
    setError(''); setLoading(true);
    try {
      await signInWithApple();
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('provider') || msg.includes('not enabled') || msg.includes('not configured')) {
        setError('Apple OAuth not configured. Go to Supabase → Auth → Providers to enable it.');
      } else {
        setError('Apple sign-in failed: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const GreenButton = ({ onClick, text, disabled = false }: { onClick: () => void; text: string; disabled?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full py-3.5 bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#00C300]/20"
    >
      {loading ? <Loader size={18} className="animate-spin" /> : text}
    </button>
  );

  const ErrorMsg = () => error ? (
    <p className="text-red-500 text-sm flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-xl">
      <AlertCircle size={14} /> {error}
    </p>
  ) : null;
  const SuccessMsg = () => success ? (
    <p className="text-[#00C300] text-sm flex items-center gap-1.5 bg-[#00C300]/5 px-3 py-2 rounded-xl">
      <Check size={14} /> {success}
    </p>
  ) : null;

  const AgreeCheckbox = () => (
    <div className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => setAgreed(!agreed)}
        className={`w-5 h-5 rounded-lg border transition-colors flex items-center justify-center shrink-0 mt-0.5 ${
          agreed ? 'bg-[#00C300] border-[#00C300]' : 'border-[#C7C7CC]'
        }`}
      >
        {agreed && <Check size={12} className="text-white" />}
      </button>
      <span className="text-[#8D8D8D] text-xs leading-relaxed">
        I agree to the{' '}
        <button type="button" onClick={() => navigate('/terms')} className="text-[#00C300] font-medium hover:underline">User Agreement</button>
        {' '}and{' '}
        <button type="button" onClick={() => navigate('/privacy')} className="text-[#00C300] font-medium hover:underline">Privacy Policy</button>
      </span>
    </div>
  );

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

            {/* QR toggle */}
            {mode !== 'qr' && !forgotMode && (
              <button
                type="button"
                onClick={() => switchMode('qr')}
                className="absolute top-5 right-5 p-2 rounded-xl hover:bg-[#F5F5F5] transition-colors text-[#8D8D8D] hover:text-[#111111] z-10"
                title="QR Login"
              >
                <QrCode size={22} />
              </button>
            )}

            {/* ─── QR LOGIN ─── */}
            {mode === 'qr' ? (
              <>
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-md mx-auto mb-3">
                      <Logo size={32} />
                    </div>
                    <h2 className="font-bold text-[#111111] text-sm">GaGa Chat</h2>
                    <p className="text-[#8D8D8D] text-[10px]">QR Login</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="w-48 h-48 mx-auto mb-4 bg-white rounded-2xl p-3 border border-[#EBEBEB] shadow-sm">
                    {qrSessionId ? <QRCodeSVG data={`${window.location.origin}/qr-login?session=${qrSessionId}`} size={170} /> : <div className="w-full h-full bg-[#F5F5F5] rounded-xl animate-pulse" />}
                  </div>
                  <p className="text-[#8D8D8D] text-sm mb-1">
                    {qrStatus === 'waiting' && 'Scan with GaGa Chat mobile app to log in'}
                    {qrStatus === 'scanned' && 'Scan confirmed! Waiting for approval...'}
                    {qrStatus === 'confirmed' && 'Login successful! Redirecting...'}
                    {qrStatus === 'expired' && 'QR code expired. Refresh to generate a new one.'}
                  </p>
                  {qrStatus === 'expired' && (
                    <button type="button" onClick={generateQRSession} className="mt-3 text-[#00C300] text-sm font-bold hover:underline">
                      Refresh QR Code
                    </button>
                  )}
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${qrStatus === 'waiting' ? 'bg-[#00C300] animate-pulse' : qrStatus === 'scanned' ? 'bg-yellow-400' : qrStatus === 'confirmed' ? 'bg-[#00C300]' : 'bg-[#C7C7CC]'}`} />
                    <span className="text-[#8D8D8D] text-xs capitalize">{qrStatus}</span>
                  </div>
                </div>
                <div className="mt-6 text-center">
                  <button type="button" onClick={() => switchMode('sms')} className="text-[#8D8D8D] text-sm hover:text-[#111111] transition-colors">
                    Back to login
                  </button>
                </div>
              </>
            ) : forgotMode ? (
              /* ─── FORGOT PASSWORD ─── */
              <>
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
                  <ErrorMsg />
                  <SuccessMsg />
                  <GreenButton onClick={handleForgotPassword} text="Send Reset Link" />
                </div>
              </>
            ) : mode === 'signup' ? (
              /* ─── SIGNUP ─── */
              <>
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
                    <Smartphone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="Phone number (optional)"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
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

                  <AgreeCheckbox />
                  <ErrorMsg />
                  <SuccessMsg />
                  <GreenButton onClick={handleEmailSignup} text="Create Account" disabled={!agreed} />
                  <p className="text-center text-[#8D8D8D] text-sm">
                    Already have an account?{' '}
                    <button type="button" onClick={() => switchMode('password')} className="text-[#00C300] font-bold hover:underline">Sign In</button>
                  </p>

                  {/* Social Login */}
                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                      <span className="text-[#8D8D8D] text-xs">Or sign up with</span>
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.8-.07-1.53-.2-2.25H9v4.26h4.84c-.21 1.14-.84 2.1-1.8 2.74v2.28h2.91c1.71-1.58 2.69-3.9 2.69-6.03z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.28c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.35C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.96 10.69c-.18-.54-.29-1.12-.29-1.71s.11-1.17.29-1.71V4.92H.96C.35 6.1 0 7.45 0 9s.35 2.9.96 4.08l2.99-2.39z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.9 11.43 0 9 0 5.48 0 2.44 2.02.96 4.92l2.99 2.39c.71-2.13 2.7-3.73 5.05-3.73z"/></svg>
                        Google
                      </button>
                      <button type="button" onClick={handleFacebookSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#1877F2" d="M18 9a9 9 0 1 0-10.4 8.9v-6.3H5.3V9h2.3V7c0-2.3 1.4-3.6 3.5-3.6 1 0 2 .1 2 .1v2.3h-1.5c-1.2 0-1.5.6-1.5 1.5V9h2.6l-.4 2.6h-2.2v6.3A9 9 0 0 0 18 9z"/></svg>
                        Facebook
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : mode === 'sms' ? (
              /* ─── SMS LOGIN ─── */
              <>
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-md mx-auto mb-3">
                      <Logo size={32} />
                    </div>
                    <h2 className="font-bold text-[#111111] text-sm">GaGa Chat</h2>
                    <p className="text-[#8D8D8D] text-[10px]">Log in with phone</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative shrink-0">
                      <select
                        value={countryCode}
                        onChange={e => setCountryCode(e.target.value)}
                        className="h-full bg-[#F5F5F5] rounded-xl pl-4 pr-8 py-3.5 text-sm text-[#111111] outline-none focus:ring-2 focus:ring-[#00C300]/30 cursor-pointer appearance-none border border-transparent hover:border-[#EBEBEB] transition-colors"
                      >
                        {countryCodes.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                      <ChevronRight size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8D8D8D] pointer-events-none rotate-90" />
                    </div>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="Phone number"
                      className="flex-1 bg-[#F5F5F5] rounded-xl px-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                      maxLength={15}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                      <input
                        type="text"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Verification code"
                        className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                        maxLength={6}
                        inputMode="numeric"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={countdown > 0 || loading}
                      className={`shrink-0 px-4 py-3.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                        countdown > 0 ? 'bg-[#F5F5F5] text-[#8D8D8D] cursor-not-allowed' : 'bg-[#00C300]/10 text-[#00C300] hover:bg-[#00C300]/20'
                      }`}
                    >
                      {countdown > 0 ? `${countdown}s` : 'Send Code'}
                    </button>
                  </div>
                  <ErrorMsg />
                  <SuccessMsg />
                  <GreenButton onClick={handleVerifyOtp} text="Log In" />
                  <AgreeCheckbox />
                  <p className="text-center text-[#8D8D8D] text-sm">
                    New to GaGa?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="text-[#00C300] font-bold hover:underline">Sign up here</button>
                  </p>

                  {/* Social Login */}
                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                      <span className="text-[#8D8D8D] text-xs">Or continue with</span>
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.8-.07-1.53-.2-2.25H9v4.26h4.84c-.21 1.14-.84 2.1-1.8 2.74v2.28h2.91c1.71-1.58 2.69-3.9 2.69-6.03z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.28c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.35C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.96 10.69c-.18-.54-.29-1.12-.29-1.71s.11-1.17.29-1.71V4.92H.96C.35 6.1 0 7.45 0 9s.35 2.9.96 4.08l2.99-2.39z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.9 11.43 0 9 0 5.48 0 2.44 2.02.96 4.92l2.99 2.39c.71-2.13 2.7-3.73 5.05-3.73z"/></svg>
                        Google
                      </button>
                      <button type="button" onClick={handleFacebookSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#1877F2" d="M18 9a9 9 0 1 0-10.4 8.9v-6.3H5.3V9h2.3V7c0-2.3 1.4-3.6 3.5-3.6 1 0 2 .1 2 .1v2.3h-1.5c-1.2 0-1.5.6-1.5 1.5V9h2.6l-.4 2.6h-2.2v6.3A9 9 0 0 0 18 9z"/></svg>
                        Facebook
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : mode === 'email_otp' ? (
              /* ─── EMAIL OTP LOGIN ─── */
              <>
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-md mx-auto mb-3">
                      <Logo size={32} />
                    </div>
                    <h2 className="font-bold text-[#111111] text-sm">GaGa Chat</h2>
                    <p className="text-[#8D8D8D] text-[10px]">Email OTP login</p>
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
                      onKeyDown={e => e.key === 'Enter' && handleSendEmailOtp()}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] z-10" />
                      <input
                        type="text"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit OTP"
                        className="w-full bg-[#F5F5F5] rounded-xl pl-12 pr-4 py-3.5 text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
                        maxLength={6}
                        inputMode="numeric"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendEmailOtp}
                      disabled={countdown > 0 || loading}
                      className={`shrink-0 px-4 py-3.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                        countdown > 0 ? 'bg-[#F5F5F5] text-[#8D8D8D] cursor-not-allowed' : 'bg-[#00C300]/10 text-[#00C300] hover:bg-[#00C300]/20'
                      }`}
                    >
                      {countdown > 0 ? `${countdown}s` : 'Send OTP'}
                    </button>
                  </div>
                  <ErrorMsg />
                  <SuccessMsg />
                  <GreenButton onClick={handleVerifyEmailOtp} text="Verify & Log In" />
                  <p className="text-center text-[#8D8D8D] text-sm">
                    New to GaGa?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="text-[#00C300] font-bold hover:underline">Sign up here</button>
                  </p>

                  {/* Social Login */}
                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                      <span className="text-[#8D8D8D] text-xs">Or continue with</span>
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.8-.07-1.53-.2-2.25H9v4.26h4.84c-.21 1.14-.84 2.1-1.8 2.74v2.28h2.91c1.71-1.58 2.69-3.9 2.69-6.03z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.28c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.35C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.96 10.69c-.18-.54-.29-1.12-.29-1.71s.11-1.17.29-1.71V4.92H.96C.35 6.1 0 7.45 0 9s.35 2.9.96 4.08l2.99-2.39z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.9 11.43 0 9 0 5.48 0 2.44 2.02.96 4.92l2.99 2.39c.71-2.13 2.7-3.73 5.05-3.73z"/></svg>
                        Google
                      </button>
                      <button type="button" onClick={handleFacebookSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#1877F2" d="M18 9a9 9 0 1 0-10.4 8.9v-6.3H5.3V9h2.3V7c0-2.3 1.4-3.6 3.5-3.6 1 0 2 .1 2 .1v2.3h-1.5c-1.2 0-1.5.6-1.5 1.5V9h2.6l-.4 2.6h-2.2v6.3A9 9 0 0 0 18 9z"/></svg>
                        Facebook
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* ─── PASSWORD LOGIN ─── */
              <>
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
                      type="text"
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRememberMe(!rememberMe)}
                        className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${rememberMe ? 'bg-[#00C300] border-[#00C300]' : 'border-[#C7C7CC]'}`}
                      >
                        {rememberMe && <Check size={10} className="text-white" />}
                      </button>
                      <span className="text-[#8D8D8D] text-xs">Remember me</span>
                    </div>
                    <button type="button" onClick={() => setForgotMode(true)} className="text-[#00C300] text-xs font-medium hover:underline">Forgot password?</button>
                  </div>
                  <ErrorMsg />
                  <SuccessMsg />
                  <GreenButton onClick={handleEmailLogin} text="Log In" />
                  <AgreeCheckbox />
                  <p className="text-center text-[#8D8D8D] text-sm">
                    New to GaGa?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="text-[#00C300] font-bold hover:underline">Sign up here</button>
                  </p>

                  {/* Social Login */}
                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                      <span className="text-[#8D8D8D] text-xs">Or continue with</span>
                      <div className="flex-1 h-px bg-[#EBEBEB]" />
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.8-.07-1.53-.2-2.25H9v4.26h4.84c-.21 1.14-.84 2.1-1.8 2.74v2.28h2.91c1.71-1.58 2.69-3.9 2.69-6.03z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.28c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.35C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.96 10.69c-.18-.54-.29-1.12-.29-1.71s.11-1.17.29-1.71V4.92H.96C.35 6.1 0 7.45 0 9s.35 2.9.96 4.08l2.99-2.39z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.9 11.43 0 9 0 5.48 0 2.44 2.02.96 4.92l2.99 2.39c.71-2.13 2.7-3.73 5.05-3.73z"/></svg>
                        Google
                      </button>
                      <button type="button" onClick={handleFacebookSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#EBEBEB] hover:bg-[#F5F5F5] transition-colors text-sm font-medium text-[#111111]">
                        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#1877F2" d="M18 9a9 9 0 1 0-10.4 8.9v-6.3H5.3V9h2.3V7c0-2.3 1.4-3.6 3.5-3.6 1 0 2 .1 2 .1v2.3h-1.5c-1.2 0-1.5.6-1.5 1.5V9h2.6l-.4 2.6h-2.2v6.3A9 9 0 0 0 18 9z"/></svg>
                        Facebook
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Mode switcher (bottom tabs) */}
            {mode !== 'qr' && !forgotMode && mode !== 'signup' && (
              <div className="mt-6 pt-4 border-t border-[#EBEBEB]/60">
                <div className="flex bg-[#F5F5F5] rounded-full p-1 gap-1">
                  <button type="button" onClick={() => switchMode('sms')}
                    className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${mode === 'sms' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#8D8D8D] hover:text-[#111111]'}`}
                  >SMS</button>
                  <button type="button" onClick={() => switchMode('password')}
                    className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${mode === 'password' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#8D8D8D] hover:text-[#111111]'}`}
                  >Password</button>
                  <button type="button" onClick={() => switchMode('email_otp')}
                    className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${mode === 'email_otp' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#8D8D8D] hover:text-[#111111]'}`}
                  >Email OTP</button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
