(function(){
const ME='p'+Math.random().toString(36).slice(2,10);
function mk(name){
  const ch=new BroadcastChannel('mock-'+name);const peers=new Map();let mine=Object.freeze({});const hs=[];let cached=[];
  const snap=()=>[...peers.entries()].map(([p,pr])=>Object.freeze({peer:p,by:null,isMe:p===ME,sameTab:p===ME,kind:'viewer',guest:false,presence:pr,updatedAt:Date.now()}));
  const fire=()=>{cached=snap();hs.forEach(h=>h({peers:cached,joined:[],left:[],updated:[]}))};
  peers.set(ME,mine);cached=snap();
  ch.onmessage=e=>{const m=e.data;if(m.t==='pres'){peers.set(m.peer,Object.freeze(m.presence));fire()}else if(m.t==='hello'){ch.postMessage({t:'pres',peer:ME,presence:mine})}else if(m.t==='bye'){peers.delete(m.peer);fire()}};
  ch.postMessage({t:'hello'});
  return {name,
    presence:async(patch)=>{const o={...mine};for(const k in patch){if(patch[k]===null)delete o[k];else o[k]=patch[k]}
      if(new TextEncoder().encode(JSON.stringify(o)).length>4096)throw {code:'invalid_argument'};
      mine=Object.freeze(o);peers.set(ME,mine);ch.postMessage({t:'pres',peer:ME,presence:mine});fire()},
    peers:()=>cached,onPeers:h=>{hs.push(h);setTimeout(()=>{cached=snap();h({peers:cached,joined:cached,left:[],updated:[]})},0);return()=>{}},
    leave:async()=>{ch.postMessage({t:'bye',peer:ME});ch.close()},
    join:async n=>mk(n),emit:async()=>{},on:()=>()=>{},connected:()=>true};
}
window.claude={use:async n=>n==='room'?mk('lobby'):null};
})();
(function(){
const s=async(p)=>({text:'ok',truncated:false});
s.json=async(p)=>{await new Promise(r=>setTimeout(r,800));window.__lastPrompt=p;const out=[];p.replace(/k=(\d+) \| categoria: "([^"]*)" \| resposta: "([^"]*)"/g,(m,k,c,r)=>{out.push({k:+k,ok:!/zz/i.test(r),r:/zz/i.test(r)?'palavra inventada':''})});return out};
const orig=window.claude.use;window.claude={use:async n=>n==='sample'?s:orig(n)};
})();
