(() => {
  const $ = id => document.getElementById(id);
  const sync = $("sync");

  function firstDefined(candidates){
    for(const fn of candidates){
      try{const v=fn();if(v!==undefined&&v!==null)return v}catch(e){}
    }
    return null;
  }

  const rawData = firstDefined([
    () => window.BANK_BRANCHES,
    () => typeof BANK_BRANCHES!=="undefined" ? BANK_BRANCHES : undefined
  ]);

  if(!Array.isArray(rawData)){
    sync.textContent="data.js 연결 실패";
    alert("기존 data.js의 BANK_BRANCHES를 읽지 못했습니다.");
    return;
  }

  function stableMemoId(bank,name){
    const s=`${bank||""}|${name||""}`;let h=5381;
    for(let i=0;i<s.length;i++) h=(h*33+s.charCodeAt(i))%2147483647;
    return "m_"+Math.trunc(h).toString(16).toUpperCase();
  }

  const branches=rawData.map((x,i)=>({
    id:x.id||x.branchId||String(i),
    memoId:x.memoId||x.memoID||x.memo_id||stableMemoId(x.bank,x.name),
    name:x.name||"(지점명 없음)",
    staff:x.staff||x.manager||x.assignee||x.담당직원||x.staffName||"미지정",
    bank:x.bank||"",center:x.center||"",quarter:x.quarter||"",
    address:x.address||"",phone:x.phone||""
  }));

  async function loadFirebaseFromRootIndex(){
    const html=await fetch("../index.html",{cache:"no-store"}).then(r=>r.text());
    const cfgMatch=html.match(/const\s+fbCfg\s*=\s*(\{[\s\S]*?\})\s*;/);
    if(!cfgMatch) throw new Error("기존 index.html에서 fbCfg를 찾지 못했습니다.");
    const cfg=Function('"use strict";return ('+cfgMatch[1]+')')();
    let memoPath="bankMap/memos";
    const memoMatch=html.match(/const\s+memoBasePath\s*=\s*['"]([^'"]+)['"]/);
    if(memoMatch&&memoMatch[1]) memoPath=memoMatch[1];
    return {cfg,memoPath};
  }

  let db=null,auth=null,memoPath="bankMap/memos";
  const state={memos:{},staff:"전체",summary:"all",search:"",sort:"todoFirst",selected:null};

  const esc=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const fmt=ms=>{if(!ms)return "";try{return new Intl.DateTimeFormat("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(ms))}catch{return ""}};

  function memosFor(b){
    const o=state.memos[b.memoId]||{};
    return Object.entries(o).map(([key,v])=>({key,...(v||{})}))
      .sort((a,b)=>(Number(a.no)||0)-(Number(b.no)||0));
  }
  function latestMemo(b){
    const ms=memosFor(b);if(!ms.length)return null;
    return [...ms].sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0))[0];
  }
  function nextNo(b){return memosFor(b).reduce((m,x)=>Math.max(m,Number(x.no)||0),0)+1}
  function uniqueStaff(){const seen=new Set(),out=[];branches.forEach(b=>{const s=b.staff||"미지정";if(!seen.has(s)){seen.add(s);out.push(s)}});return out}

  function branchStats(b){
    const ms=memosFor(b);
    const todo=ms.filter(x=>!x.done).length,done=ms.length-todo;
    return {count:ms.length,todo,done};
  }

  function match(b){
    if(state.staff!=="전체"&&b.staff!==state.staff)return false;
    const st=branchStats(b);
    if(state.summary==="memo"&&st.count===0)return false;
    if(state.summary==="todo"&&st.todo===0)return false;
    if(state.summary==="done"&&st.done===0)return false;
    const q=state.search.trim().toLowerCase();
    if(q&&!([b.name,b.address,b.bank,b.center,...memosFor(b).map(m=>m.text)].join(" ").toLowerCase().includes(q)))return false;
    return true;
  }

  function sortedBranches(){
    const list=branches.filter(match);
    return list.sort((a,b)=>{
      if(state.sort==="name")return a.name.localeCompare(b.name,"ko");
      if(state.sort==="latest")return (latestMemo(b)?.createdAt||0)-(latestMemo(a)?.createdAt||0);
      const sa=branchStats(a),sb=branchStats(b);
      if(sa.todo!==sb.todo)return sb.todo-sa.todo;
      if(sa.count!==sb.count)return sb.count-sa.count;
      return a.name.localeCompare(b.name,"ko");
    });
  }

  function renderSummary(){
    let memoBranches=0,todo=0,done=0;
    branches.forEach(b=>{const s=branchStats(b);if(s.count)memoBranches++;todo+=s.todo;done+=s.done});
    $("cBranches").textContent=branches.length;$("cMemoBranches").textContent=memoBranches;$("cTodo").textContent=todo;$("cDone").textContent=done;
    document.querySelectorAll(".summary-card").forEach(x=>x.classList.toggle("active",x.dataset.summary===state.summary));
  }

  function renderTabs(){
    const el=$("staffTabs");el.innerHTML="";
    ["전체",...uniqueStaff()].forEach(s=>{
      const b=document.createElement("button");b.className="staff-tab"+(state.staff===s?" active":"");b.textContent=s;
      b.onclick=()=>{state.staff=s;render()};el.appendChild(b);
    });
  }

  function renderList(){
    const list=sortedBranches(),el=$("branchList");el.innerHTML="";
    $("empty").classList.toggle("hidden",list.length>0);
    list.forEach(b=>{
      const st=branchStats(b),latest=latestMemo(b);
      const row=document.createElement("div");
      row.className="branch-row"+(state.selected?.memoId===b.memoId?" selected":"");
      let pill='<span class="pill none">메모없음</span>';
      if(st.todo>0)pill=`<span class="pill todo">진행중 ${st.todo}</span>`;
      else if(st.done>0)pill=`<span class="pill done">완료 ${st.done}</span>`;
      row.innerHTML=`
        <div><div class="branch-title">${esc(b.name)}</div><div class="branch-sub">${esc([b.bank,b.center,b.quarter?b.quarter+"분기":"",b.address].filter(Boolean).join(" · "))}</div></div>
        <div>${latest?`<div class="recent">${esc(latest.text||"")}</div><div class="recent-meta">${esc(fmt(latest.createdAt))}</div>`:`<div class="recent none">등록된 메모 없음</div>`}</div>
        <div class="status-wrap">${pill}${st.count?`<span class="recent-meta">전체 ${st.count}</span>`:""}</div>`;
      row.onclick=()=>{state.selected=b;renderList();renderDetail()};
      el.appendChild(row);
    });
  }

  function renderDetail(){
    const panel=$("detailPanel"),b=state.selected;
    if(!b){panel.innerHTML='<div class="detail-empty">왼쪽에서 지점을 선택하면<br>메모 전체 내용을 볼 수 있습니다.</div>';return}
    const ms=memosFor(b);
    panel.innerHTML=`
      <div class="detail-head">
        <div class="detail-head-top">
          <div><div class="detail-name">${esc(b.name)}</div><div class="detail-sub">${esc([b.bank,b.center,b.quarter?b.quarter+"분기":"",b.address].filter(Boolean).join(" · "))}</div></div>
          <button class="add-btn">메모 추가</button>
        </div>
      </div>
      <div class="memo-list"></div>`;
    panel.querySelector(".add-btn").onclick=()=>openModal(b);
    const list=panel.querySelector(".memo-list");
    if(!ms.length){list.innerHTML='<div class="detail-empty">등록된 메모가 없습니다.</div>';return}
    ms.forEach(m=>list.appendChild(renderMemoCard(b,m)));
  }

  function renderMemoCard(b,m){
    const el=document.createElement("div");el.className="memo-card"+(m.done?" done":"");
    const writer=m.writer||m.createdBy||"";
    el.innerHTML=`
      <div class="memo-top"><span>${esc(m.no||"")}번 메모</span><span>${m.done?"완료":"진행중"}</span></div>
      <div class="memo-text">${esc(m.text||"")}</div>
      <div class="memo-meta">${esc(fmt(m.createdAt))}${writer?" · "+esc(writer):""}${m.done&&m.completedAt?" · 완료 "+esc(fmt(m.completedAt)):""}</div>
      <div class="memo-actions">
        <button class="${m.done?"undo":"complete"}">${m.done?"완료 해제":"완료"}</button>
        <button class="delete">삭제</button>
      </div>`;
    el.querySelector(m.done?".undo":".complete").onclick=async()=>{
      const ref=db.ref(`${memoPath}/${b.memoId}/${m.key}`);
      if(m.done)await ref.update({done:false,completedAt:null,completedBy:null});
      else await ref.update({done:true,completedAt:firebase.database.ServerValue.TIMESTAMP,completedBy:$("writer").value||null});
    };
    el.querySelector(".delete").onclick=async()=>{
      if(confirm(`${b.name}의 ${m.no||""}번 메모를 삭제할까요?`))await db.ref(`${memoPath}/${b.memoId}/${m.key}`).remove();
    };
    return el;
  }

  function render(){renderSummary();renderTabs();renderList();renderDetail()}

  function openModal(b){state.selected=b;$("modalTitle").textContent=b.name+" · 메모 추가";$("memoText").value="";$("modal").classList.remove("hidden")}
  function closeModal(){$("modal").classList.add("hidden")}
  $("cancel").onclick=closeModal;$("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
  $("save").onclick=async()=>{
    const b=state.selected,text=$("memoText").value.trim();if(!b||!text)return;
    await db.ref(`${memoPath}/${b.memoId}`).push().set({
      no:nextNo(b),text,done:false,writer:$("writer").value||null,
      createdAt:firebase.database.ServerValue.TIMESTAMP,completedAt:null
    });
    closeModal();
  };

  document.querySelectorAll(".summary-card").forEach(x=>x.onclick=()=>{state.summary=x.dataset.summary;render()});
  $("search").oninput=e=>{state.search=e.target.value;render()};
  $("sort").onchange=e=>{state.sort=e.target.value;render()};
  $("writer").value=localStorage.getItem("bankBoardWriter")||"";
  $("writer").onchange=e=>localStorage.setItem("bankBoardWriter",e.target.value);

  (async()=>{
    try{
      const loaded=await loadFirebaseFromRootIndex();memoPath=loaded.memoPath;
      const app=firebase.initializeApp(loaded.cfg,"bankWorkBoard");
      auth=app.auth();db=app.database();
      await auth.signInAnonymously();
      db.ref(memoPath).on("value",snap=>{
        state.memos=snap.val()||{};
        sync.textContent="실시간 연결 · "+new Date().toLocaleTimeString("ko-KR");
        render();
      });
      render();
    }catch(e){console.error(e);sync.textContent="연결 실패";alert("Firebase 연결 실패: "+e.message)}
  })();
})();