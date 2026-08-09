import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface RecordingWaveformProps {
  /** Current recording duration in seconds. */
  duration: number;
  /** Color of the bars. */
  barColor?: string;
  /** Number of bars to render. */
  bars?: number;
}

/**
 * Animated live waveform shown while the microphone is recording.
 * Bars bounce with randomized stagger to give the "live recording" feel,
 * without requiring an actual audio analyser node.
 */
export function RecordingWaveform(props: RecordingWaveformProps) {
  const { duration, barColor = '#00C300', bars = 28 } = props;

  const heights = useMemo(
    () => Array.from({ length: bars }, (_, i) => 0.25 + ((i * 37) % 61) / 100),
    [bars],
  );

  // Slightly speed up the bounce as the recording gets longer.
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
}
