'use client';
import {useEffect,useState,type ReactNode,type RefObject} from 'react';
import {useMotionValueEvent,type MotionValue} from 'framer-motion';

// Keep the layout tracks mounted. Only their costly artwork enters/leaves these
// padded windows, using the same reversible progress as the original animation.
export function useProgressWindow(progress:MotionValue<number>,start:number,end=Infinity){
 const inside=(value:number)=>value>=start&&value<=end;
 const [active,setActive]=useState(()=>inside(progress.get()));
 useMotionValueEvent(progress,'change',value=>setActive(inside(value)));
 useEffect(()=>{setActive(inside(progress.get()));},[progress,start,end]);
 return active;
}
export function SceneWindow({progress,start,end,children}:{progress:MotionValue<number>;start:number;end?:number;children:ReactNode}){
 return useProgressWindow(progress,start,end)?children:null;
}
export function useNearby(ref:RefObject<HTMLElement>){
 const [nearby,setNearby]=useState(false);
 useEffect(()=>{
  const element=ref.current;if(!element)return;
  // Pixel margins use viewport height (percentage IO margins use root width).
  let observer:IntersectionObserver;
  const observe=()=>{
   observer?.disconnect();
   const margin=innerHeight*2,rect=element.getBoundingClientRect();
   setNearby(rect.bottom>=-margin&&rect.top<=innerHeight+margin);
   observer=new IntersectionObserver(([entry])=>setNearby(entry.isIntersecting),{rootMargin:`${margin}px 0px`});
   observer.observe(element);
  };
  observe();window.addEventListener('resize',observe);
  return()=>{observer.disconnect();window.removeEventListener('resize',observe);};
 },[ref]);
 return nearby;
}
