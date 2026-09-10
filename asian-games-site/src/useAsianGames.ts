import {useEffect,useState} from 'react';
import {getDocument,mergeGames,type Game} from './baseball';
export function useAsianGames(month:string,date:string){
  const [games,setGames]=useState<Game[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let disposed=false;
    const timeout=setTimeout(()=>controller.abort(),15000);
    setLoading(true);setError('');
    const months=[...new Set([month,'2026-09','2026-10'])];
    const paths=months.map(m=>'schedule/'+m).concat(['games/'+date,'live/today']);
    Promise.allSettled(paths.map(path=>getDocument(path,controller.signal))).then(results=>{
      if(disposed)return;
      if(results[0].status==='rejected'){
        setError('일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }else{
        setGames(mergeGames(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])));
        if(results.some(result=>result.status==='rejected'))setError('일부 경기정보를 갱신하지 못했어요. 새로고침해 주세요.');
      }
      setLoading(false);clearTimeout(timeout);
    });
    return()=>{disposed=true;clearTimeout(timeout);controller.abort();};
  },[month,date,revision]);
  useEffect(()=>{
    let active=true;
    const update=()=>{if(active&&!document.hidden)setRevision(value=>value+1);};
    const visibility=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='enjoy-asian-games-visibility')return;
      active=Boolean(event.data.visible);if(active)update();
    };
    window.addEventListener('message',visibility);
    const timer=setInterval(update,30000);
    return()=>{clearInterval(timer);window.removeEventListener('message',visibility);};
  },[]);
  return {games,loading,error,refresh:()=>setRevision(value=>value+1)};
}
