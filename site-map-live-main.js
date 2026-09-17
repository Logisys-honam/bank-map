(()=>{
  if(window.__lmLiveSiteMapMain)return;
  const qs=new URLSearchParams(location.search); if(qs.get('lmLive')!=='1')return;
  window.__lmLiveSiteMapMain=1;

  const $=s=>document.querySelector(s), clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const evalPage=n=>{try{return (0,eval)(n)}catch(e){return null}};
  const latOf=x=>x?.latitude??x?.lat, lngOf=x=>x?.longitude??x?.lng;
  const valid=x=>Number.isFinite(Number(latOf(x)))&&Number.isFinite(Number(lngOf(x)));
  const category=x=>clean(x?.searchCategory||x?.searchType||x?.category||x?.type||'미분류');
  const managementGroup=x=>clean(x?.managementGroup||x?.manageGroup||x?.periodGroup||'');
  const text=x=>clean([x?.name,x?.siteName,x?.code,x?.siteCode,x?.address,x?.phone,category(x),managementGroup(x)].join(' ')).toLowerCase();

  let payload={sites:[],allCount:0,visitOnly:false,selectedVisitCount:0,mapView:{}},map=null,pageItems=[],markers=[],markerIndex=new Map(),info=null;
  let query='',type='',group='',initial=true,booted=false,longTimer=null,longOpened=false,renderToken=0,filterTimer=null;
  let mapDragging=false,suppressMapClickUntil=0;

  function carrier(){return $('#lmLiveSiteMapCarrier')}
  function action(o){const c=carrier();if(!c)return;c.dataset.action=JSON.stringify(o);document.dispatchEvent(new Event('lm-live-site-map-action'))}
  function readCarrier(){const c=carrier();if(!c)return false;try{payload=JSON.parse(c.value||'{}')||payload;return true}catch(e){return false}}
  function stopOriginalMarkers(){pageItems=evalPage('items')||pageItems||[];for(const x of pageItems){const m=x?.m;if(!m||m.__lmLiveLocked)continue;try{const f=m.setMap.bind(m);f(null);m.__lmLiveLocked=1;m.setMap=()=>f(null)}catch(e){}}}

  function installCss(){
    if($('#lmLiveCss'))return; const s=document.createElement('style');s.id='lmLiveCss';s.textContent=`
    html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important}.top,.controls{display:none!important}
    #map{position:fixed!important;inset:108px 0 0 0!important;width:auto!important;height:auto!important;background:#eef3f6!important}
    #lmLiveBar{position:fixed;inset:0 0 auto 0;height:108px;z-index:100000;background:#fff;border-bottom:1px solid #dbe2ea;box-shadow:0 2px 8px #0001;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",Arial,sans-serif;color:#172033}
    #lmLiveBar *{box-sizing:border-box}.lmL1{height:52px;display:flex;align-items:center;padding:7px 12px;gap:8px}.lmTitle{font-size:19px;font-weight:900;margin-right:auto}.lmSub{font-size:11px;color:#64748b}.lmBtn{height:34px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:0 11px;font-weight:800;cursor:pointer}.lmBtn.green{background:#03c75a;border-color:#03c75a;color:#fff}.lmBtn.on{background:#e8f8ef;border-color:#03c75a;color:#087a3d}
    .lmL2{height:56px;display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid #eef2f7}.lmSel,.lmSearch{height:38px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:0 10px;font-size:12px}.lmSel{width:220px}.lmSearch{flex:1;min-width:240px}.lmBadge{white-space:nowrap;background:#eef2f7;border-radius:16px;padding:7px 10px;font-size:11px;font-weight:900}.lmGroups{display:none;align-items:center;gap:5px;max-width:46vw;overflow-x:auto;white-space:nowrap;scrollbar-width:thin}.lmGroups.show{display:flex}.lmGroupBtn{height:34px;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:0 10px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}.lmGroupBtn.on{background:#1769e0;border-color:#1769e0;color:#fff}
    .lmLiveLabel{white-space:nowrap;background:#fff;border:2px solid #111;border-radius:5px;padding:5px 8px;font-weight:800;font-size:12px;box-shadow:0 2px 4px #0003;user-select:none}.lmLiveLabel.done{background:#20b866;color:#fff;border-color:#087a3d}.lmIcons{margin-left:5px;font-size:12px;display:inline-flex;gap:3px;align-items:center}.lmPostit{display:inline-block;width:13px;height:13px;background:#ffd84d;border:1px solid #d8ad00;border-radius:2px;position:relative;vertical-align:-2px}.lmPostit:after{content:"";position:absolute;right:-1px;top:-1px;border-left:5px solid transparent;border-bottom:5px solid #e6b900;width:0;height:0}
    .lmInfo{min-width:260px;max-width:360px;background:#fff;padding:15px;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",Arial,sans-serif}.lmInfo h3{margin:0 0 7px;font-size:17px}.lmMeta{font-size:12px;color:#64748b;line-height:1.55}.lmInfo button{margin-top:10px;border:0;border-radius:7px;background:#03c75a;color:#fff;padding:8px 12px;font-weight:900;cursor:pointer}
    #lmSiteModal{position:fixed;inset:0;z-index:200000;background:#0007;display:flex;align-items:center;justify-content:center;padding:18px;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",Arial,sans-serif}#lmSiteModal .box{width:min(680px,96vw);max-height:88vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 15px 50px #0005;padding:18px}#lmSiteModal h2{margin:0 0 5px;font-size:20px}.modalAddr{font-size:13px;color:#64748b;margin-bottom:12px}.sec{border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px}.sec h3{font-size:14px;margin:0 0 8px}.item{border:1px solid #e5e7eb;border-radius:9px;padding:9px;margin:7px 0}.row{display:flex;gap:7px;align-items:center}.row input,.row textarea{flex:1;border:1px solid #cbd5e1;border-radius:7px;padding:8px}.sm{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:7px 9px;font-weight:700;cursor:pointer}.danger{color:#b42318}.complete{background:#20b866!important;color:#fff!important;border-color:#087a3d!important}.modalTop{display:flex;gap:8px;align-items:flex-start}.modalTop .grow{flex:1}
    @media(max-width:700px){#map{inset:202px 0 0 0!important}#lmLiveBar{height:202px}.lmL1{height:92px;flex-wrap:wrap}.lmTitle{font-size:17px}.lmL1 .lmSub{width:100%}.lmL2{height:110px;display:grid;grid-template-columns:150px minmax(0,1fr);grid-template-rows:46px 48px;align-content:center;gap:6px 8px}.lmSel{width:150px}.lmSearch{width:100%;min-width:0}.lmBadge{display:none}.lmBtn{height:32px;padding:0 8px;font-size:11px}.lmGroups{grid-column:1 / -1;grid-row:2;width:100%;max-width:none;overflow-x:auto;padding:2px 0;gap:6px}.lmGroups.show:before{content:"관리구분";position:sticky;left:0;z-index:2;display:inline-flex;align-items:center;height:32px;padding:0 7px;background:#fff;color:#64748b;font-size:10px;font-weight:900;flex:0 0 auto}.lmGroupBtn{height:32px;padding:0 10px;font-size:11px;flex:0 0 auto}}
    `;document.head.appendChild(s);
  }

  function shell(){
    if($('#lmLiveBar'))return;const d=document.createElement('div');d.id='lmLiveBar';d.innerHTML=`
    <div class="lmL1"><div class="grow"><div class="lmTitle">LOGISYS 사이트 지도</div><div class="lmSub" id="lmSub">기존 NAVER 지도 연결 중…</div></div>
      <button class="lmBtn" id="lmRefresh">최신좌표반영</button><button class="lmBtn green" id="lmFit">전체보기</button>
      <button class="lmBtn" id="lmVisits">방문지선택</button><button class="lmBtn" id="lmReset">완료초기화</button></div>
    <div class="lmL2"><select class="lmSel" id="lmType"><option value="">검색구분 전체</option></select><div class="lmGroups" id="lmGroupFilters"></div><input class="lmSearch" id="lmSearch" placeholder="사이트명 · 코드 · 주소 검색"><span class="lmBadge" id="lmCount">표시 0</span><span class="lmBadge" id="lmCoord">좌표 0</span></div>`;
    document.body.appendChild(d);
    $('#lmSearch').oninput=e=>{query=clean(e.target.value).toLowerCase();clearTimeout(filterTimer);filterTimer=setTimeout(()=>{render(true);saveView()},120)};
    $('#lmType').onchange=e=>{type=e.target.value;group='';updateGroupFilters();render(true);saveView()};
    $('#lmRefresh').onclick=()=>document.dispatchEvent(new Event('lm-live-site-map-request'));
    $('#lmFit').onclick=fit;
    $('#lmVisits').onclick=()=>action({type:'visit-mode',enabled:!payload.visitOnly});
    $('#lmReset').onclick=()=>{const label=type||'전체';if(confirm(`${label} 완료 상태를 모두 해제할까요?`))action({type:'complete-reset',category:type})};
    naver.maps.Event.addListener(map,'dragstart',()=>{mapDragging=true});
    naver.maps.Event.addListener(map,'dragend',()=>{mapDragging=false;suppressMapClickUntil=Date.now()+350;saveView()});
    naver.maps.Event.addListener(map,'click',()=>{if(mapDragging||Date.now()<suppressMapClickUntil)return;closeInfo()});
  }

  function updateTypes(){
    const sel=$('#lmType');if(!sel)return;const keep=type, counts={};
    payload.sites.forEach(x=>counts[category(x)]=(counts[category(x)]||0)+1);
    const arr=Object.keys(counts).sort((a,b)=>a.localeCompare(b,'ko'));
    sel.innerHTML=`<option value="">검색구분 전체 (${payload.sites.length})</option>`+arr.map(x=>`<option value="${esc(x)}">${esc(x)} (${counts[x]})</option>`).join('');
    if(arr.includes(keep))sel.value=keep;else{type='';group='';sel.value=''}
    updateGroupFilters();
  }
  function updateGroupFilters(){
    const box=$('#lmGroupFilters');if(!box)return;
    const base=type?payload.sites.filter(x=>category(x)===type):[];
    const vals=[...new Set(base.map(managementGroup).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
    if(!type||!vals.length){group='';box.classList.remove('show');box.innerHTML='';return;}
    if(group&&!vals.includes(group))group='';
    box.classList.add('show');
    box.innerHTML=`<button class="lmGroupBtn ${!group?'on':''}" data-group="">전체</button>`+vals.map(v=>`<button class="lmGroupBtn ${group===v?'on':''}" data-group="${esc(v)}">${esc(v)}</button>`).join('');
    box.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{group=b.dataset.group||'';updateGroupFilters();render(true);saveView();});
  }
  const filtered=()=>payload.sites.filter(x=>valid(x)&&(!type||category(x)===type)&&(!group||managementGroup(x)===group)&&(!query||text(x).includes(query)));
  function closeInfo(){const old=info;info=null;if(!old)return false;try{old.close()}catch(e){}return true}
  function clearMarkers(){renderToken++;markers.forEach(x=>{try{x.m.setMap(null)}catch(e){}});markers=[];markerIndex.clear();closeInfo()}
  function infoHtml(x){
    const ev=(x._events||[]).length, mm=(x._memos||[]).length, icons=`${ev?'📅':''}${mm?'<span class="lmPostit" title="메모"></span>':''}`;
    return `<div class="lmInfo"><h3>${esc(x.name||x.siteName||'사이트')} ${icons}</h3>
      <div class="lmMeta">${esc(x.address||'주소 없음')}</div>${clean(x.phone)?`<div class="lmMeta">☎ ${esc(x.phone)}</div>`:''}
      <button class="lmGo" data-q="${esc(clean(x.address||x.name))}">길찾기</button></div>`;
  }

  function openModal(x){
    $('#lmSiteModal')?.remove();
    const ev=Array.isArray(x._events)?x._events:[], mm=Array.isArray(x._memos)?x._memos:[];
    const d=document.createElement('div');d.id='lmSiteModal';
    d.innerHTML=`<div class="box"><div class="modalTop"><div class="grow"><h2>${esc(x.name||x.siteName||'사이트')}</h2><div class="modalAddr">${esc(x.address||'주소 없음')}</div></div>
      <button class="sm ${x._completed?'complete':''}" data-complete>${x._completed?'완료해제':'완료'}</button><button class="sm" data-close>닫기</button></div>
      <div class="sec"><h3>📅 일정</h3><div data-events>${ev.length?ev.map(e=>`<div class="item" data-eid="${esc(e.id)}"><div><b>${esc(e.date||'')}</b> ${esc(e.title||'')}</div>${clean(e.memo)?`<div class="lmMeta">${esc(e.memo)}</div>`:''}<div class="row" style="margin-top:7px"><button class="sm" data-eedit>수정</button><button class="sm danger" data-edel>삭제</button></div></div>`).join(''):'<div class="lmMeta">등록된 일정 없음</div>'}</div>
        <div class="row" style="margin-top:8px"><input type="date" data-edate value="${new Date().toISOString().slice(0,10)}"><input data-etitle placeholder="일정 내용"><button class="sm" data-eadd>추가</button></div></div>
      <div class="sec"><h3><span class="lmPostit" style="margin-right:6px"></span>메모</h3><div data-memos>${mm.length?mm.map((m,i)=>`<div class="item" data-mid="${esc(m.id||'')}" data-bucket="${esc(m._bucket||'')}" data-idx="${Number(m._idx??i)}"><div>${esc(m.text)}</div><div class="row" style="margin-top:7px"><button class="sm" data-medit>수정</button><button class="sm danger" data-mdel>삭제</button></div></div>`).join(''):'<div class="lmMeta">등록된 메모 없음</div>'}</div>
        <div class="row" style="margin-top:8px"><textarea rows="2" data-mtext placeholder="메모 내용"></textarea><button class="sm" data-madd>추가</button></div></div></div>`;
    document.body.appendChild(d);
    d.onclick=e=>{
      if(e.target===d||e.target.closest('[data-close]')){d.remove();return}
      if(e.target.closest('[data-complete]')){action({type:'complete-toggle',siteKey:x._siteKey,site:x});d.remove();return}
      if(e.target.closest('[data-eadd]')){const title=clean(d.querySelector('[data-etitle]').value),date=d.querySelector('[data-edate]').value;if(title)action({type:'event-add',siteKey:x._siteKey,site:x,title,date});d.remove();return}
      const ei=e.target.closest('[data-eid]');
      if(ei&&e.target.closest('[data-edel]')){if(confirm('일정을 삭제할까요?'))action({type:'event-delete',id:ei.dataset.eid});d.remove();return}
      if(ei&&e.target.closest('[data-eedit]')){const old=(x._events||[]).find(z=>String(z.id)===ei.dataset.eid)||{},title=prompt('일정 내용',old.title||'');if(title!==null){const date=prompt('날짜 (YYYY-MM-DD)',old.date||'')||old.date;action({type:'event-update',id:ei.dataset.eid,title,date,memo:old.memo||'',time:old.time||''})}d.remove();return}
      if(e.target.closest('[data-madd]')){const tx=clean(d.querySelector('[data-mtext]').value);if(tx)action({type:'memo-add',siteKey:x._siteKey,site:x,text:tx});d.remove();return}
      const mi=e.target.closest('[data-mid],[data-bucket]');
      if(mi&&e.target.closest('[data-mdel]')){if(confirm('메모를 삭제할까요?'))action({type:'memo-delete',bucket:mi.dataset.bucket,id:mi.dataset.mid,idx:Number(mi.dataset.idx)});d.remove();return}
      if(mi&&e.target.closest('[data-medit]')){const old=mm.find(z=>(z.id||'')===mi.dataset.mid&&z._bucket===mi.dataset.bucket)||mm[Number(mi.dataset.idx)]||{},tx=prompt('메모 내용',old.text||'');if(tx!==null)action({type:'memo-update',bucket:mi.dataset.bucket,id:mi.dataset.mid,idx:Number(mi.dataset.idx),text:tx});d.remove();return}
    };
  }

  function markerIcon(x){
    const icons=`${(x._events||[]).length?'📅':''}${(x._memos||[]).length?'<span class="lmPostit" title="메모"></span>':''}`;
    return {content:`<div class="lmLiveLabel${x._completed?' done':''}">${esc(clean(x.name||x.siteName||'사이트'))}<span class="lmIcons">${icons}</span></div>`,anchor:new naver.maps.Point(15,15)};
  }
  function addMarker(x){
    const pos=new naver.maps.LatLng(Number(latOf(x)),Number(lngOf(x)));
    const m=new naver.maps.Marker({map:null,position:pos,icon:markerIcon(x),zIndex:100});
    const rec={m,x,pos,visible:false,visual:''};
    naver.maps.Event.addListener(m,'click',()=>{if(longOpened){longOpened=false;return}suppressMapClickUntil=Date.now()+250;closeInfo();info=new naver.maps.InfoWindow({content:infoHtml(rec.x),borderWidth:0,backgroundColor:'transparent',disableAnchor:true});info.open(map,m);setTimeout(()=>{const b=$('.lmGo[data-q]');if(b&&!b.__lm){b.__lm=1;b.onclick=()=>action({type:'navigate',siteKey:rec.x._siteKey,site:rec.x})}},0)});
    const start=()=>{clearTimeout(longTimer);longOpened=false;longTimer=setTimeout(()=>{longOpened=true;closeInfo();openModal(rec.x)},650)};
    const cancel=()=>clearTimeout(longTimer);
    ['mousedown','touchstart'].forEach(ev=>naver.maps.Event.addListener(m,ev,start));['mouseup','touchend','dragstart'].forEach(ev=>naver.maps.Event.addListener(m,ev,cancel));
    naver.maps.Event.addListener(m,'rightclick',()=>openModal(rec.x));
    markers.push(rec);markerIndex.set(String(x._siteKey),rec);return rec;
  }
  function fit(){const shown=markers.filter(x=>x.visible);if(!map||!shown.length)return;if(shown.length===1){map.setCenter(shown[0].pos);map.setZoom(15);return}const b=new naver.maps.LatLngBounds();shown.forEach(z=>b.extend(z.pos));map.fitBounds(b,{top:130,right:30,bottom:30,left:30})}
  function render(refit=false){
    if(!map)return;const list=filtered(),wanted=new Set(list.map(x=>String(x._siteKey)));
    if(payload.standalone){const v=$('#lmVisits');if(v)v.style.display='none'}
    for(const rec of markers){const show=wanted.has(String(rec.x._siteKey));if(show!==rec.visible){rec.visible=show;try{rec.m.setMap(show?map:null)}catch(e){}}}
    $('#lmCount').textContent=`표시 ${list.length.toLocaleString()}`;$('#lmCoord').textContent=`좌표 ${payload.sites.filter(valid).length.toLocaleString()}`;
    $('#lmSub').textContent=`${payload.visitOnly?'방문지 '+payload.selectedVisitCount+'곳':'전체 사이트'} · 저장 ${Number(payload.allCount||payload.sites.length).toLocaleString()}개 · 기존 NAVER 지도 재사용`;
    $('#lmVisits').classList.toggle('on',payload.visitOnly);$('#lmVisits').textContent=payload.visitOnly?`방문지만 · ${payload.selectedVisitCount}`:`방문지선택 · ${payload.selectedVisitCount}`;
    if(initial||refit){initial=false;fit()}
  }
  async function syncMarkers(refit=false){
    if(!map)return;const token=++renderToken,next=payload.sites.filter(valid),keys=new Set(next.map(x=>String(x._siteKey)));
    for(const rec of [...markers])if(!keys.has(String(rec.x._siteKey))){try{rec.m.setMap(null)}catch(e){}markerIndex.delete(String(rec.x._siteKey));markers.splice(markers.indexOf(rec),1)}
    for(let i=0;i<next.length;i+=80){
      if(token!==renderToken)return;
      for(const x of next.slice(i,i+80)){
        const key=String(x._siteKey),visual=`${clean(x.name||x.siteName)}|${!!x._completed}|${(x._events||[]).length}|${(x._memos||[]).length}`;
        let rec=markerIndex.get(key);
        if(!rec)rec=addMarker(x);else{
          rec.x=x;
          const lat=Number(latOf(x)),lng=Number(lngOf(x));
          if(Number(rec.pos.lat())!==lat||Number(rec.pos.lng())!==lng){rec.pos=new naver.maps.LatLng(lat,lng);try{rec.m.setPosition(rec.pos)}catch(e){}}
          if(rec.visual!==visual){try{rec.m.setIcon(markerIcon(x))}catch(e){}}
        }
        rec.visual=visual;
      }
      render(false);await new Promise(r=>requestAnimationFrame(r));
    }
    if(token===renderToken)render(refit);
  }
  let viewTimer=null;
  function saveView(){if(!map)return;clearTimeout(viewTimer);viewTimer=setTimeout(()=>{try{const c=map.getCenter();action({type:'map-state-save',view:{lat:c.lat(),lng:c.lng(),zoom:map.getZoom(),category:type,group,query}})}catch(e){}},220)}
  async function restoreView(){const v=payload.mapView&&typeof payload.mapView==='object'?payload.mapView:{};if(v.category)type=String(v.category);if(v.group)group=String(v.group);if(v.query){query=String(v.query);const q=$('#lmSearch');if(q)q.value=query}updateTypes();if(type&&$('#lmType'))$('#lmType').value=type;await syncMarkers(false);const lat=Number(v.lat),lng=Number(v.lng),zoom=Number(v.zoom);if(Number.isFinite(lat)&&Number.isFinite(lng)){try{map.setCenter(new naver.maps.LatLng(lat,lng));if(Number.isFinite(zoom))map.setZoom(zoom)}catch(e){}}else fit()}
  function receive(){if(!readCarrier()||!booted)return;updateTypes();syncMarkers(false)}
  function boot(){if(booted)return;map=evalPage('map');if(!map||!window.naver?.maps?.Map){setTimeout(boot,200);return}booted=true;if(matchMedia('(max-width:700px)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){try{map.setOptions({zoomControl:false})}catch(e){}}stopOriginalMarkers();installCss();shell();readCarrier();restoreView();try{naver.maps.Event.trigger(map,'resize')}catch(e){};setTimeout(()=>{try{naver.maps.Event.trigger(map,'resize')}catch(e){}},300);let stopRuns=0,stopTimer=setInterval(()=>{stopOriginalMarkers();if(++stopRuns>=12)clearInterval(stopTimer)},900);naver.maps.Event.addListener(map,'idle',saveView);naver.maps.Event.addListener(map,'zoom_changed',saveView)}
  document.addEventListener('lm-live-site-map-data',receive);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,200),{once:true});else setTimeout(boot,200);

  window.__lmHandleBack=function(){
    try{const m=document.getElementById('lmSiteModal');if(m){m.remove();return true;}if(closeInfo())return true;}catch(e){}
    return false;
  };
})();
