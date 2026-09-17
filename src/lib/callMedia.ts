/**
 * Call media hand-off.
 *
 * The call store verifies microphone/camera access *before* it creates or
 * accepts an invitation, so the user gets a clear permission error instead of a
 * silently ringing call. The WebRTC engine then needs the very same tracks.
 *
 * Acquiring media twice in quick succession is a real problem on mobile
 * browsers: iOS Safari can throw `NotReadableError` when a second
 * `getUserMedia` runs while the first stream is still being torn down, and the
 * camera indicator flashes twice. This module lets the permission check hand
 * the already-acquired stream to the engine instead of re-requesting it.
 *
 * Only one prepared stream can exist at a time (one active call per client).
 */

interface PreparedStream {
  callId: string;
  video: boolean;
  stream: MediaStream;
}

let prepared: PreparedStream | null = null;

/** Media constraints shared by the permission check and the WebRTC engine. */
export function callMediaConstraints(video: boolean): MediaStreamConstraints {
  return {
    audio: { echoCancellation: true, noiseSuppression: true },
    video: video
      ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 30 } }
      : false,
  };
}

/** Stops and forgets the prepared stream. Pass a callId to only release that call. */
export function releasePreparedStream(callId?: string): void {
  if (!prepared) return;
  if (callId && prepared.callId !== callId) return;
  try {
    prepared.stream.getTracks().forEach((track) => track.stop());
  } catch {
    /* tracks may already be ended */
  }
  prepared = null;
}

/**
 * Takes ownership of the prepared stream for `callId`.
 * Returns null when nothing suitable is prepared, so the caller can fall back
 * to a fresh `getUserMedia`.
 */
export function takePreparedStream(callId: string, video: boolean): MediaStream | null {
  if (!prepared || prepared.callId !== callId || prepared.video !== video) return null;
  const stream = prepared.stream;
  prepared = null;
  return stream;
}

/**
 * Acquires and retains a stream for `callId`. Any previously prepared stream is
 * released first so a retry never leaks a camera/microphone.
 */
export async function prepareCallStream(callId: string, video: boolean): Promise<MediaStream> {
  releasePreparedStream();
  const stream = await navigator.mediaDevices.getUserMedia(callMediaConstraints(video));
  prepared = { callId, video, stream };
  return stream;
}

/** Test/diagnostic helper — true when a stream is currently held. */
export function hasPreparedStream(): boolean {
  return prepared !== null;
}
