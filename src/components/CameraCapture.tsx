import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, SwitchCamera, Circle, Square, Check } from 'lucide-react';
import { toast } from 'sonner';

interface CameraCaptureProps {
  onCapture: (blob: Blob, type: 'photo' | 'video') => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState('');
  const [error, setError] = useState('');

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setIsReady(true);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.name === 'NotAllowedError' ? 'Camera access denied. Please allow camera permissions.' : 'Could not access camera.');
      toast.error('Camera access failed');
    }
  }, [facingMode, mode]);

  const cameraStarted = useRef(false);
  const capturedUrlRef = useRef('');
  useEffect(() => { capturedUrlRef.current = capturedUrl; }, [capturedUrl]);

  useEffect(() => {
    if (cameraStarted.current) return;
    cameraStarted.current = true;
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !isReady) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mirror if front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
      }
    }, 'image/jpeg', 0.92);
  }, [isReady, facingMode]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp9,opus' });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setCapturedBlob(blob);
      setCapturedUrl(URL.createObjectURL(blob));
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    recorder.start(1000);
    setIsRecording(true);
    setRecordDuration(0);
    timerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const toggleFacingMode = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  const handleConfirm = useCallback(() => {
    if (capturedBlob) {
      onCapture(capturedBlob, mode);
      onClose();
    }
  }, [capturedBlob, mode, onCapture, onClose]);

  const handleRetake = useCallback(() => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedBlob(null);
    setCapturedUrl('');
    setRecordDuration(0);
  }, [capturedUrl]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
    >
      {/* Preview / Camera feed */}
      <div className="relative flex-1 overflow-hidden">
        {capturedUrl ? (
          mode === 'photo' ? (
            <img src={capturedUrl} alt="Captured" className="w-full h-full object-cover" />
          ) : (
            <video src={capturedUrl} className="w-full h-full object-cover" controls autoPlay />
          )
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6">
            <div className="text-center">
              <Camera size={48} className="text-white/50 mx-auto mb-3" />
              <p className="text-white text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
          <button type="button" onClick={onClose} className="p-2 rounded-full bg-black/40 text-white">
            <X size={24} />
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode(prev => prev === 'photo' ? 'video' : 'photo')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${mode === 'video' ? 'bg-[#FF3B30] text-white' : 'bg-black/40 text-white'}`}
            >
              {mode === 'photo' ? 'Photo' : 'Video'}
            </button>
            <button type="button" onClick={toggleFacingMode} className="p-2 rounded-full bg-black/40 text-white">
              <SwitchCamera size={20} />
            </button>
          </div>
        </div>

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#FF3B30]/90 px-3 py-1 rounded-full"
            >
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-xs font-medium">{formatDuration(recordDuration)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 p-6 pb-10 flex items-center justify-center gap-8 bg-black/80 backdrop-blur-sm">
        {capturedUrl ? (
          <>
            <button type="button" onClick={handleRetake} className="p-3 rounded-full bg-white/20 text-white">
              <X size={24} />
            </button>
            <button type="button" onClick={handleConfirm} className="p-3 rounded-full bg-[#00C300] text-black">
              <Check size={28} />
            </button>
          </>
        ) : mode === 'photo' ? (
          <button
            type="button"
            onClick={takePhoto}
            disabled={!isReady}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
          >
            <div className="w-16 h-16 rounded-full bg-white" />
          </button>
        ) : (
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isReady}
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 ${isRecording ? 'border-[#FF3B30]' : 'border-white'}`}
          >
            {isRecording ? (
              <Square size={28} className="text-[#FF3B30]" fill="#FF3B30" />
            ) : (
              <Circle size={28} className="text-[#FF3B30]" fill="#FF3B30" />
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
