import { memo, useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

interface RecordingWaveformProps {
  duration: number;
  barColor?: string;
  bars?: number;
}

export const RecordingWaveform = memo(function RecordingWaveform(props: RecordingWaveformProps) {
  const { duration, barColor = '#00C300', bars = 28 } = props;
  const [tick, setTick] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setTick((prev) => (prev + 1) % 1000000);
    }, 120);
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, []);

  const heights = useMemo<number[]>(() => {
    const out: number[] = new Array(bars);
    for (let i = 0; i < bars; i += 1) {
      const seed = i + tick * 13 + duration * 7;
      const pseudo = ((Math.sin(seed + i * 0.9) * 0.5) + 1) / 2;
      const vary = 0.3 + pseudo * 0.55;
      const center = bars / 2;
      const distance = Math.abs(i - center) / center;
      const envelope = 1 - distance * 0.45;
      out[i] = Math.max(0.18, vary * envelope);
    }
    return out;
  }, [bars, tick, duration]);

  const bounceDuration = Math.max(0.35, 0.6 - duration * 0.004);

  return (
    <div className="flex items-end gap-[2px] h-8 flex-1" aria-hidden="true">
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-full"
          style={{ backgroundColor: barColor }}
          animate={{
            height: [`${h * 100}%`, `${Math.max(0.15, h * 0.35) * 100}%`, `${h * 100}%`],
          }}
          transition={{
            duration: bounceDuration,
            delay: (i % 7) * 0.08,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
});

RecordingWaveform.displayName = 'RecordingWaveform';
