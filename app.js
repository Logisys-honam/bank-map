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

  let map = null;
  let infoWindow = null;
  let activeQuarter = "all";
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
    const counts = { all: data.length, 1: 0, 2: 0, 3: 0 };
    data.forEach(x => {
      if (counts[x.quarter] !== undefined) counts[x.quarter]++;
    });

    const mapKey = { All: "all", 1: 1, 2: 2, 3: 3 };
    ["All","1","2","3"].forEach(k => {
      const el = document.getElementById("count" + k);
      if (el) el.textContent = `(${counts[mapKey[k]]})`;
    });
  }

  function loadNaver() {
    if (!cfg.naverClientId || cfg.naverClientId.includes("YOUR_NAVER")) {
      showError("config.js에 NAVER Maps Client ID를 입력해주세요.");
      els.status.textContent = "Client ID 설정 필요";
      return;
    }

    window.BANK_MAP_NAVER_READY = function () {
      initMap();
    };

    const script = document.createElement("script");
    script.src =
      `https://oapi.map.naver.com/openapi/v3/maps.js?` +
      `ncpKeyId=${encodeURIComponent(cfg.naverClientId)}` +
      `&submodules=geocoder` +
      `&callback=BANK_MAP_NAVER_READY`;

    script.async = true;
    script.onerror = () => {
      els.status.textContent = "NAVER 지도 로드 실패";
      showError("네이버 지도 API를 불러오지 못했습니다. Client ID와 Web 서비스 URL을 확인해주세요.");
    };
    document.head.appendChild(script);
  }

  function initMap() {
    if (!window.naver || !naver.maps) {
      els.status.textContent = "NAVER 지도 초기화 실패";
      showError("NAVER Maps 객체가 준비되지 않았습니다.");
      return;
    }

    map = new naver.maps.Map("map", {
      center: new naver.maps.LatLng(34.95, 127.25),
      zoom: 8,
      minZoom: 6,
      zoomControl: true,
      zoomControlOptions: {
        position: naver.maps.Position.RIGHT_CENTER
      }
    });

    infoWindow = new naver.maps.InfoWindow({
      borderWidth: 0,
      disableAnchor: false
    });

    updateCounts();
    bindUI();

    if (!naver.maps.Service || typeof naver.maps.Service.geocode !== "function") {
      els.status.textContent = "Geocoder 모듈 확인 필요";
      showError(
        "지도는 열렸지만 Geocoder 모듈이 준비되지 않았습니다. " +
        "NAVER Cloud에서 Geocoding이 체크되어 있는지 확인해주세요."
      );
      return;
    }

    geocodeAll();
  }

  function bindUI() {
    els.qbtns.forEach(btn => {
      btn.addEventListener("click", () => {
        activeQuarter = btn.dataset.quarter;
        els.qbtns.forEach(x => x.classList.toggle("active", x === btn));
        applyFilter(true);
        renderSearch();
      });
    });

    els.search.addEventListener("input", renderSearch);

    els.clear.addEventListener("click", () => {
      els.search.value = "";
      els.results.classList.add("hidden");
      els.search.focus();
    });

    document.addEventListener("click", e => {
      if (!e.target.closest(".search-wrap")) {
        els.results.classList.add("hidden");
      }
    });

    els.locate.addEventListener("click", () => {
      if (!navigator.geolocation) {
        alert("이 기기에서는 위치 기능을 사용할 수 없습니다.");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        pos => {
          map.setCenter(
            new naver.maps.LatLng(
              pos.coords.latitude,
              pos.coords.longitude
            )
          );
          map.setZoom(15);
        },
        () => alert("현재 위치를 가져오지 못했습니다.")
      );
    });
  }

  async function geocodeAll() {
    const targets = data.filter(x => String(x.address || "").trim());
    const noAddress = data.length - targets.length;

    els.status.textContent =
      `주소가 있는 ${targets.length}개 지점을 지도에 표시하는 중...`;

    for (let i = 0; i < targets.length; i++) {
      await geocodeOne(targets[i]);

      els.status.textContent =
        `지도 준비 중 ${i + 1}/${targets.length} · 성공 ${geocodedCount} · 실패 ${failedCount}`;

      await delay(60);
    }

    applyFilter(true);

    els.status.textContent =
      `표시 ${geocodedCount}개 · 주소 없음 ${noAddress}개` +
      (failedCount ? ` · 좌표변환 실패 ${failedCount}개` : "");

    if (geocodedCount === 0 && targets.length > 0) {
      showError(
        "주소 데이터는 읽었지만 좌표 변환이 모두 실패했습니다. " +
        "NAVER Cloud의 Geocoding 사용 설정 또는 브라우저 개발자도구 오류를 확인해주세요."
      );
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function geocodeOne(branch) {
    return new Promise(resolve => {
      let finished = false;

      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        failedCount++;
        console.warn("Geocode timeout:", branch.name, branch.address);
        resolve();
      }, 8000);

      try {
        naver.maps.Service.geocode(
          { query: String(branch.address).trim() },
          (status, response) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);

            if (
              status !== naver.maps.Service.Status.OK ||
              !response ||
              !response.v2 ||
              !Array.isArray(response.v2.addresses) ||
              response.v2.addresses.length === 0
            ) {
              failedCount++;
              console.warn("Geocode failed:", branch.name, branch.address, status, response);
              resolve();
              return;
            }

            const a = response.v2.addresses[0];
            const lat = Number(a.y);
            const lng = Number(a.x);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              failedCount++;
              console.warn("Invalid coordinates:", branch.name, a);
              resolve();
              return;
            }

            const pos = new naver.maps.LatLng(lat, lng);
            const marker = new naver.maps.Marker({
              position: pos,
              map: null
            });

            naver.maps.Event.addListener(marker, "click", () => {
              openBranch(branch, marker);
            });

            markerItems.push({ branch, marker, pos, lat, lng });
            geocodedCount++;
            resolve();
          }
        );
      } catch (err) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          failedCount++;
          console.error("Geocode exception:", branch.name, err);
          resolve();
        }
      }
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
      const ok =
        activeQuarter === "all" ||
        String(item.branch.quarter) === activeQuarter;

      item.marker.setMap(ok ? map : null);

      if (ok) visible.push(item.pos);
    });

    if (infoWindow) infoWindow.close();

    if (fit && visible.length) {
      fitPositions(visible);
    }
  }

  function fitPositions(positions) {
    if (positions.length === 1) {
      map.setCenter(positions[0]);
      map.setZoom(15);
      return;
    }

    const bounds = new naver.maps.LatLngBounds();
    positions.forEach(p => bounds.extend(p));

    map.fitBounds(bounds, {
      top: 60,
      right: 35,
      bottom: 35,
      left: 35
    });
  }

  function renderSearch() {
    const q = els.search.value.trim().toLowerCase();

    if (!q) {
      els.results.classList.add("hidden");
      return;
    }

    const matches = markerItems
      .filter(item =>
        activeQuarter === "all" ||
        String(item.branch.quarter) === activeQuarter
      )
      .filter(item =>
        item.branch.name.toLowerCase().includes(q)
      )
      .slice(0, 20);

    if (!matches.length) {
      els.results.innerHTML =
        `<div class="result"><small>현재 선택한 분기에서 검색 결과가 없습니다.</small></div>`;
      els.results.classList.remove("hidden");
      return;
    }

    els.results.innerHTML = "";

    matches.forEach(item => {
      const div = document.createElement("div");
      div.className = "result";

      div.innerHTML =
        `<strong>${esc(item.branch.name)}</strong>` +
        `<small>${item.branch.quarter}분기 · ${esc(months[item.branch.quarter])}</small>`;

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
