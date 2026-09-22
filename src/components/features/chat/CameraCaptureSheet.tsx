import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, SwitchCamera, Zap, ZapOff, Check, RotateCcw, Camera as CameraIcon } from 'lucide-react';
import { toast } from 'sonner';

export interface CameraCaptureSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the captured photo as a File. */
  onCapture: (file: File) => void;
}

/**
 * Full-screen in-app camera. Uses getUserMedia so the user can take a photo
 * without leaving the app, switch between front/rear cameras, toggle the torch
 * (where supported), then review and retake before sending.
 *
 * Design-system rule (E1): ONE primary GaGa accent (green) for the shutter and
 * confirm actions.
 */
export function CameraCaptureSheet({ open, onClose, onCapture }: CameraCaptureSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setTorchAvailable(false);
    setTorchOn(false);
  }, []);

  const startStream = useCallback(
    async (mode: 'user' | 'environment') => {
      stopStream();
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchAvailable(!!caps.torch);
        setReady(true);
      } catch {
        setError('Camera unavailable. Check permissions and try again.');
      }
    },
    [stopStream],
  );

  // Start/stop the stream as the sheet opens/closes.
  useEffect(() => {
    if (open && !shot) {
      void startStream(facing);
    } else if (!open) {
      stopStream();
      setShot(null);
    }
    return () => {
      if (!open) stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  // Ensure the stream is released on unmount.
  useEffect(() => () => stopStream(), [stopStream]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((v) => !v);
    } catch {
      toast.error('Torch not supported on this camera.');
    }
  }, [torchOn]);

  const switchCamera = useCallback(() => {
    setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      // Mirror the front camera so the capture matches the preview.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    );
    if (!blob) {
      toast.error('Failed to capture photo.');
      return;
    }
    setShot({ url: URL.createObjectURL(blob), blob });
  }, [facing]);

  const retake = useCallback(() => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    void startStream(facing);
  }, [shot, facing, startStream]);

  const confirm = useCallback(() => {
    if (!shot) return;
    const file = new File([shot.blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    URL.revokeObjectURL(shot.url);
    setShot(null);
    onClose();
  }, [shot, onCapture, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black z-[60] flex flex-col"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close camera"
              className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-90 transition-transform"
            >
              <X size={20} />
            </button>
            {torchAvailable && !shot && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label="Toggle torch"
                className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
                  torchOn ? 'bg-[#00C300] text-white' : 'bg-white/10 text-white'
                }`}
              >
                {torchOn ? <Zap size={20} /> : <ZapOff size={20} />}
              </button>
            )}
          </div>

          {/* Viewfinder / preview */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {error ? (
              <div className="text-center px-8">
                <CameraIcon size={40} className="text-white/40 mx-auto mb-3" />
                <p className="text-white/80 text-sm">{error}</p>
              </div>
            ) : shot ? (
              <img src={shot.url} alt="Captured" className="w-full h-full object-contain" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
              />
            )}
          </div>

          {/* Controls */}
          <div className="px-6 pt-4 pb-[max(env(safe-area-inset-bottom),20px)] flex items-center justify-center gap-10">
            {shot ? (
              <>
                <button
                  type="button"
                  onClick={retake}
                  className="flex flex-col items-center gap-1 text-white/80 active:scale-95 transition-transform"
                >
                  <span className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                    <RotateCcw size={22} />
                  </span>
                  <span className="text-[11px]">Retake</span>
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                >
                  <span className="w-16 h-16 rounded-full bg-[#00C300] flex items-center justify-center shadow-lg">
                    <Check size={26} strokeWidth={2.5} />
                  </span>
                  <span className="text-[11px] font-medium">Use photo</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={switchCamera}
                  aria-label="Switch camera"
                  className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-90 transition-transform"
                >
                  <SwitchCamera size={22} />
                </button>
                <button
                  type="button"
                  onClick={capture}
                  disabled={!ready}
                  aria-label="Capture photo"
                  className="w-[72px] h-[72px] rounded-full bg-white border-4 border-white/40 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
                >
                  <span className="w-[58px] h-[58px] rounded-full bg-[#00C300]" />
                </button>
                <span className="w-12 h-12" />
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CameraCaptureSheet;
