import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Copy, Check, Share2, UserPlus, Wallet, ScanLine,
  Camera, X, Users, RotateCcw, Loader, AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useWalletStore } from '@/store/useWalletStore';
import { useGroupStore } from '@/store/useGroupStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildGagaChatUri, buildGagaChatWebUrl, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import { isFirestoreAvailable, updateDocById } from '@/lib/firestore';
import { toast } from 'sonner';
import Logo from '@/components/Logo';

// QR Code SVG generator
function QRCodeSVG({ data, size = 200 }: { data: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    import('qrcode').then((QR) => {
      QR.toString(data, {
        type: 'svg',
        width: size,
        margin: 2,
        color: { dark: '#111111', light: '#ffffff' }
      }).then(setSvg).catch(() => setSvg(''));
    });
  }, [data, size]);
  if (!svg) return <div className="w-full h-full bg-gray-100 rounded-lg animate-pulse" />;
  return <div dangerouslySetInnerHTML={{ __html: svg }} className="w-full h-full flex items-center justify-center" />;
}

type QRType = 'profile' | 'transfer' | 'group' | 'wallet' | 'login';

interface ScannedUser {
  id: string;
  name: string;
  avatar?: string;
  statusMessage?: string;
  bio?: string;
}

// Camera QR Scanner using BarcodeDetector API
function CameraQRScanner({ onScan, onClose }: { onScan: (data: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const detectedRef = useRef(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      setError('');
    } catch (err) {
      console.warn('[QRScanner] startCamera failed', err);
      setError('Camera access denied or not available. Please allow camera permission.');
      setScanning(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    const initializeCamera = () => {
      startCamera();
    };
    initializeCamera();
    return () => { stopCamera(); detectedRef.current = false; };
  }, [startCamera, stopCamera]);

  // BarcodeDetector scanning loop
  useEffect(() => {
    if (!scanning || !videoRef.current) return;

    const BarcodeDetector = (window as any).BarcodeDetector;
    if (!BarcodeDetector) {
      // Fallback: just show video without auto-scan, user can manually enter
      const handleFallback = () => {
        setError('Auto-scan not available. Please paste the QR data below.');
      };
      handleFallback();
      return;
    }

    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const video = videoRef.current;
    detectedRef.current = false;

    const scanFrame = async () => {
      if (detectedRef.current || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          if (raw) {
            detectedRef.current = true;
            stopCamera();
            onScan(raw);
            return;
          }
        }
      } catch {
        // Frame detection failed, continue scanning
      }
      animFrameRef.current = requestAnimationFrame(scanFrame);
    };

    animFrameRef.current = requestAnimationFrame(scanFrame);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [scanning, onScan, stopCamera]);

  return (
    <div className="relative w-full">
      {/* Video Preview */}
      <div className="relative w-full aspect-square max-w-[340px] mx-auto rounded-3xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        {/* Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Corner brackets */}
          <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-[#00C300] rounded-tl-2xl" />
          <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-[#00C300] rounded-tr-2xl" />
          <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-[#00C300] rounded-bl-2xl" />
          <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-[#00C300] rounded-br-2xl" />
          {/* Scanning laser line */}
          {scanning && !error && (
            <motion.div
              className="absolute left-8 right-8 h-0.5 bg-[#00C300] shadow-[0_0_10px_#00C300]"
              animate={{ top: ['15%', '85%', '15%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            />
          )}
          {/* Center text */}
          {!scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader size={32} className="text-white animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 mx-auto max-w-[340px] bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-[#FF3B30] shrink-0 mt-0.5" />
          <p className="text-[#FF3B30] text-xs">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-4 mt-4">
        <button type="button" onClick={() => { stopCamera(); startCamera(); }}
          className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
        >
          <RotateCcw size={20} />
        </button>
        <button type="button" onClick={() => { stopCamera(); onClose(); }}
          className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}

export default function QRScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'scan' ? 'scan' : 'myqr';
  const { user } = useAuthStore();
  const { sendRequest, getUserById, getFriendStatus } = useFriendStore();
  const { wallet, sendFromChat } = useWalletStore();
  const { groups } = useGroupStore();
  const [tab, setTab] = useState<'myqr' | 'scan'>(initialTab);
  const [qrType, setQrType] = useState<QRType>('profile');
  const [copiedProfile, setCopiedProfile] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [scannedData, setScannedData] = useState<{ type: string; userId?: string; amount?: number; walletId?: string; groupId?: string } | null>(null);
  const [scannedUser, setScannedUser] = useState<ScannedUser | null>(null);
  const [friendAdded, setFriendAdded] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Auto-open camera when navigated with tab=scan
  useEffect(() => {
    if (initialTab === 'scan') {
      setShowCamera(true);
    }
  }, [initialTab]);

  const profileUrl = user ? buildGagaChatWebUrl(user.id) : '';
  const qrCodeUri = user ? buildGagaChatUri(user.id) : '';
  const walletId = user ? `GC-${user.id.slice(0, 8).toUpperCase()}` : '';

  const getQrData = () => {
    if (!user) return '';
    switch (qrType) {
      case 'profile': return JSON.stringify({ type: 'profile', userId: user.id, name: user.name });
      case 'transfer': return JSON.stringify({ type: 'transfer', walletId, userId: user.id, name: user.name });
      case 'group': return selectedGroup ? JSON.stringify({ type: 'group', groupId: selectedGroup }) : '';
      case 'wallet': return JSON.stringify({ type: 'wallet', walletId, userId: user.id });
      default: return qrCodeUri;
    }
  };

  const handleCopyProfile = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopiedProfile(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedProfile(false), 2000);
    } catch { toast.error('Failed to copy'); }
  };

  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(walletId);
      setCopiedWallet(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedWallet(false), 2000);
    } catch { toast.error('Failed to copy'); }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Add ${user?.name || 'me'} on GaGa Chat`,
          text: qrType === 'transfer' ? `Send money to ${user?.name}` : `Connect with me on GaGa Chat!`,
          url: qrType === 'profile' ? profileUrl : undefined,
        });
      } else {
        handleCopyProfile();
      }
    } catch { /* cancelled */ }
  };

  const parseQRData = useCallback(async (data: string) => {
    setScanning(true);
    try {
      let parsed: any = null;
      
      // Try JSON parse first (QR codes generated by our app are JSON)
      try {
        parsed = JSON.parse(data);
      } catch {
        // Not JSON, try other formats
      }

      if (parsed && (parsed.type === 'profile' || parsed.type === 'friend')) {
        const found = await getUserById(parsed.userId);
        if (found) {
          setScannedUser({ id: found.id, name: found.name, avatar: found.avatar, statusMessage: found.statusMessage, bio: found.bio });
        } else {
          setScannedUser({ id: parsed.userId, name: parsed.name || 'Unknown' });
        }
        setScannedData(parsed);
        setShowAddFriend(true);
      } else if (parsed && (parsed.type === 'transfer' || parsed.type === 'wallet')) {
        const found = parsed.userId ? await getUserById(parsed.userId) : null;
        if (found) setScannedUser({ id: found.id, name: found.name, avatar: found.avatar });
        setScannedData(parsed);
        setShowTransfer(true);
      } else if (parsed && parsed.type === 'group' && parsed.groupId) {
        navigate(`/group/${parsed.groupId}`);
        return;
      } else {
        // Fallback: try URL / URI parsing
        await handleFallbackScan(data);
      }
    } catch {
      await handleFallbackScan(data);
    } finally {
      setScanning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getUserById, navigate]);

  const handleFallbackScan = async (data: string) => {
    // Handle QR login URLs: https://oumagachat.web.app/qr-login?session=xxx
    const qrLoginMatch = data.match(/qr-login\?session=([a-zA-Z0-9_-]+)/);
    if (qrLoginMatch?.[1]) {
      const sessionId = qrLoginMatch[1];
      if (!user) {
        toast.error('Please log in first to confirm QR login');
        navigate('/auth');
        return;
      }
      try {
        if (isSupabaseConfigured()) {
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('qr_sessions').update({
              status: 'confirmed',
              user_id: user.id,
              updated_at: new Date().toISOString(),
            }).eq('session_id', sessionId);
            toast.success('QR login confirmed! Desktop session logged in.');
            navigate('/contacts');
            return;
          }
        }
        if (isSupabaseConfigured()) {
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('qr_sessions').update({
              status: 'confirmed',
              user_id: user.id,
              user_name: user.name,
              confirmed_at: new Date().toISOString(),
            }).eq('id', sessionId);
            toast.success('QR login confirmed! Desktop session logged in.');
            navigate('/contacts');
            return;
          }
        }
        if (isFirestoreAvailable()) {
          await updateDocById('qr_sessions', sessionId, {
            status: 'confirmed',
            userId: user.id,
            userName: user.name,
            confirmedAt: new Date().toISOString(),
          });
          toast.success('QR login confirmed! Desktop session logged in.');
          navigate('/contacts');
          return;
        }
      } catch {
        toast.error('Failed to confirm QR login. Session may have expired.');
      }
      return;
    }

    // Handle web URLs like https://oumagachat.web.app/add-friends?from=xxx or /profile/xxx
    const urlMatch = data.match(/(?:from=|profile\/)([^?&/\s]+)/);
    if (urlMatch?.[1]) {
      const userId = urlMatch[1];
      const found = await getUserById(userId);
      setScannedUser(found ? { id: found.id, name: found.name, avatar: found.avatar, statusMessage: found.statusMessage } : { id: userId, name: 'Unknown' });
      setScannedData({ type: 'friend', userId });
      setShowAddFriend(true);
      return;
    }

    // Handle wallet ID like GC-XXXX
    if (/^GC-[A-Z0-9]+$/i.test(data)) {
      setScannedData({ type: 'transfer', walletId: data });
      setShowTransfer(true);
      return;
    }

    // Handle gagachat:// URI scheme
    const gagachatMatch = data.match(/^gagachat:\/\/user\/(.+)$/) || data.match(/^gagachat:\/\/(.+)$/);
    if (gagachatMatch?.[1]) {
      const userId = gagachatMatch[1];
      const found = await getUserById(userId);
      setScannedUser(found ? { id: found.id, name: found.name, avatar: found.avatar } : { id: userId, name: 'Unknown' });
      setScannedData({ type: 'friend', userId });
      setShowAddFriend(true);
      return;
    }

    toast.error('Invalid QR code data. Could not recognize format.');
  };

  const handleScanFromCamera = (data: string) => {
    setShowCamera(false);
    parseQRData(data);
  };

  const handleAddFriend = async () => {
    if (!scannedData?.userId || !user?.id) return;
    try {
      // Check if already friends or request already sent/received
      const status = await getFriendStatus(user.id, scannedData.userId);
      if (status === 'friends') {
        toast.info('You are already friends!');
        setShowAddFriend(false);
        navigate(`/chat/${scannedData.userId}`);
        return;
      }
      if (status === 'request_sent') {
        toast.info('Friend request already sent');
        setFriendAdded(true);
        return;
      }
      if (status === 'request_received') {
        toast.info('They already sent you a request. Accept it from the requests tab.');
        setFriendAdded(true);
        return;
      }
      if (status === 'blocked') {
        toast.error('You have blocked this user. Unblock them first.');
        return;
      }
      if (status === 'self') {
        toast.info('This is your own QR code!');
        return;
      }

      await sendRequest(scannedData.userId, user.id);
      setFriendAdded(true);
      toast.success('Friend request sent');
      // Auto-navigate to chat after a short delay for faster connection
      setTimeout(() => {
        setShowAddFriend(false);
        navigate(`/chat/${scannedData.userId}`);
      }, 1500);
    } catch {
      toast.error('Failed to send friend request');
    }
  };

  const handleTransfer = async () => {
    if (!transferAmount || !user?.id) return;
    const amount = parseFloat(transferAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    const toUserId = scannedData?.userId;
    if (!toUserId) { toast.error('No recipient found'); return; }
    const chatId = 'dm_' + [user.id, toUserId].sort().join('_');
    const ok = await sendFromChat(user.id, user.name || 'User', chatId, toUserId, amount, 'GAGA', transferNote);
    if (ok) {
      toast.success(`Sent ${amount} GAGA coins!`);
      setShowTransfer(false);
      setTransferAmount('');
      setTransferNote('');
    } else {
      toast.error('Transfer failed. Check your balance.');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0d] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-white/10 rounded-full text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold">QR Code</h1>
        <div className="ml-auto flex bg-white/10 rounded-full p-0.5">
          {(['myqr', 'scan'] as const).map(t => (
            <button type="button" key={t}
              onClick={() => { setTab(t); setShowCamera(false); }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === t ? 'bg-[#00C300] text-white' : 'text-white/60'
              }`}
            >
              {t === 'myqr' ? 'My QR' : 'Scan'}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'myqr' ? (
          <motion.div
            key="myqr"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-6 pb-8"
          >
            {/* QR Type Selector */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
              {([
                { type: 'profile' as QRType, label: 'Profile', icon: UserPlus },
                { type: 'transfer' as QRType, label: 'Transfer', icon: Wallet },
                { type: 'group' as QRType, label: 'Group', icon: Users },
                { type: 'wallet' as QRType, label: 'Wallet', icon: Wallet },
              ]).map(({ type, label, icon: Icon }) => (
                <button type="button" key={type}
                  onClick={() => setQrType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    qrType === type ? 'bg-[#00C300] text-white' : 'bg-white/10 text-white/60'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>

            {/* QR Card */}
            <div className="bg-white rounded-3xl p-6 text-[#111111]">
              {/* Profile Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden">
                  {sanitizeMediaUrl(user?.avatar) ? (
                    <img src={sanitizeMediaUrl(user?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : (
                    <img src={getDefaultAvatar(user?.id || user?.name || 'user')} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                </div>
                <div>
                  <h2 className="font-bold text-lg">{user?.name || 'My Profile'}</h2>
                  <p className="text-[#8D8D8D] text-xs">
                    {qrType === 'profile' && 'Scan to add friend'}
                    {qrType === 'transfer' && 'Scan to send money'}
                    {qrType === 'group' && 'Scan to join group'}
                    {qrType === 'wallet' && 'Scan to view wallet'}
                  </p>
                </div>
              </div>

              {/* Group selector for group QR */}
              {qrType === 'group' && (
                <div className="mb-4">
                  <select
                    value={selectedGroup || ''}
                    onChange={e => setSelectedGroup(e.target.value || null)}
                    className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Select a group</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* QR Code */}
              <div className="w-56 h-56 mx-auto bg-[#F5F5F5] rounded-2xl flex items-center justify-center mb-6 relative overflow-hidden p-3">
                <div className="w-full h-full">
                  <QRCodeSVG data={getQrData()} size={200} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border-2 border-[#00C300] shadow-lg">
                    <Logo size={28} />
                  </div>
                </div>
              </div>

              {/* Wallet ID */}
              <div className="flex items-center justify-between bg-[#F5F5F5] rounded-xl px-4 py-3 mb-4">
                <div>
                  <p className="text-[#8D8D8D] text-[10px]">Wallet ID</p>
                  <p className="text-[#111111] font-mono text-sm font-bold">{walletId}</p>
                </div>
                <button type="button" onClick={handleCopyWallet} className="p-2 text-[#00C300]">
                  {copiedWallet ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>

              {/* Balance Preview */}
              <div className="flex justify-between text-center bg-[#F5F5F5] rounded-xl p-3 mb-4">
                <div>
                  <p className="text-[#00C300] font-bold">{(wallet?.coins || 0).toLocaleString()}</p>
                  <p className="text-[#8D8D8D] text-[10px]">GAGA</p>
                </div>
                <div>
                  <p className="text-[#2196F3] font-bold">${(wallet?.usdBalance || wallet?.bdtBalance || 0).toFixed(2)}</p>
                  <p className="text-[#8D8D8D] text-[10px]">USD</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button type="button" onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold active:bg-[#00A300] transition-colors"
                >
                  <Share2 size={16} /> Share
                </button>
                <button type="button" onClick={handleCopyProfile}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold active:bg-[#EBEBEB] transition-colors"
                >
                  <Copy size={16} /> {copiedProfile ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="mt-6 space-y-3">
              <p className="text-white/60 text-xs text-center">What others can do with your QR</p>
              {[
                { icon: UserPlus, text: 'Add you as a friend' },
                { icon: Wallet, text: 'Send you Gaga Coins or USD' },
                { icon: ScanLine, text: 'View your profile or join group' },
              ].map((tip, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl">
                  <tip.icon size={16} className="text-[#00C300]" />
                  <span className="text-white/80 text-sm">{tip.text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          /* Scan Tab */
          <motion.div
            key="scan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 pb-8"
          >
            {/* Camera Scanner */}
            {showCamera ? (
              <CameraQRScanner
                onScan={handleScanFromCamera}
                onClose={() => setShowCamera(false)}
              />
            ) : (
              <div className="text-center">
                {/* Start Camera Button */}
                <div className="w-64 h-64 mx-auto mb-6 relative">
                  <div className="absolute inset-0 border-2 border-[#00C300]/40 rounded-3xl" />
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#00C300] rounded-tl-2xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#00C300] rounded-tr-2xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#00C300] rounded-bl-2xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#00C300] rounded-br-2xl" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Camera size={40} className="text-white/40 mb-3" />
                    <button type="button" onClick={() => setShowCamera(true)}
                      className="px-6 py-3 bg-[#00C300] text-white rounded-full text-sm font-bold flex items-center gap-2 hover:bg-[#00A300] transition-colors"
                    >
                      <Camera size={16} /> Open Camera
                    </button>
                  </div>
                </div>

                <p className="text-white/60 text-sm mb-6">
                  Scan a GaGa Chat QR code to add friends, send money, or join groups
                </p>
              </div>
            )}

            {/* Manual Input */}
            {!showCamera && (
              <div className="bg-white/5 rounded-2xl p-4">
                <p className="text-white/60 text-xs mb-2">Or paste QR data manually:</p>
                <textarea
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  placeholder='{"type":"profile","userId":"..."} or paste any QR text'
                  className="w-full bg-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none h-20"
                />
                <button type="button" onClick={() => scanInput && parseQRData(scanInput)}
                  disabled={!scanInput || scanning}
                  className="w-full mt-3 bg-[#00C300] text-white rounded-xl py-3 text-sm font-bold disabled:opacity-30 active:bg-[#00A300] transition-colors flex items-center justify-center gap-2"
                >
                  {scanning ? <Loader size={16} className="animate-spin" /> : <ScanLine size={16} />}
                  {scanning ? 'Processing...' : 'Process QR Data'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Friend Dialog */}
      <Dialog open={showAddFriend} onOpenChange={setShowAddFriend}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-[#111111]">Add Friend</DialogTitle></DialogHeader>
          <div className="pt-4 text-center">
            {friendAdded ? (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="py-8">
                <div className="w-16 h-16 rounded-full bg-[#00C300]/10 flex items-center justify-center mx-auto mb-3">
                  <Check size={32} className="text-[#00C300]" />
                </div>
                <p className="text-[#00C300] font-bold text-lg">Friend Added!</p>
                <p className="text-[#8D8D8D] text-sm">Redirecting to chat...</p>
              </motion.div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mx-auto mb-3 overflow-hidden">
                  {sanitizeMediaUrl(scannedUser?.avatar) ? (
                    <img src={sanitizeMediaUrl(scannedUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : (
                    <img src={getDefaultAvatar(scannedUser?.id || scannedUser?.name || 'friend')} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                </div>
                <p className="text-[#111111] font-bold text-lg">{scannedUser?.name || 'New Friend'}</p>
                {scannedUser?.statusMessage && (
                  <p className="text-[#8D8D8D] text-sm mt-1">{scannedUser.statusMessage}</p>
                )}
                {scannedUser?.bio && (
                  <p className="text-[#8D8D8D] text-xs mt-1 line-clamp-2">{scannedUser.bio}</p>
                )}
                <p className="text-[#8D8D8D] text-sm mt-2">Add this person to your friends?</p>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => setShowAddFriend(false)} className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold">
                    Cancel
                  </button>
                  <button type="button" onClick={handleAddFriend} className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold active:bg-[#00A300]">
                    Add Friend
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-[#111111]">Send Money</DialogTitle></DialogHeader>
          <div className="pt-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden">
                {sanitizeMediaUrl(scannedUser?.avatar) ? (
                  <img src={sanitizeMediaUrl(scannedUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                ) : (
                  <img src={getDefaultAvatar(scannedUser?.id || scannedUser?.name || 'friend')} className="w-full h-full object-cover" alt="User avatar" />
                )}
              </div>
              <div>
                <p className="text-[#111111] text-sm font-medium">{scannedUser?.name || 'Recipient'}</p>
                <p className="text-[#8D8D8D] text-[10px] font-mono">{scannedData?.walletId || scannedData?.userId?.slice(0, 12)}...</p>
              </div>
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Amount</label>
              <input
                type="number"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Note (optional)</label>
              <input
                value={transferNote}
                onChange={e => setTransferNote(e.target.value)}
                placeholder="What's this for?"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowTransfer(false)} className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold">
                Cancel
              </button>
              <button type="button" onClick={handleTransfer} className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold active:bg-[#00A300]">
                Send
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
