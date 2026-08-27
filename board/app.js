(() => {
  const byId = id => document.getElementById(id);
  const sync = byId("sync");

  function firstDefined(candidates){
    for(const fn of candidates){
      try{
        const v = fn();
        if(v !== undefined && v !== null) return v;
      }catch(e){}
    }
    return null;
  }

  // 기존 bank-map의 data.js를 최대한 자동 인식
  const rawData = firstDefined([
    () => window.BANK_BRANCHES,
    () => typeof BANK_BRANCHES !== "undefined" ? BANK_BRANCHES : undefined,
    () => typeof data !== "undefined" ? data : undefined,
    () => typeof BANK_DATA !== "undefined" ? BANK_DATA : undefined,
    () => typeof branchData !== "undefined" ? branchData : undefined,
    () => window.data,
    () => window.BANK_DATA,
    () => window.branchData
  ]);

  // 기존 config.js의 Firebase 설정을 최대한 자동 인식
  const fbConfig = firstDefined([
    () => typeof fbCfg !== "undefined" ? fbCfg : undefined,
    () => typeof firebaseConfig !== "undefined" ? firebaseConfig : undefined,
    () => typeof FIREBASE_CONFIG !== "undefined" ? FIREBASE_CONFIG : undefined,
    () => typeof config !== "undefined" && config.firebase ? config.firebase : undefined,
    () => window.fbCfg,
    () => window.firebaseConfig,
    () => window.FIREBASE_CONFIG,
    () => window.BANK_BOARD_CONFIG && window.BANK_BOARD_CONFIG.firebase
  ]);

  const memoPath = firstDefined([
    () => typeof memoBasePath !== "undefined" ? memoBasePath : undefined,
    () => typeof BANK_FIREBASE_PATH !== "undefined" ? String(BANK_FIREBASE_PATH).replace(/\/works\/?$/,"") + "/memos" : undefined,
    () => window.memoBasePath,
    () => window.BANK_MEMO_PATH,
    () => "bankMap/memos"
  ]);

  if(!Array.isArray(rawData)){
    sync.textContent = "data.js 지점정보를 읽지 못했습니다.";
    alert("기존 ../data.js에서 지점 목록을 자동 인식하지 못했습니다. 화면 캡처와 data.js 첫 10줄을 보내주세요.");
    return;
  }

  if(!fbConfig || !fbConfig.apiKey || !fbConfig.databaseURL){
    sync.textContent = "config.js Firebase 설정을 읽지 못했습니다.";
    alert("기존 ../config.js의 Firebase 설정 이름을 자동 인식하지 못했습니다. config.js 내용을 보여주시면 바로 맞춰드릴게요.");
    return;
  }

  function stableMemoId(bank,name){
    const s = `${bank||""}|${name||""}`;
    let h = 5381;
    for(let i=0;i<s.length;i++){
      h = (h * 33 + s.charCodeAt(i)) % 2147483647;
    }
    return "m_" + Math.trunc(h).toString(16).toUpperCase();
  }

  const branches = rawData.map((x,i) => ({
    id: x.id || x.branchId || String(i),
    memoId: x.memoId || x.memoID || x.memo_id || stableMemoId(x.bank, x.name),
    name: x.name || x.officeName || x.branchName || x.사무소명 || "(지점명 없음)",
    staff: x.staff || x.manager || x.assignee || x.담당직원 || x.staffName || "미지정",
    bank: x.bank || x.bankType || x.은행 || "",
    center: x.center || x.센터 || "",
    quarter: x.quarter || x.q || x.분기 || "",
    address: x.address || x.주소 || "",
    phone: x.phone || x.지점전화번호 || ""
  }));

  let app;
  try{
    app = firebase.initializeApp(fbConfig, "bankWorkBoard");
  }catch(e){
    app = firebase.app("bankWorkBoard");
  }
  const auth = app.auth();
  const db = app.database();

  const state = {memos:{},staff:"전체",search:"",status:"all",target:null};

  const esc = s => String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function fmt(ms){
    if(!ms) return "";
    try{
      return new Intl.DateTimeFormat("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(ms));
    }catch(e){return ""}
  }

  function memosFor(b){
    const obj = state.memos[b.memoId] || {};
    return Object.entries(obj).map(([key,v])=>({key,...(v||{})}))
      .sort((a,b)=>(Number(a.no)||0)-(Number(b.no)||0));
  }

  function uniqueStaff(){
    const seen=new Set(), out=[];
    branches.forEach(b=>{const s=String(b.staff||"미지정").trim()||"미지정";if(!seen.has(s)){seen.add(s);out.push(s)}});
    return out;
  }

  function nextNo(b){return memosFor(b).reduce((m,x)=>Math.max(m,Number(x.no)||0),0)+1}

  function visible(b){
    if(state.staff!=="전체" && b.staff!==state.staff) return false;
    const ms=memosFor(b);
    const q=state.search.trim().toLowerCase();
    if(q && ![b.name,b.staff,b.bank,...ms.map(x=>x.text)].join(" ").toLowerCase().includes(q)) return false;
    if(state.status==="todo" && !ms.some(x=>!x.done)) return false;
    if(state.status==="done" && !ms.some(x=>!!x.done)) return false;
    return true;
  }

  function renderTabs(){
    const el=byId("tabs");el.innerHTML="";
    ["전체",...uniqueStaff()].forEach(s=>{
      const b=document.createElement("button");
      b.className="tab"+(state.staff===s?" active":"");
      b.textContent=s;b.onclick=()=>{state.staff=s;render()};
      el.appendChild(b);
    });
  }

  function renderMemo(branch,m){
    const el=document.createElement("div");
    el.className="memo"+(m.done?" done":"");
    const writer=m.writer||m.createdBy||"";
    el.innerHTML=`
      <div class="memo-head"><span>${esc(m.no||"")}번 메모</span><span>${m.done?"완료":"진행중"}</span></div>
      <div class="memo-text">${esc(m.text||"")}</div>
      <div class="meta">${esc(fmt(m.createdAt))}${writer?" · "+esc(writer):""}${m.done&&m.completedAt?" · 완료 "+esc(fmt(m.completedAt)):""}</div>
      <div class="actions">
        <button class="${m.done?"undo":"complete"}">${m.done?"완료 해제":"완료"}</button>
        <button class="delete">삭제</button>
      </div>`;
    el.querySelector(m.done?".undo":".complete").onclick=async()=>{
      const writer=byId("writer").value||null;
      const ref=db.ref(`${memoPath}/${branch.memoId}/${m.key}`);
      if(m.done) await ref.update({done:false,completedAt:null,completedBy:null});
      else await ref.update({done:true,completedAt:firebase.database.ServerValue.TIMESTAMP,completedBy:writer});
    };
    el.querySelector(".delete").onclick=async()=>{
      if(confirm(`${branch.name}의 ${m.no||""}번 메모를 삭제할까요?`))
        await db.ref(`${memoPath}/${branch.memoId}/${m.key}`).remove();
    };
    return el;
  }

  function renderBranch(b){
    const card=document.createElement("article");card.className="branch";
    card.innerHTML=`
      <div class="branch-head">
        <div><span class="badge">${esc(b.staff)}</span><h2>${esc(b.name)}</h2>
        <div class="sub">${esc([b.bank,b.center,b.quarter?b.quarter+"분기":"",b.address].filter(Boolean).join(" · "))}</div></div>
        <button class="add">메모 추가</button>
      </div><div class="memos"></div>`;
    card.querySelector(".add").onclick=()=>openModal(b);
    const list=card.querySelector(".memos"), ms=memosFor(b);
    if(!ms.length){const n=document.createElement("div");n.className="none";n.textContent="등록된 메모가 없습니다.";list.appendChild(n)}
    else ms.forEach(m=>list.appendChild(renderMemo(b,m)));
    return card;
  }

  function render(){
    renderTabs();
    const list=branches.filter(visible);
    let mc=0,done=0,todo=0;
    list.forEach(b=>memosFor(b).forEach(m=>{mc++;m.done?done++:todo++}));
    byId("cBranches").textContent=list.length;
    byId("cMemos").textContent=mc;byId("cTodo").textContent=todo;byId("cDone").textContent=done;
    const board=byId("board");board.innerHTML="";
    byId("empty").classList.toggle("hidden",!!list.length);
    list.forEach(b=>board.appendChild(renderBranch(b)));
  }

  function openModal(b){state.target=b;byId("modalTitle").textContent=b.name+" · 메모 추가";byId("memoText").value="";byId("modal").classList.remove("hidden")}
  function closeModal(){state.target=null;byId("modal").classList.add("hidden")}
  byId("cancel").onclick=closeModal;
  byId("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
  byId("save").onclick=async()=>{
    const b=state.target,text=byId("memoText").value.trim();if(!b||!text)return;
    await db.ref(`${memoPath}/${b.memoId}`).push().set({
      no:nextNo(b),text,done:false,writer:byId("writer").value||null,
      createdAt:firebase.database.ServerValue.TIMESTAMP,completedAt:null
    });
    closeModal();
  };

  byId("search").oninput=e=>{state.search=e.target.value;render()};
  byId("status").onchange=e=>{state.status=e.target.value;render()};
  byId("writer").value=localStorage.getItem("bankBoardWriter")||"";
  byId("writer").onchange=e=>localStorage.setItem("bankBoardWriter",e.target.value);

  (async()=>{
    try{
      sync.textContent=`기존 bank-map 연결 중 · 메모경로 ${memoPath}`;
      await auth.signInAnonymously();
      db.ref(memoPath).on("value",snap=>{
        state.memos=snap.val()||{};
        sync.textContent="실시간 연결 · "+new Date().toLocaleTimeString("ko-KR");
        render();
      });
      render();
    }catch(e){
      console.error(e);sync.textContent="Firebase 연결 실패";
      alert("Firebase 익명 인증 또는 Realtime Database 설정을 확인해주세요.");
    }
  })();
})();
