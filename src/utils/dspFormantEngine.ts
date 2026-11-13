import type { DspTimbre, VoiceSettings } from '../types/synth';

interface FormantTarget {
  f1: number;
  f2: number;
  f3: number;
  voiced: boolean;
  voiceLevel: number;
  noiseLevel: number;
  noiseFreq: number;
  durationSec: number;
  pitchMul: number;
}

const VOWEL_FORMANTS: Record<string, [number, number, number]> = {
  a: [730, 1140, 2460],
  á: [760, 1180, 2480],
  à: [730, 1140, 2460],
  â: [590, 1180, 2440],
  ã: [620, 1140, 2320],
  e: [510, 1840, 2500],
  é: [580, 1920, 2540],
  ê: [410, 2020, 2580],
  i: [290, 2240, 2880],
  í: [290, 2280, 2900],
  o: [540, 860, 2380],
  ó: [600, 910, 2420],
  ô: [430, 780, 2340],
  õ: [470, 820, 2280],
  u: [315, 860, 2240],
  ú: [315, 860, 2240],
  y: [290, 2240, 2880],
};

function isVowel(ch: string): boolean {
  return !!VOWEL_FORMANTS[ch];
}

function buildPortugueseFormantSequence(text: string, rate: number): FormantTarget[] {
  const clean = text
    .replace(/\[pausa\s+(\d+)\s*ms\]/gi, ' ... ')
    .replace(/\s+/g, ' ')
    .trim();
  const durScale = 1 / Math.max(0.45, Math.min(2.3, rate));
  const seq: FormantTarget[] = [];
  const lower = clean.toLowerCase();

  let i = 0;
  while (i < lower.length) {
    const ch = lower[i];
    const next = lower[i + 1] || '';
    const prev = i > 0 ? lower[i - 1] : ' ';
    const two = ch + next;

    // Punctuation & spaces
    if ('.!?'.includes(ch)) {
      seq.push({
        f1: 350,
        f2: 1100,
        f3: 2200,
        voiced: false,
        voiceLevel: 0,
        noiseLevel: 0,
        noiseFreq: 1800,
        durationSec: 0.22 * durScale,
        pitchMul: 0.88,
      });
      i += 1;
      continue;
    }
    if (',;:'.includes(ch)) {
      seq.push({
        f1: 350,
        f2: 1100,
        f3: 2200,
        voiced: false,
        voiceLevel: 0,
        noiseLevel: 0,
        noiseFreq: 1800,
        durationSec: 0.13 * durScale,
        pitchMul: 0.94,
      });
      i += 1;
      continue;
    }
    if (ch === ' ' || ch === '\n') {
      seq.push({
        f1: 350,
        f2: 1100,
        f3: 2200,
        voiced: false,
        voiceLevel: 0,
        noiseLevel: 0,
        noiseFreq: 1800,
        durationSec: 0.042 * durScale,
        pitchMul: 1.0,
      });
      i += 1;
      continue;
    }

    // Silent 'h' at start or after vowel
    if (ch === 'h' && prev !== 'c' && prev !== 'l' && prev !== 'n') {
      i += 1;
      continue;
    }

    // Portuguese digraphs
    if (two === 'nh') {
      seq.push({ f1: 290, f2: 1980, f3: 2650, voiced: true, voiceLevel: 0.62, noiseLevel: 0.02, noiseFreq: 2000, durationSec: 0.068 * durScale, pitchMul: 0.99 });
      i += 2;
      continue;
    }
    if (two === 'lh') {
      seq.push({ f1: 310, f2: 1920, f3: 2600, voiced: true, voiceLevel: 0.68, noiseLevel: 0.02, noiseFreq: 2000, durationSec: 0.064 * durScale, pitchMul: 1.0 });
      i += 2;
      continue;
    }
    if (two === 'ch') {
      seq.push({ f1: 500, f2: 2100, f3: 3200, voiced: false, voiceLevel: 0, noiseLevel: 0.24, noiseFreq: 2700, durationSec: 0.072 * durScale, pitchMul: 1.02 });
      i += 2;
      continue;
    }
    if (two === 'qu' || two === 'gu') {
      const voiced = ch === 'g';
      seq.push({ f1: 320, f2: 1150, f3: 2300, voiced: false, voiceLevel: 0, noiseLevel: 0, noiseFreq: 1500, durationSec: 0.024 * durScale, pitchMul: 1.0 });
      seq.push({ f1: 340, f2: 1220, f3: 2350, voiced, voiceLevel: voiced ? 0.55 : 0.08, noiseLevel: voiced ? 0.06 : 0.16, noiseFreq: 1650, durationSec: 0.036 * durScale, pitchMul: voiced ? 0.96 : 1.03 });
      i += 2;
      continue;
    }
    if (two === 'rr') {
      seq.push({ f1: 520, f2: 1320, f3: 2300, voiced: false, voiceLevel: 0.18, noiseLevel: 0.16, noiseFreq: 1350, durationSec: 0.068 * durScale, pitchMul: 0.98 });
      i += 2;
      continue;
    }
    if (two === 'ss') {
      seq.push({ f1: 680, f2: 2450, f3: 4100, voiced: false, voiceLevel: 0, noiseLevel: 0.24, noiseFreq: 4200, durationSec: 0.07 * durScale, pitchMul: 1.02 });
      i += 2;
      continue;
    }

    // Vowels (with Brazilian Portuguese final vowel reduction)
    if (VOWEL_FORMANTS[ch]) {
      let vowelKey = ch;
      const atWordEnd = !next || ' .,!?;:'.includes(next);
      if (atWordEnd && ch === 'o') vowelKey = 'u';
      if (atWordEnd && ch === 'e') vowelKey = 'i';

      const [f1, f2, f3] = VOWEL_FORMANTS[vowelKey];
      const isNasalNext = (next === 'm' || next === 'n') && (!lower[i + 2] || !isVowel(lower[i + 2]));
      seq.push({
        f1: isNasalNext ? Math.max(280, f1 * 0.92) : f1,
        f2,
        f3: isNasalNext ? f3 * 0.95 : f3,
        voiced: true,
        voiceLevel: 0.88,
        noiseLevel: 0.015,
        noiseFreq: 2400,
        durationSec: (isNasalNext ? 0.11 : 0.092) * durScale,
        pitchMul: 1.0,
      });
      if (isNasalNext) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    // Contextual consonants
    if (ch === 's') {
      const intervocalic = isVowel(prev) && isVowel(next);
      seq.push({
        f1: 620,
        f2: 2400,
        f3: 4000,
        voiced: intervocalic,
        voiceLevel: intervocalic ? 0.45 : 0,
        noiseLevel: intervocalic ? 0.14 : 0.22,
        noiseFreq: intervocalic ? 3600 : 4200,
        durationSec: 0.062 * durScale,
        pitchMul: 1.01,
      });
      i += 1;
      continue;
    }

    if (ch === 'z' || ch === 'ç' || ch === 'x' || (ch === 'c' && 'eiéêií'.includes(next))) {
      const voiced = ch === 'z';
      const shLike = ch === 'x';
      seq.push({
        f1: 600,
        f2: shLike ? 2100 : 2500,
        f3: 3900,
        voiced,
        voiceLevel: voiced ? 0.46 : 0,
        noiseLevel: voiced ? 0.14 : 0.23,
        noiseFreq: shLike ? 2800 : 4100,
        durationSec: 0.064 * durScale,
        pitchMul: voiced ? 0.99 : 1.02,
      });
      i += 1;
      continue;
    }

    if (ch === 'j' || (ch === 'g' && 'eiéêií'.includes(next))) {
      seq.push({
        f1: 440,
        f2: 2050,
        f3: 3100,
        voiced: true,
        voiceLevel: 0.48,
        noiseLevel: 0.16,
        noiseFreq: 2700,
        durationSec: 0.062 * durScale,
        pitchMul: 0.99,
      });
      i += 1;
      continue;
    }

    if ('fv'.includes(ch)) {
      const voiced = ch === 'v';
      seq.push({
        f1: 380,
        f2: 1450,
        f3: 2450,
        voiced,
        voiceLevel: voiced ? 0.52 : 0,
        noiseLevel: voiced ? 0.11 : 0.18,
        noiseFreq: 2200,
        durationSec: 0.058 * durScale,
        pitchMul: 0.98,
      });
      i += 1;
      continue;
    }

    if ('mn'.includes(ch)) {
      seq.push({
        f1: 280,
        f2: ch === 'm' ? 1050 : 1480,
        f3: 2250,
        voiced: true,
        voiceLevel: 0.64,
        noiseLevel: 0.01,
        noiseFreq: 1800,
        durationSec: 0.056 * durScale,
        pitchMul: 0.98,
      });
      i += 1;
      continue;
    }

    if (ch === 'r') {
      const strongR = prev === ' ' || 'lnrs'.includes(prev);
      seq.push({
        f1: strongR ? 510 : 420,
        f2: 1360,
        f3: 2280,
        voiced: !strongR,
        voiceLevel: strongR ? 0.22 : 0.62,
        noiseLevel: strongR ? 0.15 : 0.02,
        noiseFreq: 1400,
        durationSec: (strongR ? 0.06 : 0.04) * durScale,
        pitchMul: 0.98,
      });
      i += 1;
      continue;
    }

    if (ch === 'l') {
      const codaL = !next || !isVowel(next);
      seq.push({
        f1: codaL ? 330 : 360,
        f2: codaL ? 840 : 1280,
        f3: 2350,
        voiced: true,
        voiceLevel: 0.72,
        noiseLevel: 0.01,
        noiseFreq: 1800,
        durationSec: 0.055 * durScale,
        pitchMul: 0.99,
      });
      i += 1;
      continue;
    }

    // Stops / Plosives: brief closure gap + crisp release burst for clear syllable separation
    if ('pbtkdgqc'.includes(ch)) {
      const voiced = 'bdg'.includes(ch);
      const f2Place = 'td'.includes(ch) ? 1750 : 'pb'.includes(ch) ? 980 : 1450;
      // Closure gap
      seq.push({
        f1: 300,
        f2: f2Place,
        f3: 2250,
        voiced,
        voiceLevel: voiced ? 0.22 : 0,
        noiseLevel: 0,
        noiseFreq: 1600,
        durationSec: 0.024 * durScale,
        pitchMul: voiced ? 0.95 : 1.0,
      });
      // Release burst
      seq.push({
        f1: 380,
        f2: f2Place,
        f3: 2380,
        voiced,
        voiceLevel: voiced ? 0.56 : 0.06,
        noiseLevel: voiced ? 0.08 : 0.16,
        noiseFreq: 'td'.includes(ch) ? 3100 : 'pb'.includes(ch) ? 1100 : 1850,
        durationSec: 0.028 * durScale,
        pitchMul: voiced ? 0.98 : 1.04,
      });
      i += 1;
      continue;
    }

    seq.push({
      f1: 450,
      f2: 1350,
      f3: 2350,
      voiced: true,
      voiceLevel: 0.65,
      noiseLevel: 0.02,
      noiseFreq: 2000,
      durationSec: 0.045 * durScale,
      pitchMul: 1.0,
    });
    i += 1;
  }

  return seq;
}

/**
 * Generates a warm Liljencrants-Fant inspired glottal pulse PeriodicWave
 * with steep harmonic rolloff (-12 dB/oct) instead of harsh buzzing sawtooth harmonics.
 */
function createGlottalPeriodicWave(ctx: BaseAudioContext): PeriodicWave {
  const harmonics = 28;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  real[0] = 0;
  imag[0] = 0;
  for (let n = 1; n <= harmonics; n++) {
    // Glottal spectrum decay eliminates 8-bit buzz while keeping formant energy up to 3.5 kHz
    const amp = 1 / Math.pow(n, 1.38);
    real[n] = amp * 0.25;
    imag[n] = -amp;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function timbreModifiers(timbre: DspTimbre) {
  switch (timbre) {
    case 'robot':
      return { freqScale: 0.92, useRawOsc: true, oscType: 'square' as OscillatorType, qScale: 1.4, detuneCents: 14, noiseMix: 0.05, filterHighpass: 140, filterLowpass: 3300 };
    case 'radio':
      return { freqScale: 1.05, useRawOsc: false, oscType: 'sawtooth' as OscillatorType, qScale: 1.2, detuneCents: 3, noiseMix: 0.08, filterHighpass: 420, filterLowpass: 2450 };
    case 'deep':
      return { freqScale: 0.74, useRawOsc: false, oscType: 'sawtooth' as OscillatorType, qScale: 0.9, detuneCents: 5, noiseMix: 0.03, filterHighpass: 75, filterLowpass: 3100 };
    case 'whisper':
      return { freqScale: 1.0, useRawOsc: false, oscType: 'triangle' as OscillatorType, qScale: 1.05, detuneCents: 0, noiseMix: 0.68, filterHighpass: 320, filterLowpass: 4200 };
    case 'choir':
      return { freqScale: 1.1, useRawOsc: false, oscType: 'sawtooth' as OscillatorType, qScale: 1.0, detuneCents: 18, noiseMix: 0.03, filterHighpass: 100, filterLowpass: 4000 };
    case 'megaphone':
      return { freqScale: 1.08, useRawOsc: false, oscType: 'sawtooth' as OscillatorType, qScale: 1.45, detuneCents: 5, noiseMix: 0.08, filterHighpass: 560, filterLowpass: 2250 };
    case 'cyborg':
      return { freqScale: 0.88, useRawOsc: true, oscType: 'square' as OscillatorType, qScale: 1.55, detuneCents: 26, noiseMix: 0.07, filterHighpass: 180, filterLowpass: 3100 };
    case 'natural':
    default:
      return { freqScale: 1.0, useRawOsc: false, oscType: 'sawtooth' as OscillatorType, qScale: 0.85, detuneCents: 3.5, noiseMix: 0.03, filterHighpass: 90, filterLowpass: 3600 };
  }
}

export async function renderDspSpeechBuffer(
  text: string,
  settings: VoiceSettings
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const sequence = buildPortugueseFormantSequence(text, settings.rate);
  const totalSec = Math.max(
    0.45,
    sequence.reduce((acc, item) => acc + item.durationSec, 0) + (settings.dspEcho > 0.02 ? 0.35 : 0.14)
  );
  const cappedSec = Math.min(45, totalSec);
  const frameCount = Math.floor(cappedSec * sampleRate);

  const offlineCtx = new OfflineAudioContext(1, frameCount, sampleRate);
  const mod = timbreModifiers(settings.dspTimbre);
  const baseFreq = settings.dspBaseFreq * settings.pitch * mod.freqScale;

  // Noise source shaped by consonant frequency
  const noiseBuffer = offlineCtx.createBuffer(1, frameCount, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const osc1 = offlineCtx.createOscillator();
  const osc2 = offlineCtx.createOscillator();
  if (mod.useRawOsc) {
    osc1.type = mod.oscType;
    osc2.type = mod.oscType;
  } else {
    const glottalWave = createGlottalPeriodicWave(offlineCtx);
    osc1.setPeriodicWave(glottalWave);
    osc2.type = 'triangle';
  }
  osc1.frequency.value = baseFreq;
  osc2.frequency.value = baseFreq;
  osc2.detune.value = mod.detuneCents;

  // Gentle vibrato LFO
  const lfo = offlineCtx.createOscillator();
  lfo.frequency.value = 5.1;
  const lfoGain = offlineCtx.createGain();
  lfoGain.gain.value = baseFreq * 0.028 * settings.dspVibrato;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  const osc1Gain = offlineCtx.createGain();
  osc1Gain.gain.value = settings.dspTimbre === 'whisper' ? 0.08 : 0.65;
  const osc2Gain = offlineCtx.createGain();
  osc2Gain.gain.value = settings.dspTimbre === 'whisper' ? 0.04 : 0.25;

  const oscMix = offlineCtx.createGain();
  oscMix.gain.value = 1.0;
  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);
  osc1Gain.connect(oscMix);
  osc2Gain.connect(oscMix);

  const noiseSource = offlineCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  const noiseBand = offlineCtx.createBiquadFilter();
  noiseBand.type = 'bandpass';
  noiseBand.Q.value = 2.2;
  noiseBand.frequency.value = 2600;
  const noiseGain = offlineCtx.createGain();
  noiseGain.gain.value = 0;
  noiseSource.connect(noiseBand);
  noiseBand.connect(noiseGain);

  const voiceGain = offlineCtx.createGain();
  voiceGain.gain.value = 0;

  // 3 parallel vocal tract formant filters with balanced Q
  const f1 = offlineCtx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 5.2 * mod.qScale;
  f1.frequency.value = 500;

  const f2 = offlineCtx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 6.8 * mod.qScale;
  f2.frequency.value = 1500;

  const f3 = offlineCtx.createBiquadFilter();
  f3.type = 'bandpass';
  f3.Q.value = 8.4 * mod.qScale;
  f3.frequency.value = 2500;

  const f1Gain = offlineCtx.createGain();
  f1Gain.gain.value = 1.1;
  const f2Gain = offlineCtx.createGain();
  f2Gain.gain.value = 0.72;
  const f3Gain = offlineCtx.createGain();
  f3Gain.gain.value = 0.28;

  oscMix.connect(voiceGain);
  voiceGain.connect(f1);
  voiceGain.connect(f2);
  voiceGain.connect(f3);

  const formantSum = offlineCtx.createGain();
  formantSum.gain.value = 1.65;
  f1.connect(f1Gain);
  f2.connect(f2Gain);
  f3.connect(f3Gain);
  f1Gain.connect(formantSum);
  f2Gain.connect(formantSum);
  f3Gain.connect(formantSum);

  // Mix shaped fricative consonant noise directly with formants for crisp consonants
  noiseGain.connect(formantSum);

  const hp = offlineCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = mod.filterHighpass;

  const lp = offlineCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = mod.filterLowpass;

  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.12;

  formantSum.connect(hp);
  hp.connect(lp);
  lp.connect(compressor);

  const master = offlineCtx.createGain();
  master.gain.value = Math.min(1, Math.max(0.1, settings.volume)) * 0.92;
  compressor.connect(master);

  if (settings.dspEcho > 0.02) {
    const delay = offlineCtx.createDelay(0.5);
    delay.delayTime.value = 0.13;
    const fb = offlineCtx.createGain();
    fb.gain.value = Math.min(0.38, settings.dspEcho * 0.45);
    const wet = offlineCtx.createGain();
    wet.gain.value = settings.dspEcho * 0.45;
    compressor.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);
  }

  master.connect(offlineCtx.destination);

  // Schedule articulated phoneme envelopes
  let t = 0.02;
  const totalItems = sequence.length || 1;
  for (let i = 0; i < sequence.length; i++) {
    if (t >= cappedSec - 0.05) break;
    const item = sequence[i];
    const dur = item.durationSec;
    const progress = i / totalItems;
    const prosodyContour = 1.07 - progress * 0.15 + Math.sin(progress * Math.PI * 2.5) * 0.03;

    f1.frequency.setTargetAtTime(item.f1, t, 0.011);
    f2.frequency.setTargetAtTime(item.f2, t, 0.011);
    f3.frequency.setTargetAtTime(item.f3, t, 0.011);
    noiseBand.frequency.setTargetAtTime(item.noiseFreq, t, 0.008);

    const f0 = Math.max(60, Math.min(480, baseFreq * item.pitchMul * prosodyContour));
    osc1.frequency.setTargetAtTime(f0, t, 0.014);
    osc2.frequency.setTargetAtTime(f0, t, 0.014);

    if (item.voiced && item.voiceLevel > 0) {
      voiceGain.gain.setTargetAtTime(item.voiceLevel, t, 0.007);
      voiceGain.gain.setTargetAtTime(item.voiceLevel * 0.45, t + dur * 0.84, 0.01);
    } else {
      voiceGain.gain.setTargetAtTime(0.0, t, 0.006);
    }

    const nVol = Math.max(item.noiseLevel, item.voiced ? mod.noiseMix * 0.3 : item.noiseLevel);
    noiseGain.gain.setTargetAtTime(nVol, t, 0.006);
    noiseGain.gain.setTargetAtTime(0.0, t + dur * 0.85, 0.008);

    t += dur;
  }

  voiceGain.gain.setTargetAtTime(0, t, 0.015);
  noiseGain.gain.setTargetAtTime(0, t, 0.015);

  osc1.start(0);
  osc2.start(0);
  lfo.start(0);
  noiseSource.start(0);

  return offlineCtx.startRendering();
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const samples = buffer.getChannelData(0);
  const dataLength = samples.length * numChannels * (bitDepth / 8);
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
