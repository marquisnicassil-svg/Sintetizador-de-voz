import type { DspTimbre, VoiceSettings } from '../types/synth';

interface FormantTarget {
  f1: number;
  f2: number;
  f3: number;
  voiced: boolean;
  noiseLevel: number;
  durationSec: number;
  pitchMul: number;
}

const VOWEL_FORMANTS: Record<string, [number, number, number]> = {
  a: [730, 1090, 2440],
  á: [750, 1120, 2460],
  à: [730, 1090, 2440],
  â: [580, 1150, 2450],
  ã: [660, 1120, 2380],
  e: [530, 1840, 2480],
  é: [580, 1900, 2520],
  ê: [420, 2000, 2580],
  i: [280, 2250, 2890],
  í: [280, 2280, 2920],
  o: [570, 840, 2410],
  ó: [610, 890, 2430],
  ô: [440, 780, 2360],
  õ: [500, 820, 2320],
  u: [310, 870, 2240],
  ú: [310, 870, 2240],
  y: [280, 2250, 2890],
};

function charToFormant(ch: string, nextCh: string, rate: number): FormantTarget {
  const lower = ch.toLowerCase();
  const durScale = 1 / Math.max(0.4, Math.min(2.4, rate));

  if (VOWEL_FORMANTS[lower]) {
    const [f1, f2, f3] = VOWEL_FORMANTS[lower];
    return {
      f1,
      f2,
      f3,
      voiced: true,
      noiseLevel: 0.02,
      durationSec: 0.095 * durScale,
      pitchMul: 1.0,
    };
  }

  // Sibilants & fricatives
  if ('szxç'.includes(lower) || (lower === 'c' && 'eiéêií'.includes(nextCh.toLowerCase()))) {
    return {
      f1: 900,
      f2: 2600,
      f3: 4200,
      voiced: lower === 'z',
      noiseLevel: 0.45,
      durationSec: 0.068 * durScale,
      pitchMul: 1.02,
    };
  }

  if ('fv'.includes(lower)) {
    return {
      f1: 420,
      f2: 1400,
      f3: 2500,
      voiced: lower === 'v',
      noiseLevel: 0.3,
      durationSec: 0.06 * durScale,
      pitchMul: 0.99,
    };
  }

  // Nasals & liquids
  if ('mnrl'.includes(lower)) {
    return {
      f1: 320,
      f2: 1250,
      f3: 2300,
      voiced: true,
      noiseLevel: 0.04,
      durationSec: 0.058 * durScale,
      pitchMul: 0.98,
    };
  }

  // Plosives
  if ('pbtkdgqc'.includes(lower)) {
    const voiced = 'bdg'.includes(lower);
    return {
      f1: 350,
      f2: 1450,
      f3: 2400,
      voiced,
      noiseLevel: voiced ? 0.14 : 0.25,
      durationSec: 0.045 * durScale,
      pitchMul: voiced ? 0.96 : 1.03,
    };
  }

  // Punctuation pauses
  if ('.!?'.includes(ch)) {
    return { f1: 300, f2: 1000, f3: 2200, voiced: false, noiseLevel: 0, durationSec: 0.24 * durScale, pitchMul: 0.9 };
  }
  if (',;:'.includes(ch)) {
    return { f1: 300, f2: 1000, f3: 2200, voiced: false, noiseLevel: 0, durationSec: 0.14 * durScale, pitchMul: 0.95 };
  }
  if (ch === ' ' || ch === '\n') {
    return { f1: 300, f2: 1000, f3: 2200, voiced: false, noiseLevel: 0, durationSec: 0.05 * durScale, pitchMul: 1.0 };
  }

  return { f1: 450, f2: 1350, f3: 2400, voiced: true, noiseLevel: 0.05, durationSec: 0.045 * durScale, pitchMul: 1.0 };
}

function buildFormantSequence(text: string, rate: number): FormantTarget[] {
  const clean = text.replace(/\[pausa\s+(\d+)\s*ms\]/gi, ' ... ').trim();
  const sequence: FormantTarget[] = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const nextCh = clean[i + 1] || '';
    sequence.push(charToFormant(ch, nextCh, rate));
  }
  return sequence;
}

function timbreModifiers(timbre: DspTimbre) {
  switch (timbre) {
    case 'robot':
      return { freqScale: 0.92, oscType: 'square' as OscillatorType, qScale: 1.5, detuneCents: 16, noiseMix: 0.08, filterHighpass: 130, filterLowpass: 3600 };
    case 'radio':
      return { freqScale: 1.06, oscType: 'sawtooth' as OscillatorType, qScale: 1.25, detuneCents: 4, noiseMix: 0.12, filterHighpass: 420, filterLowpass: 2500 };
    case 'deep':
      return { freqScale: 0.72, oscType: 'sawtooth' as OscillatorType, qScale: 0.9, detuneCents: 6, noiseMix: 0.04, filterHighpass: 75, filterLowpass: 3400 };
    case 'whisper':
      return { freqScale: 1.0, oscType: 'triangle' as OscillatorType, qScale: 1.05, detuneCents: 0, noiseMix: 0.75, filterHighpass: 320, filterLowpass: 4400 };
    case 'choir':
      return { freqScale: 1.12, oscType: 'sawtooth' as OscillatorType, qScale: 1.05, detuneCents: 20, noiseMix: 0.04, filterHighpass: 100, filterLowpass: 4600 };
    case 'megaphone':
      return { freqScale: 1.1, oscType: 'sawtooth' as OscillatorType, qScale: 1.6, detuneCents: 6, noiseMix: 0.12, filterHighpass: 580, filterLowpass: 2300 };
    case 'cyborg':
      return { freqScale: 0.88, oscType: 'square' as OscillatorType, qScale: 1.7, detuneCents: 30, noiseMix: 0.1, filterHighpass: 180, filterLowpass: 3400 };
    case 'natural':
    default:
      return { freqScale: 1.0, oscType: 'sawtooth' as OscillatorType, qScale: 0.88, detuneCents: 4, noiseMix: 0.04, filterHighpass: 85, filterLowpass: 4500 };
  }
}

export async function renderDspSpeechBuffer(
  text: string,
  settings: VoiceSettings
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const sequence = buildFormantSequence(text, settings.rate);
  const totalSec = Math.max(
    0.4,
    sequence.reduce((acc, item) => acc + item.durationSec, 0) + (settings.dspEcho > 0 ? 0.35 : 0.12)
  );
  // Cap offline render at 45 seconds to stay responsive on low-RAM Android devices
  const cappedSec = Math.min(45, totalSec);
  const frameCount = Math.floor(cappedSec * sampleRate);

  const offlineCtx = new OfflineAudioContext(1, frameCount, sampleRate);
  const mod = timbreModifiers(settings.dspTimbre);
  const baseFreq = settings.dspBaseFreq * settings.pitch * mod.freqScale;

  // White noise buffer for consonants/whisper
  const noiseBuffer = offlineCtx.createBuffer(1, frameCount, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const osc1 = offlineCtx.createOscillator();
  osc1.type = mod.oscType;
  osc1.frequency.value = baseFreq;

  // Sub-warmth triangle layer gives glottal body so voices sound fuller on phone speakers
  const osc2 = offlineCtx.createOscillator();
  osc2.type = settings.dspTimbre === 'robot' || settings.dspTimbre === 'cyborg' ? mod.oscType : 'triangle';
  osc2.frequency.value = baseFreq;
  osc2.detune.value = mod.detuneCents;

  // Vibrato LFO
  const lfo = offlineCtx.createOscillator();
  lfo.frequency.value = 5.2;
  const lfoGain = offlineCtx.createGain();
  lfoGain.gain.value = baseFreq * 0.038 * settings.dspVibrato;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  const oscMix = offlineCtx.createGain();
  oscMix.gain.value = settings.dspTimbre === 'whisper' ? 0.09 : 0.48;
  osc1.connect(oscMix);
  osc2.connect(oscMix);

  const noiseSource = offlineCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  const noiseGain = offlineCtx.createGain();
  noiseGain.gain.value = 0;
  noiseSource.connect(noiseGain);

  const voiceGain = offlineCtx.createGain();
  voiceGain.gain.value = 0;

  // 3 parallel vocal tract formant filters
  const f1 = offlineCtx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 5.8 * mod.qScale;
  f1.frequency.value = 500;

  const f2 = offlineCtx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 7.6 * mod.qScale;
  f2.frequency.value = 1500;

  const f3 = offlineCtx.createBiquadFilter();
  f3.type = 'bandpass';
  f3.Q.value = 9.5 * mod.qScale;
  f3.frequency.value = 2500;

  const f1Gain = offlineCtx.createGain();
  f1Gain.gain.value = 1.05;
  const f2Gain = offlineCtx.createGain();
  f2Gain.gain.value = 0.68;
  const f3Gain = offlineCtx.createGain();
  f3Gain.gain.value = 0.34;

  oscMix.connect(voiceGain);
  voiceGain.connect(f1);
  voiceGain.connect(f2);
  voiceGain.connect(f3);
  noiseGain.connect(f1);
  noiseGain.connect(f2);
  noiseGain.connect(f3);

  const formantSum = offlineCtx.createGain();
  formantSum.gain.value = 1.75;
  f1.connect(f1Gain);
  f2.connect(f2Gain);
  f3.connect(f3Gain);
  f1Gain.connect(formantSum);
  f2Gain.connect(formantSum);
  f3Gain.connect(formantSum);

  // Shaping filters (e.g. radio band limit)
  const hp = offlineCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = mod.filterHighpass;

  const lp = offlineCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = mod.filterLowpass;

  formantSum.connect(hp);
  hp.connect(lp);

  // Master + optional Echo
  const master = offlineCtx.createGain();
  master.gain.value = Math.min(1, Math.max(0.08, settings.volume)) * 0.92;
  lp.connect(master);

  if (settings.dspEcho > 0.02) {
    const delay = offlineCtx.createDelay(0.5);
    delay.delayTime.value = 0.14;
    const fb = offlineCtx.createGain();
    fb.gain.value = Math.min(0.45, settings.dspEcho * 0.5);
    const wet = offlineCtx.createGain();
    wet.gain.value = settings.dspEcho * 0.55;
    lp.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);
  }

  master.connect(offlineCtx.destination);

  // Schedule phoneme envelopes
  let t = 0.02;
  const totalItems = sequence.length || 1;
  for (let i = 0; i < sequence.length; i++) {
    if (t >= cappedSec - 0.05) break;
    const item = sequence[i];
    const dur = item.durationSec;
    const progress = i / totalItems;
    // Natural prosody declination curve
    const prosodyContour = 1.06 - progress * 0.14 + Math.sin(progress * Math.PI * 3) * 0.03;

    const targetF1 = item.f1;
    const targetF2 = item.f2;
    const targetF3 = item.f3;

    f1.frequency.setTargetAtTime(targetF1, t, 0.012);
    f2.frequency.setTargetAtTime(targetF2, t, 0.012);
    f3.frequency.setTargetAtTime(targetF3, t, 0.012);

    const f0 = Math.max(55, Math.min(520, baseFreq * item.pitchMul * prosodyContour));
    osc1.frequency.setTargetAtTime(f0, t, 0.014);
    osc2.frequency.setTargetAtTime(f0, t, 0.014);

    if (item.voiced) {
      voiceGain.gain.setTargetAtTime(0.8, t, 0.008);
      voiceGain.gain.setTargetAtTime(0.25, t + dur * 0.82, 0.012);
    } else {
      voiceGain.gain.setTargetAtTime(0.0, t, 0.008);
    }

    const nVol = Math.max(item.noiseLevel, item.voiced ? mod.noiseMix * 0.45 : item.noiseLevel);
    noiseGain.gain.setTargetAtTime(nVol, t, 0.008);
    noiseGain.gain.setTargetAtTime(0.0, t + dur * 0.85, 0.01);

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
