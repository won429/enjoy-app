declare module 'mp4box' {
  export interface Box { write(stream: DataStream): void }
  export interface Sample { is_sync: boolean; cts: number; duration: number; timescale: number; data: Uint8Array; number: number }
  export interface Track { id:number; codec:string; timescale:number; duration:number; nb_samples:number; video:{width:number;height:number} }
  export interface MP4File {
    onReady?: (info:{videoTracks:Track[]})=>void;
    onError?: (error:unknown)=>void;
    onSamples?: (id:number,user:unknown,samples:Sample[])=>void;
    appendBuffer(buffer:ArrayBuffer & {fileStart:number}):number;
    flush():void; start():void; stop():void;
    setExtractionOptions(id:number,user:unknown,options:{nbSamples:number}):void;
    releaseUsedSamples(id:number,sampleNumber:number):void;
    getTrackById(id:number):{mdia:{minf:{stbl:{stsd:{entries:Array<{avcC?:Box;hvcC?:Box;vpcC?:Box;av1C?:Box}>}}}}};
  }
  export class DataStream { constructor(buffer?:ArrayBuffer,offset?:number,endianness?:boolean); static BIG_ENDIAN:boolean; buffer:ArrayBuffer; position:number }
  export function createFile():MP4File;
}
