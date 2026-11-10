'use client';
import {useEffect,useRef} from 'react';
const coats=['#739472','#b18d6b','#7d98ad','#af897e','#9383a4','#c2a461'];
const skins=['#d7aa82','#9a6b4f','#e1b995','#bc8968','#e3ba8a','#ba8461'];
export default function Chef({index=0,working=false,done=false}:{index?:number;working?:boolean;done?:boolean}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,raf=0,last=0;
  const draw=()=>{ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,28,36);const f=(x:number,y:number,w:number,h:number,c:string)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};const outline='#344b3b',cream='#fff1cb',shade='#dfd7b0',skin=skins[index%6],coat=coats[index%6],active=working&&!motion.matches;
   f(5,33,19,2,'#00000024');f(7,30,6,4,outline);f(16,30,6,4,outline);f(7,23,15,9,outline);f(8,22,13,9,coat);f(10,24,10,7,cream);f(12,26,2,2,outline);f(17,26,2,2,outline);f(10,30,10,2,shade);
   const left=active?(frame%2?25:27):25,right=active?(frame%2?27:25):done?19:25;f(4,left-2,4,6,outline);f(5,left-2,3,4,coat);f(5,left+2,3,3,skin);f(22,right-2,4,6,outline);f(22,right-2,3,4,coat);f(22,right+2,3,3,skin);
   f(7,12,15,10,outline);f(8,13,13,10,skin);f(10,23,9,1,skin);f(6,16,2,4,skin);f(21,16,2,4,skin);f(8,13,13,2,'#876b4b');f(10,17,2,2,outline);f(17,17,2,2,outline);f(13,21,4,1,'#965b49');f(9,20,2,1,'#d58f71');f(19,20,2,1,'#d58f71');f(6,5,17,9,outline);f(4,6,21,5,outline);f(6,3,7,2,outline);f(14,2,7,3,outline);f(5,6,19,4,cream);f(7,4,5,3,cream);f(14,3,6,4,cream);f(7,8,15,5,cream);f(7,11,15,2,shade);f(12,4,2,5,shade);f(21,7,2,4,shade);f(8,4,2,2,'#fffbed');
  };
  const tick=(time:number)=>{if(time-last>140){last=time;frame++;draw();}raf=requestAnimationFrame(tick);};draw();if(working&&!motion.matches)raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[index,working,done]);
 return <canvas ref={ref} width={28} height={36} className="ak-pixel-chef" aria-hidden="true"/>;
}
