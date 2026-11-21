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

export interface WaveformPeaks {
  rawPeaks: number[];
  denoisedPeaks: number[];
}

/**
 * Computes waveform peaks and applies adaptive noise floor subtraction (15th percentile RMS + Crest Factor).
 *
 * @param data - Full audio PCM buffer
 * @param numBuckets - Number of discrete peak buckets to generate (default 120)
 * @returns Object with rawPeaks and denoisedPeaks normalized arrays
 */
export function computeWaveformPeaks(
  data: Float32Array,
  numBuckets = 120
): WaveformPeaks {
  if (!data || data.length === 0) {
    return {
      rawPeaks: Array(numBuckets).fill(0),
      denoisedPeaks: Array(numBuckets).fill(0),
    };
  }

  const bucketSize = Math.max(1, Math.floor(data.length / numBuckets));
  const bucketMax: number[] = [];
  const bucketRms: number[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, data.length);
    let max = 0;
    let sumSq = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(data[j]);
      if (val > max) max = val;
      sumSq += val * val;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    bucketMax.push(max);
    bucketRms.push(rms);
  }

  // تقدير أرضية الإزعاج (Adaptive Noise Floor Estimation عبر 15th percentile)
  const sortedRms = [...bucketRms].sort((a, b) => a - b);
  const noiseFloorIndex = Math.min(sortedRms.length - 1, Math.floor(sortedRms.length * 0.15));
  const noiseFloorRms = sortedRms[noiseFloorIndex] || 0.005;

  const rawPeaks: number[] = [];
  const denoisedPeaks: number[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const max = bucketMax[i];
    const rms = bucketRms[i];

    rawPeaks.push(+max.toFixed(3));

    // التمييز بين الكلام البشري والضوضاء المستمرة عبر طاقة الإشارة والـ Crest Factor
    const energyRatio = noiseFloorRms > 0.001 ? rms / noiseFloorRms : rms / 0.01;
    const crestFactor = rms > 0.001 ? max / rms : 0;
    const isSpeech =
      (energyRatio > 1.6 && rms > 0.012) || (crestFactor > 2.8 && rms > noiseFloorRms * 1.25);

    if (isSpeech) {
      const denoisedVal = Math.max(0.04, max - noiseFloorRms * 0.9);
      denoisedPeaks.push(+denoisedVal.toFixed(3));
    } else {
      const residual = Math.min(0.015, max * 0.03);
      denoisedPeaks.push(+residual.toFixed(3));
    }
  }

  return { rawPeaks, denoisedPeaks };
}
