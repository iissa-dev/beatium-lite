/**
 * Calculates Root Mean Square (RMS) energy of an audio buffer (Float32Array).
 *
 * @param buffer - Audio PCM samples in Float32Array (typically from AnalyserNode.getFloatTimeDomainData)
 * @returns Root Mean Square energy value (>= 0), or 0 if buffer is empty or null.
 */
export function calculateRms(buffer: Float32Array | null | undefined): number {
  if (!buffer || buffer.length === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i];
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / buffer.length);
}

