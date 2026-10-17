// Mic capture → 16 kHz mono WAV (a format Sarvam STT documents), and TTS
// playback through an analyser so the character's mouth follows the audio.

const TARGET_RATE = 16000;
const MAX_SECONDS = 29; // Sarvam REST STT limit is 30 s

function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function downsample(input: Float32Array, from: number): Float32Array {
  if (from === TARGET_RATE) return input;
  const ratio = from / TARGET_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export class Recorder {
  level = 0;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: ScriptProcessorNode;
  private chunks: Float32Array[] = [];
  private startedAt = 0;
  private lastVoiceAt = 0;
  private spoke = false;
  onAutoStop?: () => void;
  /** Hands-free mode: fired after the user speaks and then pauses. */
  onSilence?: () => void;
  /** Hands-free mode: fired if nobody says anything for a while. */
  onNoSpeech?: () => void;

  async start() {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      this.level = Math.min(1, rms(data) * 6);
      const now = performance.now();
      if (this.level > 0.12) {
        this.spoke = true;
        this.lastVoiceAt = now;
      }
      if (this.spoke && now - this.lastVoiceAt > 1300) this.onSilence?.();
      if (!this.spoke && now - this.startedAt > 10_000) this.onNoSpeech?.();
      if (performance.now() - this.startedAt > MAX_SECONDS * 1000)
        this.onAutoStop?.();
    };
    source.connect(this.node);
    this.node.connect(this.ctx.destination);
    this.startedAt = performance.now();
    this.spoke = false;
  }

  /** Returns the WAV and its duration in seconds. */
  async stop(): Promise<{ wav: Blob; seconds: number }> {
    this.node?.disconnect();
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    const rate = this.ctx?.sampleRate ?? 48000;
    await this.ctx?.close();
    this.level = 0;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) {
      merged.set(c, off);
      off += c.length;
    }
    const samples = downsample(merged, rate);
    return {
      wav: encodeWav(samples, TARGET_RATE),
      seconds: samples.length / TARGET_RATE,
    };
  }
}

export class Player {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private src?: AudioBufferSourceNode;
  private data = new Uint8Array(512);

  /** Call from a user gesture so later playback isn't blocked by autoplay rules. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  async play(base64Wav: string): Promise<void> {
    this.unlock();
    this.stop();
    const ctx = this.ctx as AudioContext;
    const bytes = Uint8Array.from(atob(base64Wav), (c) => c.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser as AnalyserNode);
    this.src = src;
    return new Promise((resolve) => {
      src.onended = () => {
        if (this.src === src) this.src = undefined;
        resolve();
      };
      src.start();
    });
  }

  stop() {
    try {
      this.src?.stop();
    } catch {}
    this.src = undefined;
  }

  get playing() {
    return Boolean(this.src);
  }

  level(): number {
    if (!this.analyser || !this.src) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let s = 0;
    for (const x of this.data) {
      const d = (x - 128) / 128;
      s += d * d;
    }
    return Math.min(1, Math.sqrt(s / this.data.length) * 5);
  }
}
