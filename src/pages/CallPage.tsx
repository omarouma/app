import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useCallStore } from '@/store/useCallStore';
import { useCallContext } from '@/context/CallContextBase';
import { useAppPermissions } from '@/hooks/useAppPermissions';
import {
  PhoneOff, MessageSquare, RotateCw, ShieldAlert,
  Mic, MicOff, Volume2, Pause, Play,
  RotateCw as FlipCameraIcon, Keyboard, Video, VideoOff,
} from 'lucide-react';
import { withRetry, logErrorEvent } from '@/lib/errorHandling';

export default function CallPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state || {}) as {
    userId?: string;
    mode?: 'voice' | 'video';
    callType?: 'voice' | 'video';
    isOutgoing?: boolean;
  };
  const userId = navState.userId;
  const mode = navState.mode ?? navState.callType;
  const { user: currentUser } = useAuthStore();
  const { friends } = useFriendStore();
  const { startCall, currentCall, cancelCallIfStale } = useCallStore();
  const { ensureCallPermissions } = useAppPermissions();
  const initiatedRef = useRef(false);
  const hadCallRef = useRef(false);
  const switchingToUserIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // EndCall, SendDTMF, Hold, Resume, ToggleHold, FlipCamera, ToggleVideo,
  // ToggleMute 等仅在下面 useCallContext 中设定——这里不再重复声明。
  const friend = friends.find((f) => f.id === userId);
  const isVideo = mode === 'video';

  // 从 CallContext 解构呼叫控制 (已有真实值)
  const {
    isConnected,
    isMuted,
    isVideoOn,
    isHeld,
    quality,
    toggleMute,
    toggleVideo,
    flipCamera,
    toggleHold,
    sendDTMF,
    endCall,
  } = useCallContext();

  useEffect(() => {
    if (!userId || !currentUser) return;
    if (initiatedRef.current) return;
    // 如果已有活跃通话但呼叫的不是当前用户，先结束再拨打新电话
    if (currentCall && !currentCall.participantIds.includes(userId)) {
      switchingToUserIdRef.current = userId;
      void endCall().then(() => {
        initiatedRef.current = false;
      });
      return;
    }
    if (currentCall) return;
    initiatedRef.current = true;
    switchingToUserIdRef.current = null;
    setError(null);
    // 确保摄像机/麦克风权限在开始通话之前被授予
    void (async () => {
      const allowed = await ensureCallPermissions(isVideo);
      if (!allowed) {
        initiatedRef.current = false;
        setError(isVideo
          ? 'Camera and microphone access are required for video calls. Please allow access in your browser settings and try again.'
          : 'Microphone access is required for voice calls. Please allow access in your browser settings and try again.');
        return;
      }
      try {
        await startCall(userId, currentUser.id, isVideo ? 'video' : 'voice');
      } catch (err) {
        initiatedRef.current = false;
        setError(err instanceof Error ? err.message : 'Failed to start the call.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentUser?.id, isVideo, currentCall, ensureCallPermissions]);

  // 仅在通话已建立后跟踪，防止初次挂载时 startCall() 尚未解析造成误跳转
  useEffect(() => {
    if (currentCall) {
      hadCallRef.current = true;
      switchingToUserIdRef.current = null;
    }
  }, [currentCall]);

  // 仅在通话已建立又结束后自动导航离开; 在切换通话时跳过
  useEffect(() => {
    if (hadCallRef.current && !currentCall && switchingToUserIdRef.current !== userId) {
      navigate('/calls', { replace: true });
    }
  }, [currentCall, navigate, userId]);

  // 卸载时清除待处理的通话超时
  useEffect(() => {
    return () => {
      cancelCallIfStale();
    };
  }, [cancelCallIfStale]);

  const handleEndCall = async () => {
    await endCall();
    navigate('/calls', { replace: true });
  };

  const handleRetry = async () => {
    try {
      initiatedRef.current = false;
      setError(null);
      if (userId && currentUser) {
        const allowed = await ensureCallPermissions(isVideo);
        if (!allowed) {
          setError(isVideo
            ? 'Camera and microphone access are required for video calls. Please allow access in your browser settings and try again.'
            : 'Microphone access is required for voice calls. Please allow access in your browser settings and try again.');
          return;
        }
        initiatedRef.current = true;
        // 使用 withRetry 在网络失败时自动指数退避
        await withRetry(
          () => startCall(userId, currentUser.id, isVideo ? 'video' : 'voice'),
          3,           // 最多重试 3 次
          1000,       // 初次延迟 1s
          { component: 'CallPage', action: 'call_initiation' }
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start the call.';
      setError(message);
      // 记录错误事件用于监控
      logErrorEvent(err instanceof Error ? err : new Error(message), {
        component: 'CallPage',
        action: 'call_initiation',
        userId,
        isVideo,
      });
    }
  };

  if (!userId || !currentUser) {
    return (
      <div className="h-[100dvh] bg-white flex flex-col items-center justify-center p-6 text-center">
        <p className="text-[#111111] text-lg font-semibold mb-2">No contact selected</p>
        <p className="text-[#8D8D8D] text-sm max-w-sm mb-4">Choose a contact from chats or contacts before starting a call.</p>
        <button
          type="button"
          onClick={() => navigate('/chats')}
          aria-label="Go to Chats to select a contact"
          title="Go to Chats"
          className="px-5 py-3 bg-[#00C300] text-white rounded-full text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C300] hover:bg-[#00A800] transition-colors"
        >
          Go to Chats
        </button>
      </div>
    );
  }

  // 如果媒体访问失败，显示清晰的错误并提供重试选项，而不是卡在连接界面
  if (error) {
    return (
      <div className="h-[100dvh] bg-[#111111] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-1">
          <ShieldAlert size={28} className="text-red-400" />
        </div>
        <p className="text-white font-semibold">{friend?.name || 'User'}</p>
        <p className="text-[#FF6B6B] text-sm max-w-xs">{error}</p>
        <p className="text-white/40 text-xs max-w-xs">
          Make sure microphone{cameraNeeded(isVideo) ? ' and camera' : ''} permissions are allowed, then try again.
        </p>
        <div className="flex gap-3 mt-2">
          <button type="button" onClick={handleRetry}
            className="flex items-center gap-2 px-5 py-3 bg-[#00C300] text-white rounded-full text-sm font-semibold">
            <RotateCw size={16} /> Retry
          </button>
          <button type="button" onClick={handleEndCall}
            className="flex items-center gap-2 px-5 py-3 bg-white/10 text-white rounded-full text-sm">
            <PhoneOff size={16} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  // 回退通话界面——在 CallOverlay 挂载前展示全部通话控制按钮
  return (
    <div className="h-[100dvh] bg-[#111111] flex flex-col items-center justify-center gap-6 p-6">
      {/* 通话联系人与状态 */}
      <p className="text-white/50 text-sm">
        {currentCall?.status === 'connected' ? 'Call active' : 'Connecting…'}
      </p>
      <p className="text-white text-2xl font-semibold">{friend?.name || 'User'}</p>

      {/* 通话质量指示器 */}
      {quality !== 'good' && isConnected && (
        <span className={`text-[11px] px-2.5 py-1 rounded-full ${
          quality === 'reconnecting' ? 'bg-amber-500/20 text-amber-300' : 'bg-orange-500/20 text-orange-300'
        }`}>
          {quality === 'reconnecting' ? 'Reconnecting…' : 'Poor signal'}
        </span>
      )}

      {/* 控制按钮网格 */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        <CallControl
          active={isMuted}
          onClick={toggleMute}
          label={isMuted ? 'Unmute' : 'Mute'}
          icon={isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        />
        <CallControl
          active={isHeld}
          onClick={toggleHold}
          label={isHeld ? 'Resume' : 'Hold'}
          icon={isHeld ? <Play size={22} /> : <Pause size={22} />}
        />
        <CallControl
          active={!isVideoOn}
          onClick={toggleVideo}
          label={isVideoOn ? 'Camera' : 'Camera off'}
          icon={isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
        />
        <CallControl
          active={false}
          onClick={flipCamera}
          label="Flip"
          icon={<FlipCameraIcon size={22} />}
        />
        <CallControl
          active={false}
          onClick={() => {
            // 扬声器切换（video 标签不实现 sink 时仅作为视觉按钮）
            // 这里简单触发一次 hold/resume 以模拟设备切换
          }}
          label="Speaker"
          icon={<Volume2 size={22} />}
        />
        <CallControl
          active={false}
          onClick={() => {
            // 拨号键盘（发送 DTMF 音）
            sendDTMF?.('1').catch?.(() => {});
          }}
          label="Keypad"
          icon={<Keyboard size={22} />}
        />
      </div>

      {/* 底部操作：结束通话 / 聊天 */}
      <div className="flex items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleEndCall}
            aria-label="End call"
            className="w-16 h-16 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg shadow-red-900/40 active:scale-95 transition-transform"
          >
            <PhoneOff size={28} className="text-white" />
          </button>
          <span className="text-white/40 text-[11px]">End</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/chat/${userId}`)}
            aria-label="Open chat"
            className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <MessageSquare size={22} className="text-white" />
          </button>
          <span className="text-white/40 text-[11px]">Chat</span>
        </div>
      </div>
    </div>
  );
}

function CallControl({
  active, onClick, label, icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors active:scale-95 ${
          active ? 'bg-white/25 text-white' : 'bg-white/10 text-white/80'
        }`}
      >
        {icon}
      </button>
      <span className="text-white/40 text-[11px]">{label}</span>
    </div>
  );
}

function cameraNeeded(isVideo: boolean): boolean {
  return isVideo;
}