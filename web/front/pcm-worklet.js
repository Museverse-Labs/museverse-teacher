












const ZEROS = 8;            
const RES = 64;             

class PcmFrames extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.outRate = o.targetRate || 24000;
    this.frameLen = Math.max(1, Math.round((this.outRate * (o.frameMs || 80)) / 1000));
    this.ratio = sampleRate / this.outRate;                  
    const fc = 0.5 * Math.min(1, 1 / this.ratio) * 0.92;     
    this.half = ZEROS / (2 * fc);                            
    this.reach = Math.ceil(this.half);
    
    this.kern = new Float32Array(Math.ceil(this.half * RES) + 2);
    for (let i = 0; i < this.kern.length; i++) {
      const d = i / RES;
      if (d >= this.half) break;
      const x = 2 * fc * d;
      this.kern[i] = (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * 0.5 * (1 + Math.cos((Math.PI * d) / this.half));
    }
    
    this.x = new Float32Array(Math.max(8192, 4 * this.reach + 1024));
    this.len = this.reach;
    this.t = this.reach;                                     
    this.frame = new Int16Array(this.frameLen);
    this.n = 0;
    this.sum2 = 0;
    this.stopped = false;
    this.port.onmessage = (e) => { if (e.data && e.data.type === 'stop') this.stopped = true; };
  }

  emit(v) {
    v = v > 1 ? 1 : v < -1 ? -1 : v;
    this.sum2 += v * v;
    this.frame[this.n++] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
    if (this.n < this.frameLen) return;
    const pcm = this.frame.buffer;
    this.port.postMessage({ pcm, rms: Math.sqrt(this.sum2 / this.frameLen) }, [pcm]);
    this.frame = new Int16Array(this.frameLen);
    this.n = 0;
    this.sum2 = 0;
  }

  process(inputs) {
    if (this.stopped) return false;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;                                    
    if (this.len + ch.length > this.x.length) {              
      const bigger = new Float32Array(2 * (this.len + ch.length));
      bigger.set(this.x.subarray(0, this.len));
      this.x = bigger;
    }
    this.x.set(ch, this.len);
    this.len += ch.length;
    const x = this.x, kern = this.kern, half = this.half, reach = this.reach;
    while (Math.floor(this.t) + reach < this.len) {
      const t = this.t, c = Math.floor(t);
      let acc = 0, wsum = 0;
      for (let k = c - reach + 1; k <= c + reach; k++) {
        const d = t > k ? t - k : k - t;
        if (d >= half) continue;
        const w = kern[Math.round(d * RES)];
        acc += w * x[k];
        wsum += w;
      }
      this.emit(wsum ? acc / wsum : 0);                      
      this.t += this.ratio;
    }
    
    const drop = Math.floor(this.t) - reach;
    if (drop > 0) {
      x.copyWithin(0, drop, this.len);
      this.len -= drop;
      this.t -= drop;
    }
    return true;
  }
}

registerProcessor('mv-pcm-frames', PcmFrames);
