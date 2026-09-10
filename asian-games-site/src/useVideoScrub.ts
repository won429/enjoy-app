import { useEffect, useRef, useState } from 'react';
import * as MP4Box from 'mp4box';

const LERP_TAU = 8;
const SNAP = 0.002;
const LRU_MAX = 24;
const LEAD = 24;
const WATCHDOG = 60000;
type BankFrame = { ts:number; blob:Blob };
const clamp = (value:number) => Math.max(0, Math.min(1,value));

export function nearestIndex(bank:BankFrame[], seconds:number) {
  const ts = seconds * 1e6;
  let low = 0, high = bank.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (bank[mid].ts < ts) low = mid + 1;
    else high = mid;
  }
  return low > 0 && Math.abs(bank[low - 1].ts - ts) <= Math.abs(bank[low].ts - ts) ? low - 1 : low;
}

export function useVideoScrub(videoSrc:string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrollProgress,setScrollProgress] = useState(0);
  const [canvasLive,setCanvasLive] = useState(false);

  useEffect(() => {
    const video = videoRef.current, canvas = canvasRef.current, container = containerRef.current;
    if (!video || !canvas || !container) return;
    const ctx = canvas.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let bank:BankFrame[] = [];
    const lru = new Map<number,ImageBitmap|null>();
    let current = 0, target = 0, dur = 0;
    let ready = false, reverted = false, painted = false, building = false;
    let stopped = false, span = 1, raf = 0, lastTime = performance.now(), lastDrawn = -1;
    let lastProgress = -1, watchdog:ReturnType<typeof setTimeout>|undefined;
    let decoder:VideoDecoder|undefined;
    let mp4:MP4Box.MP4File|undefined;
    const abort = new AbortController();
    const clearLRU = () => { lru.forEach(bitmap => bitmap?.close()); lru.clear(); };
    const dimensions = () => { span = Math.max(1,container.offsetHeight - window.innerHeight); };
    const metadata = () => { if (Number.isFinite(video.duration)) dur = video.duration; };
    const fallback = () => {
      reverted = true; ready = false; building = false;
      abort.abort(); mp4?.stop();
      if (decoder && decoder.state !== 'closed') decoder.close();
      bank = []; clearLRU(); painted = false;
      if (!stopped) setCanvasLive(false);
    };
    const warm = (index:number) => {
      for (let i = Math.max(0,index - 1); i <= Math.min(bank.length - 1,index + 2); i++) {
        if (lru.has(i)) continue;
        lru.set(i,null);
        const blob = bank[i].blob;
        createImageBitmap(blob).then(bitmap => {
          if (stopped || reverted || !lru.has(i)) { bitmap.close(); return; }
          lru.set(i,bitmap);
        }).catch(() => { if (!stopped && !reverted) fallback(); });
      }
      while (lru.size > LRU_MAX) {
        const first = lru.keys().next().value!;
        lru.get(first)?.close(); lru.delete(first);
      }
    };
    const draw = () => {
      if (!ctx || !bank.length) return;
      const i = nearestIndex(bank,current);
      const bitmap = lru.get(i);
      if (bitmap) { lru.delete(i); lru.set(i,bitmap); }
      warm(i);
      if (!bitmap || i === lastDrawn) return;
      const scale = Math.max(canvas.width / bitmap.width,canvas.height / bitmap.height);
      const width = bitmap.width * scale, height = bitmap.height * scale;
      ctx.drawImage(bitmap,(canvas.width - width)/2,(canvas.height - height)/2,width,height);
      lastDrawn = i;
      if (!painted) { painted = true; setCanvasLive(true); }
    };
    const tick = (time:number) => {
      if (stopped) return;
      const dt = Math.min(0.1,Math.max(0,(time-lastTime)/1000)); lastTime = time;
      const p = clamp(window.scrollY / span);
      if (p !== lastProgress) { lastProgress = p; setScrollProgress(p); }
      if (dur > 0) {
        target = p * dur;
        if (reduced.matches) current = target;
        else {
          current += (target-current) * (1-Math.exp(-dt*LERP_TAU));
          if (Math.abs(target-current)<SNAP) current = target;
        }
        if (ready) draw();
        else if (video.readyState >= 1 && !video.seeking && Math.abs(video.currentTime-current)>0.01) {
          try { video.currentTime = current; } catch { /* metadata may change during a seek */ }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    async function parse(buffer:ArrayBuffer) {
      return new Promise<{track:MP4Box.Track;samples:MP4Box.Sample[];description?:Uint8Array}>((resolve,reject) => {
        mp4 = MP4Box.createFile();
        let track:MP4Box.Track|undefined;
        const samples:MP4Box.Sample[] = [];
        let description:Uint8Array|undefined;
        const canceled = () => reject(new Error('Frame bank canceled'));
        abort.signal.addEventListener('abort',canceled,{once:true});
        mp4.onError = reject;
        mp4.onReady = info => {
          try {
            track = info.videoTracks[0];
            if (!track || !track.nb_samples) throw new Error('No video samples');
            const entry = mp4!.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0];
            const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
            if (box) {
              const stream = new MP4Box.DataStream(undefined,0,MP4Box.DataStream.BIG_ENDIAN);
              box.write(stream); description = new Uint8Array(stream.buffer.slice(8,stream.position));
            }
            mp4!.setExtractionOptions(track.id,null,{nbSamples:LEAD}); mp4!.start();
          } catch (error) { reject(error); }
        };
        mp4.onSamples = (_id,_user,batch) => {
          samples.push(...batch);
          if (track && samples.length >= track.nb_samples) {
            abort.signal.removeEventListener('abort',canceled);
            resolve({track,samples,description});
          }
        };
        const input = buffer as ArrayBuffer & {fileStart:number}; input.fileStart = 0;
        try { mp4.appendBuffer(input); mp4.flush(); } catch(error) { reject(error); }
      });
    }
    async function decodeSamples(track:MP4Box.Track,samples:MP4Box.Sample[],description:Uint8Array|undefined,software:boolean) {
      const output:BankFrame[] = [];
      let failed:unknown = null, outstanding = 0, valid = true;
      let encodings:Promise<void> = Promise.resolve();
      const surface = document.createElement('canvas');
      surface.width = track.video.width; surface.height = track.video.height;
      const context = surface.getContext('2d');
      if (!context) throw new Error('No frame canvas');
      const config:VideoDecoderConfig = {
        codec:track.codec,codedWidth:track.video.width,codedHeight:track.video.height,
        hardwareAcceleration:software?'prefer-software':'prefer-hardware',
        ...(description ? {description} : {})
      };
      const supported = await VideoDecoder.isConfigSupported(config);
      if (!supported.supported || stopped || reverted) throw new Error('Unsupported decoder');
      const activeDecoder = new VideoDecoder({
        error:error=>{failed=error;},
        output:frame=>{
          encodings = encodings.then(async()=>{
            try {
              if (!valid || stopped || reverted || failed) return;
              context.drawImage(frame,0,0,surface.width,surface.height);
              const ts = frame.timestamp;
              const blob = await new Promise<Blob>((resolve,reject)=>surface.toBlob(value=>value?resolve(value):reject(new Error('Frame encoding failed')),'image/webp',0.82));
              if (valid && !stopped && !reverted) output.push({ts,blob});
            } catch(error) {failed=error;}
            finally {frame.close();outstanding--;}
          });
        }
      });
      decoder = activeDecoder;
      try {
        activeDecoder.configure(config);
        for (const sample of samples) {
          while (outstanding >= LEAD && !failed && !stopped && !reverted) await new Promise(resolve=>setTimeout(resolve,4));
          if (failed || stopped || reverted) throw failed || new Error('Frame bank canceled');
          outstanding++;
          activeDecoder.decode(new EncodedVideoChunk({type:sample.is_sync?'key':'delta',timestamp:Math.round(sample.cts * 1e6/sample.timescale),duration:Math.round(sample.duration * 1e6/sample.timescale),data:sample.data}));
        }
        await activeDecoder.flush(); await encodings;
        if (failed || stopped || reverted || !output.length) throw failed || new Error('Empty frame bank');
        return output.sort((a,b)=>a.ts-b.ts);
      } finally {
        valid = false;
        if (activeDecoder.state !== 'closed') activeDecoder.close();
        await encodings;
      }
    }
    const build = async () => {
      if (building || ready || reverted || stopped || reduced.matches || typeof VideoDecoder === 'undefined' || !ctx) return;
      building = true;
      watchdog = setTimeout(fallback,WATCHDOG);
      try {
        const response = await fetch(videoSrc,{signal:abort.signal});
        if (!response.ok) throw new Error('Video fetch failed');
        const {track,samples,description} = await parse(await response.arrayBuffer());
        if (!dur) dur = track.duration/track.timescale;
        let frames:BankFrame[];
        try { frames = await decodeSamples(track,samples,description,false); }
        catch(error) {
          if (stopped || reverted) throw error;
          frames = await decodeSamples(track,samples,description,true);
        }
        if (stopped || reverted) return;
        bank = frames; ready = true; building = false;
        mp4?.releaseUsedSamples(track.id,track.nb_samples); mp4 = undefined;
        warm(nearestIndex(bank,current));
      } catch { if (!stopped) fallback(); }
      finally { clearTimeout(watchdog); }
    };
    const motionChanged = () => { if (reduced.matches) fallback(); };
    setCanvasLive(false); dimensions(); metadata();
    video.addEventListener('loadedmetadata',metadata);
    window.addEventListener('resize',dimensions);
    window.addEventListener('orientationchange',dimensions);
    reduced.addEventListener('change',motionChanged);
    if (document.readyState === 'complete') void build();
    else window.addEventListener('load',build,{once:true});
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true; cancelAnimationFrame(raf); clearTimeout(watchdog); fallback();
      video.removeEventListener('loadedmetadata',metadata);
      window.removeEventListener('resize',dimensions);
      window.removeEventListener('orientationchange',dimensions);
      window.removeEventListener('load',build);
      reduced.removeEventListener('change',motionChanged);
    };
  },[videoSrc]);
  return {containerRef,videoRef,canvasRef,scrollProgress,canvasLive};
}
