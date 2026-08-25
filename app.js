(() => {
  const cfg = window.BANK_MAP_CONFIG || {};
  const data = (window.BANK_BRANCHES || []).filter(x => x && x.name);
  const months = {
    1: "2월 · 5월 · 8월 · 11월",
    2: "3월 · 6월 · 9월 · 12월",
    3: "4월 · 7월 · 10월 · 1월"
  };

  const els = {
    status: document.getElementById("status"),
    error: document.getElementById("errorPanel"),
    search: document.getElementById("searchInput"),
    clear: document.getElementById("clearSearch"),
    results: document.getElementById("searchResults"),
    locate: document.getElementById("locateBtn"),
    qbtns: [...document.querySelectorAll(".qbtn")]
  };

  let map, infoWindow, activeQuarter = "all";
  let markerItems = [];
  let geocodedCount = 0;
  let failedCount = 0;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function normalizePhone(p) {
    return String(p || "").replace(/[^0-9+]/g, "");
  }

  function showError(msg) {
    els.error.textContent = msg;
    els.error.classList.remove("hidden");
  }

  function updateCounts() {
    const counts = {all:data.length, 1:0, 2:0, 3:0};
    data.forEach(x => { if (counts[x.quarter] !== undefined) counts[x.quarter]++; });
    ["All","1","2","3"].forEach(k => {
      const el = document.getElementById("count"+k);
      if (el) el.textContent = `(${counts[k === "All" ? "all" : k]})`;
    });
  }

  function loadNaver() {
    if (!cfg.naverClientId || cfg.naverClientId.includes("YOUR_NAVER")) {
      showError("config.js에 NAVER Maps Client ID를 입력한 뒤 다시 열어주세요.");
      els.status.textContent = "Client ID 설정 필요";
      return;
    }
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(cfg.naverClientId)}&submodules=geocoder`;
    script.async = true;
    script.onload = initMap;
    script.onerror = () => showError("네이버 지도 스크립트를 불러오지 못했습니다. Client ID와 Web 서비스 URL을 확인해주세요.");
    document.head.appendChild(script);
  }

  function initMap() {
    if (!window.naver?.maps) {
      showError("NAVER Maps API 초기화에 실패했습니다.");
      return;
    }

    map = new naver.maps.Map("map", {
      center: new naver.maps.LatLng(34.95, 127.25),
      zoom: 8,
      minZoom: 6,
      zoomControl: true,
      zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER }
    });
    infoWindow = new naver.maps.InfoWindow({ borderWidth:0, disableAnchor:false });

    updateCounts();
    bindUI();
    geocodeAll();
  }

  function bindUI() {
    els.qbtns.forEach(btn => btn.addEventListener("click", () => {
      activeQuarter = btn.dataset.quarter;
      els.qbtns.forEach(x => x.classList.toggle("active", x === btn));
      applyFilter(true);
      renderSearch();
    }));

    els.search.addEventListener("input", renderSearch);
    els.clear.addEventListener("click", () => {
      els.search.value = "";
      els.results.classList.add("hidden");
      els.search.focus();
    });

    document.addEventListener("click", e => {
      if (!e.target.closest(".search-wrap")) els.results.classList.add("hidden");
    });

    els.locate.addEventListener("click", () => {
      if (!navigator.geolocation) return alert("이 기기에서는 위치 기능을 사용할 수 없습니다.");
      navigator.geolocation.getCurrentPosition(pos => {
        map.setCenter(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        map.setZoom(15);
      }, () => alert("현재 위치를 가져오지 못했습니다."));
    });
  }

  async function geocodeAll() {
    const targets = data.filter(x => x.address);
    const noAddress = data.length - targets.length;
    els.status.textContent = `주소가 있는 ${targets.length}개 지점을 지도에 표시하는 중…`;

    // API 요청 과부하를 피하기 위해 순차 처리.
    for (const branch of targets) {
      await geocodeOne(branch);
      await new Promise(r => setTimeout(r, 35));
      els.status.textContent = `지도 준비 중 ${geocodedCount + failedCount}/${targets.length}`;
    }

    applyFilter(true);
    els.status.textContent = `표시 ${geocodedCount}개 · 주소 없음 ${noAddress}개${failedCount ? ` · 좌표변환 실패 ${failedCount}개` : ""}`;
  }

  function geocodeOne(branch) {
    return new Promise(resolve => {
      naver.maps.Service.geocode({ query: branch.address }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK || !response?.v2?.addresses?.length) {
          failedCount++;
          resolve();
          return;
        }
        const a = response.v2.addresses[0];
        const pos = new naver.maps.LatLng(Number(a.y), Number(a.x));
        const marker = new naver.maps.Marker({ position: pos, map: null });

        naver.maps.Event.addListener(marker, "click", () => openBranch(branch, marker));
        markerItems.push({branch, marker, pos});
        geocodedCount++;
        resolve();
      });
    });
  }

  function openBranch(branch, marker) {
    const phone = String(branch.phone || "").trim();
    const tel = normalizePhone(phone);
    const phoneHtml = tel
      ? `<div class="popup-phone"><a href="tel:${esc(tel)}">☎ ${esc(phone)}</a></div>`
      : `<div class="popup-phone none">전화번호 미입력</div>`;

    infoWindow.setContent(`
      <div class="popup">
        <div class="popup-title">${esc(branch.name)}</div>
        <div class="popup-quarter">${esc(branch.quarter)}분기</div>
        <div class="popup-months">점검월 : ${esc(months[branch.quarter] || "-")}</div>
        ${phoneHtml}
      </div>
    `);
    infoWindow.open(map, marker);
  }

  function applyFilter(fit) {
    const visible = [];
    markerItems.forEach(item => {
      const ok = activeQuarter === "all" || String(item.branch.quarter) === activeQuarter;
      item.marker.setMap(ok ? map : null);
      if (ok) visible.push(item.pos);
    });
    if (infoWindow) infoWindow.close();
    if (fit && visible.length) fitPositions(visible);
  }

  function fitPositions(positions) {
    if (positions.length === 1) {
      map.setCenter(positions[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new naver.maps.LatLngBounds();
    positions.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, {top:60,right:35,bottom:35,left:35});
  }

  function renderSearch() {
    const q = els.search.value.trim().toLowerCase();
    if (!q) {
      els.results.classList.add("hidden");
      return;
    }
    const matches = markerItems
      .filter(item => activeQuarter === "all" || String(item.branch.quarter) === activeQuarter)
      .filter(item => item.branch.name.toLowerCase().includes(q))
      .slice(0, 20);

    if (!matches.length) {
      els.results.innerHTML = `<div class="result"><small>현재 선택한 분기에서 검색 결과가 없습니다.</small></div>`;
      els.results.classList.remove("hidden");
      return;
    }

    els.results.innerHTML = "";
    matches.forEach(item => {
      const div = document.createElement("div");
      div.className = "result";
      div.innerHTML = `<strong>${esc(item.branch.name)}</strong><small>${item.branch.quarter}분기 · ${esc(months[item.branch.quarter])}</small>`;
      div.addEventListener("click", () => {
        item.marker.setMap(map);
        map.setCenter(item.pos);
        map.setZoom(16);
        openBranch(item.branch, item.marker);
        els.results.classList.add("hidden");
      });
      els.results.appendChild(div);
    });
    els.results.classList.remove("hidden");
  }

  loadNaver();
})();
