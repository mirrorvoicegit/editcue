'use strict';
// 製作頁預覽及離線交件使用同一份剪輯師版面。
function buildEditorPage(data){
 const ids=new Set(data.annotations.flatMap(a=>[a.assetId,a.referenceAssetId]).filter(Boolean));
 const episode={title:data.title,sourceName:data.sourceName,shortTitle:data.shortTitle,annotations:data.annotations,redNotes:data.redNotes,rows:data.rows.map(({uid,seq,start,end,text})=>({uid,seq,start,end,text})),assets:(data.assets||[]).filter(a=>ids.has(a.id)).map(({id,name,fileName,dataUrl})=>({id,name,fileName,dataUrl}))};
 const payload=JSON.stringify(episode).replace(/</g,'\\u003c');
 return editorHead+'<script type="application/json" id="episode">'+payload+'</script>'+editorBody;
}
const editorHead=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EditCue｜剪輯師版</title>
<style>
*{box-sizing:border-box}body{margin:0;color:#191919;font:16px/1.55 system-ui,"Microsoft JhengHei",sans-serif}header{border-bottom:1px solid #222}header div,main{max-width:920px;margin:auto;padding:16px 22px}header div,.bar,.pair{display:flex;align-items:center;gap:12px;flex-wrap:wrap}header b{margin-right:auto}button,select,.open{font:inherit;color:inherit;border:1px solid #999;background:white;padding:5px 10px;cursor:pointer}.open{background:#171717;color:white;border-color:#171717}button:focus-visible,summary:focus-visible,select:focus-visible,label:focus-within{outline:3px solid #3484b4}input[type=file]{position:absolute;width:1px;height:1px;opacity:0}h1{font-size:clamp(23px,4vw,32px);margin:12px 0}h2{font-size:20px;margin:26px 0 4px;border-bottom:2px solid;padding-bottom:6px}.bar{justify-content:space-between}.progress{font-variant-numeric:tabular-nums}.item{display:grid;grid-template-columns:1fr 36px;gap:8px;border-bottom:1px solid #ccc;padding:16px 0}.info{min-width:0}.tag{padding:1px 7px;font-weight:700;font-size:14px;background:#eee}.cut{background:#d9d9d9}.card,.visual{background:#b8f0d2}.highlight{background:#ffeb00}.textcard{color:#0054c8;background:#e5efff}.short{color:#bd001c;background:#ffe6ea}.meta,summary,small{font-size:14px;color:#555}.meta{font-variant-numeric:tabular-nums}.line{margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}.check{border-radius:50%;width:28px;height:28px;padding:0;border:1.5px solid #666;margin:1px auto}.check[aria-pressed=true]{background:#191919;color:white}.item.done .tag{opacity:.7}summary{cursor:pointer;width:fit-content}details{margin-top:6px}.asset{display:flex;align-items:center;gap:10px;margin:8px 0;color:#111}.asset img{width:80px;max-height:54px;object-fit:contain}#message:empty{display:none}#message{color:#973f00}#subtitle{font-weight:700}button[hidden]{display:none}@media(max-width:520px){header div,main{padding:12px}.pair{gap:5px}.item{grid-template-columns:1fr 32px}}
.cut-context{margin:12px 0;display:grid;gap:8px}.cut-context p{margin:0;padding:0 12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}.cut-context .removed{background:#f2f2f2;border-radius:3px;padding-block:8px;color:#484848}
</style><header><div><b>EditCue　剪輯師版</b></div></header>
<main><p id="message" role="status"></p><h1 id="title"></h1><div class="bar"><label>正片排序　<select id="sort"><option value="time">依原片時間</option><option value="cut">先剪掉</option></select></label><span class="progress" id="progress" aria-live="polite"></span></div><div id="list"></div></main>
`;
const editorBody=String.raw`<script>
'use strict';
const el=id=>document.getElementById(id);
const names={cut:'剪掉',card:'插入圖卡',visual:'插入圖卡',textcard:'插入字卡',short:'短影音',highlight:'片頭預告',move:'移動段落',captions:'特殊需求',other:'其他備註'};
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=v=>String(v||'').replace(/^00:/,'').replace(',','.');
let project,items=[],cuts=new Set(),assets=new Map(),checks=new Set(),key='';
function range(item){
 const rows=item.rows,a=rows[0],b=rows.at(-1);
 return [clock(a.start)+(b.end?'–'+clock(b.end):''),'字幕 '+a.seq+(a.seq===b.seq?'':'–'+b.seq)].filter(Boolean).join('　');
}
function signature(item){return JSON.stringify([item.id,item.kind,item.rows.map(r=>[r.uid,r.text,r.start,r.end]),item.detail,item.title,item.assetId,item.referenceAssetId,item.shortOrder]);}
async function show(data){
 if(!Array.isArray(data.rows)||!Array.isArray(data.annotations))throw Error('請選擇 EditCue 剪輯包或 JSON 工作檔');
 const lookup=new Map(data.rows.map((r,i)=>[r.uid,{...r,i,seq:r.seq||i+1}]));
 const notes=(data.redNotes||[]).map(n=>({id:n.id,kind:'other',detail:n.text,rowIds:[n.afterUid||data.rows[0]?.uid]}));
 const all=[...data.annotations,...notes].map(c=>({...c,rows:(c.rowIds||[]).map(id=>lookup.get(id)).filter(Boolean).sort((a,b)=>a.i-b.i)})).filter(c=>c.rows.length);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([data.title,data.sourceName,data.rows.map(r=>r.uid)])));
 key='editcue:editor-beta:'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 try{checks=new Set(JSON.parse(localStorage.getItem(key)||'[]'))}catch{checks=new Set()}
 project=data;assets=new Map((data.assets||[]).map(a=>[a.id,a]));
 cuts=new Set(all.filter(c=>c.kind==='cut').flatMap(c=>c.rows.map(r=>r.i)));
 items=all.map(c=>({...c,rows:c.kind==='cut'?c.rows:c.rows.filter(r=>!cuts.has(r.i))})).filter(c=>c.rows.length).sort((a,b)=>a.rows[0].i-b.rows[0].i);
 items.forEach((c,i)=>{c.index=i;c.signature=signature(c)});
 el('title').textContent=data.title||'剪輯指示';el('message').textContent='';render();
}
function assetMarkup(id){
 const a=assets.get(id);if(!a)return '';
 const name=escape(a.name||a.code||'圖卡');
 if(!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(a.dataUrl||''))return '<div>'+name+'</div>';
 return '<a class="asset" download="'+escape(a.fileName||a.name||'圖卡')+'" href="'+escape(a.dataUrl)+'"><img alt="" src="'+escape(a.dataUrl)+'">下載 '+name+'</a>';
}
function rowMarkup(c,n){
 const r=c.rows,first=r[0],last=r.at(-1),done=checks.has(c.signature);let info='';
 if(c.kind==='cut'){
  let a=first.i-1,b=last.i+1;while(cuts.has(a))a--;while(cuts.has(b))b++;
  const previous=project.rows[a],next=project.rows[b];
  const side=(row,edge)=>row?escape(row.text):'<small>'+edge+'</small>';
  info='<div class="cut-context"><p>'+side(previous,'片頭')+'</p><p class="removed">（'+escape(r.map(x=>x.text).join(' '))+'）</p><p>'+side(next,'片尾')+'</p></div>';
 }else{info='<p class="line">'+escape('「'+first.text+'」'+(last.i!==first.i?' → 「'+last.text+'」':''))+'</p>'}
 const label=c.kind==='short'?'第 '+n+' 段':names[c.kind]||'其他需求';
 const extra=[...new Set([c.title,c.detail].filter(Boolean))].join('　');
 const speech=escape(r.map(x=>x.text).join(' '));
 const context=c.kind==='cut'?'':'<details><summary>展開這段台詞</summary><p class="line">'+speech+'</p></details>';
 return '<article class="item'+(done?' done':'')+'"><div class="info"><div class="pair"><span class="tag '+(Object.hasOwn(names,c.kind)?c.kind:'other')+'">'+escape(label)+'</span><span class="meta">'+escape(range(c))+'</span></div>'+info+(extra?'<p class="line">'+escape(extra)+'</p>':'')+assetMarkup(c.assetId)+assetMarkup(c.referenceAssetId)+context+'</div><button class="check" data-index="'+c.index+'" aria-label="'+escape(label+'，字幕 '+first.seq+'，完成')+'" aria-pressed="'+done+'">'+(done?'✓':'')+'</button></article>';
}
function progress(){el('progress').textContent='✓ 已完成　'+items.filter(c=>checks.has(c.signature)).length+' / '+items.length}
function render(){
 const main=items.filter(c=>!['highlight','short'].includes(c.kind));
 if(el('sort').value==='cut')main.sort((a,b)=>Number(b.kind==='cut')-Number(a.kind==='cut')||a.rows[0].i-b.rows[0].i);
 const groups=[['正片',main],['片頭預告',items.filter(c=>c.kind==='highlight')],['短影音',items.filter(c=>c.kind==='short').sort((a,b)=>(a.shortOrder??Infinity)-(b.shortOrder??Infinity))]];
 el('list').innerHTML=groups.filter(([,list])=>list.length).map(([name,list])=>'<section><h2>'+name+'</h2>'+(name==='短影音'&&project.shortTitle?'<p id="subtitle">'+escape(project.shortTitle)+'</p>':'')+list.map((c,i)=>rowMarkup(c,i+1)).join('')+'</section>').join('')||'<p>這份工作檔尚未標示剪輯需求。</p>';progress();
}
el('list').onclick=e=>{const btn=e.target.closest('.check');if(!btn)return;const c=items[Number(btn.dataset.index)],on=!checks.has(c.signature);
 if(on)checks.add(c.signature);else checks.delete(c.signature);btn.setAttribute('aria-pressed',on);btn.textContent=on?'✓':'';btn.closest('article').classList.toggle('done',on);progress();
 try{localStorage.setItem(key,JSON.stringify([...checks]))}catch{el('message').textContent='這次勾選無法儲存在瀏覽器。'}
};
el('sort').onchange=render;
show(JSON.parse(document.getElementById('episode').textContent)).catch(e=>el('message').textContent=e.message);
</script></html>`;

