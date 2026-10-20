/* ============================================================
   MONITOREO — stream dominante + flota + HUD de control
   Datos: MONITOR_FLEET / MONITOR_OPS (data.js). Demo ilustrativa.
   ============================================================ */
(function monitorModule(){
  const root = document.getElementById("monitor");
  const pane = document.querySelector('[data-module-pane="monitoreo"]');
  if(!root || !pane || typeof MONITOR_FLEET === "undefined") return;

  const video = document.getElementById("monitor-video");
  const listEl = document.getElementById("monitor-list");
  const camgrid = document.getElementById("monitor-camgrid");
  const camTiles = document.getElementById("monitor-camgrid-tiles");
  const camFocusBtn = document.getElementById("monitor-camgrid-focus");
  const countEl = document.getElementById("monitor-count");
  const searchEl = document.getElementById("monitor-search");
  const filterBtn = document.getElementById("monitor-filter-btn");
  const filterMenu = document.getElementById("monitor-filter-menu");
  const filterLabel = document.getElementById("monitor-filter-label");
  const mapSvg = document.getElementById("monitor-map-svg");
  const toastEl = document.getElementById("monitor-toast");
  const sticksEl = document.getElementById("monitor-sticks");
  const modeHint = document.getElementById("monitor-mode-hint");
  const estopBtn = document.getElementById("monitor-estop");
  const liveEl = document.getElementById("monitor-live");
  const battFill = document.getElementById("monitor-batt-fill");
  const battBar = battFill && battFill.parentElement;
  const battSection = document.querySelector(".monitor__unit-batt");
  const battBadge = document.getElementById("monitor-batt-badge");
  const battBadgeFill = battBadge && battBadge.querySelector(".monitor__batt-badge-fill");
  const opsChip = document.getElementById("monitor-ops-chip");
  const telemToggle = document.getElementById("monitor-telem-toggle");
  const telemMore = document.getElementById("monitor-telem-more");
  const logEl = document.getElementById("monitor-log");
  const logCard = document.getElementById("monitor-log-card");
  const logOpenBtn = document.getElementById("monitor-log-open");
  const logCloseBtn = document.getElementById("monitor-log-close");
  const tlRoot = document.getElementById("monitor-timeline");
  const tlOpenBtn = document.getElementById("monitor-tl-open");
  const tlCloseBtn = document.getElementById("monitor-tl-close");
  const tlFilm = document.getElementById("monitor-tl-film");
  const tlAlerts = document.getElementById("monitor-tl-alerts");
  const tlHours = document.getElementById("monitor-tl-hours");
  const tlPlayhead = document.getElementById("monitor-tl-playhead");
  const tlTrack = document.getElementById("monitor-tl-track");
  const tlClock = document.getElementById("monitor-tl-clock");
  const tlMode = document.getElementById("monitor-tl-mode");
  const tlPlayBtn = document.getElementById("monitor-tl-play");
  const tlGoLiveBtn = document.getElementById("monitor-tl-golive");
  const viewBtns = root.querySelectorAll(".monitor__view-btn");
  const splitter = document.getElementById("monitor-splitter");
  let logVisible = true;
  let tlVisible = false;
  let tlReplay = false;
  let tlPlaying = false;
  let tlPct = 100;
  let tlTimer = null;
  let tlModel = null;

  /* Still de escena (calle/incidente), no foto del robot. */
  const TL_SCENE_THUMB = "assets/monitor-streetview.jpg";

  const FLEET_W_MIN = 224;  /* ~14rem */
  const FLEET_W_MAX = 640;  /* ~40rem */

  /* Fallback de streams si una unidad no trae video (repetir está bien en demo). */
  const FALLBACK_STREAMS = [
    "assets/perro1.mp4", "assets/perro2.mp4", "assets/dron1.mp4", "assets/dron2.mp4",
    "assets/accidente-perro.mp4", "assets/accidente-dron.mp4", "assets/accidente-humanoide.mp4"
  ];

  const typeLabel = t =>
    (typeof DEVICE_TYPES !== "undefined" && DEVICE_TYPES[t]?.label) || t;

  const opsMeta = ops =>
    (typeof MONITOR_OPS !== "undefined" && MONITOR_OPS[ops]) || { label:ops, tone:"info" };

  /* Amplía bitácoras cortas para demo de listado a pantalla completa. */
  const padUnitLog = (log, code) => {
    const base = (log || []).map(e => Object.assign({}, e));
    const fillers = [
      "Heartbeat C5 OK", "Calibración IMU", "Sincronización NTP",
      "Chequeo de cámaras", "Buffer de video limpio", "Ruta local actualizada",
      "Latencia de enlace estable", "Modo eco evaluado", "Sensores LiDAR OK",
      "Temperatura nominal", "GPS fix 3D", "Bitácora enviada a VIGIA",
      "Sin obstáculos cercanos", "Velocidad dentro de rango", "Audio canal abierto",
      "Snapshot archivado", "Prioridad de misión intacta", "Watchdog OK"
    ];
    let guard = 0;
    while(base.length < 42 && guard < 80){
      const i = base.length;
      const hh = 7 + Math.floor(i / 6);
      const mm = String((i * 7) % 60).padStart(2, "0");
      base.unshift({
        t:`${String(Math.min(11, hh)).padStart(2,"0")}:${mm}`,
        text:`${fillers[i % fillers.length]} · ${code}`
      });
      guard++;
    }
    return base;
  };

  /* Copia mutable de la flota para simulación (batería, progreso, modo). */
  const fleet = MONITOR_FLEET.map((u, i) => Object.assign({}, u, {
    stream: u.stream || FALLBACK_STREAMS[i % FALLBACK_STREAMS.length],
    log: padUnitLog(u.log, u.code),
    route: (u.route || []).map(p => p.slice()),
    alert: u.alert ? Object.assign({}, u.alert) : null
  }));

  let focusId = fleet.find(u => u.ops === "mission")?.id || fleet[0]?.id || null;
  let search = "";
  let filterOps = "";
  let gridLayout = 1; /* 1 | 2 | 4 | 9 */
  let camGridKey = "";
  let tickTimer = null;
  let toastTimer = null;
  let estopLatched = false;

  const byId = id => fleet.find(u => u.id === id);
  const focused = () => byId(focusId);

  const sortFleet = list => list.slice().sort((a, b) => {
    const ra = (MONITOR_OPS_RANK && MONITOR_OPS_RANK[a.ops] != null)
      ? MONITOR_OPS_RANK[a.ops] : 9;
    const rb = (MONITOR_OPS_RANK && MONITOR_OPS_RANK[b.ops] != null)
      ? MONITOR_OPS_RANK[b.ops] : 9;
    if(ra !== rb) return ra - rb;
    if(!!a.alert !== !!b.alert) return a.alert ? -1 : 1;
    return a.code.localeCompare(b.code);
  });

  const filtered = () => {
    const q = search.trim().toLowerCase();
    return sortFleet(fleet.filter(u => {
      if(filterOps && u.ops !== filterOps) return false;
      if(!q) return true;
      return (u.code + " " + u.name + " " + typeLabel(u.type)).toLowerCase().includes(q);
    }));
  };

  const syncFilterUi = () => {
    if(filterLabel){
      if(!filterOps){
        filterLabel.textContent = "Todos";
        filterLabel.className = "monitor__filter-label";
      }else{
        const m = opsMeta(filterOps);
        filterLabel.className = `monitor__filter-label monitor__chip monitor__chip--${m.tone}`;
        filterLabel.textContent = m.label;
      }
    }
    filterBtn?.classList.toggle("is-filtered", !!filterOps);
    filterMenu?.querySelectorAll(".monitor__filter-opt").forEach(opt => {
      opt.classList.toggle("is-active", (opt.dataset.ops || "") === filterOps);
      opt.setAttribute("aria-selected",
        (opt.dataset.ops || "") === filterOps ? "true" : "false");
    });
  };

  const setFilterMenuOpen = open => {
    if(!filterMenu || !filterBtn) return;
    filterMenu.hidden = !open;
    filterBtn.classList.toggle("is-open", open);
    filterBtn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const fillFilter = () => {
    if(!filterMenu || filterMenu.dataset.ready) return;
    const opts = [
      { key:"", label:"Todos", tone:null },
      ...Object.keys(MONITOR_OPS || {}).map(k => ({
        key:k, label:MONITOR_OPS[k].label, tone:MONITOR_OPS[k].tone
      }))
    ];
    filterMenu.innerHTML = opts.map(o => {
      const chip = o.tone
        ? `<span class="monitor__chip monitor__chip--${o.tone}">${o.label}</span>`
        : `<span class="monitor__chip">${o.label}</span>`;
      return `<button type="button" class="monitor__filter-opt" role="option"
               data-ops="${o.key}" aria-selected="false">${chip}</button>`;
    }).join("");
    filterMenu.dataset.ready = "1";
    syncFilterUi();
  };

  const renderSummary = () => {
    if(countEl) countEl.textContent = `${fleet.length} unidades`;
  };

  const thumbFor = u => {
    if(u.type === "dron") return u.modelImg || "assets/dron-compact.jpg";
    if(u.type === "humanoide") return u.modelImg || "assets/humanoide.jpg";
    return u.modelImg || "assets/saimon-robot.jpg";
  };

  const isMultiCam = () => gridLayout > 1;

  const gridUnits = () => {
    const rows = filtered();
    const ordered = rows.slice().sort((a, b) => {
      if(a.id === focusId) return -1;
      if(b.id === focusId) return 1;
      return 0;
    });
    return ordered.slice(0, gridLayout);
  };

  const clampFleetW = px => {
    const maxByLayout = Math.max(FLEET_W_MIN, Math.floor(root.clientWidth * 0.55));
    return Math.round(Math.min(FLEET_W_MAX, maxByLayout, Math.max(FLEET_W_MIN, px)));
  };

  const setFleetWidth = px => {
    const w = clampFleetW(px);
    root.style.setProperty("--monitor-fleet-w", w + "px");
    root.classList.add("is-fleet-resized");
    if(splitter){
      splitter.setAttribute("aria-valuenow", String(w));
      splitter.setAttribute("aria-valuetext", `${w} píxeles`);
    }
  };

  const syncSplitterAria = () => {
    if(!splitter) return;
    const raw = getComputedStyle(root).getPropertyValue("--monitor-fleet-w").trim();
    const px = raw.endsWith("rem")
      ? parseFloat(raw) * 16
      : parseFloat(raw);
    if(!Number.isFinite(px)) return;
    splitter.setAttribute("aria-valuenow", String(Math.round(px)));
    splitter.setAttribute("aria-valuemin", String(FLEET_W_MIN));
    splitter.setAttribute("aria-valuemax", String(FLEET_W_MAX));
  };

  const applyGridLayout = () => {
    root.dataset.grid = String(gridLayout);
    if(camTiles) camTiles.dataset.cols = String(gridLayout);
    if(camgrid) camgrid.hidden = !isMultiCam();
    viewBtns.forEach(btn => {
      const on = Number(btn.getAttribute("data-grid")) === gridLayout;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    /* Timeline solo en vista 1 cámara. */
    if(isMultiCam()){
      if(typeof setTlVisible === "function" && tlVisible) setTlVisible(false);
      if(tlOpenBtn) tlOpenBtn.hidden = true;
    }else if(tlOpenBtn && !tlVisible){
      tlOpenBtn.hidden = false;
    }
    if(isMultiCam()){
      if(video) video.pause();
      renderCamGrid(true);
    }else{
      pauseCamVideos();
      bindStream(focused());
    }
    requestAnimationFrame(syncSplitterAria);
  };

  const pauseCamVideos = () => {
    if(!camTiles) return;
    camTiles.querySelectorAll("video").forEach(v => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
  };

  const streamFor = u =>
    u.stream || FALLBACK_STREAMS[Math.abs((u.code || "").length) % FALLBACK_STREAMS.length];

  const syncTileMedia = (tile, u) => {
    let media = tile.querySelector(".monitor__tile-media");
    const src = streamFor(u);
    if(!media || media.tagName !== "VIDEO"){
      const v = document.createElement("video");
      v.className = "monitor__tile-media";
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      if(media) media.replaceWith(v); else tile.prepend(v);
      media = v;
    }
    if(media.getAttribute("src") !== src) media.src = src;
    media.play().catch(() => {});
  };

  const renderCamGrid = (forceRebuild) => {
    if(!camTiles || !isMultiCam()) return;
    const rows = gridUnits();
    const key = gridLayout + "|" + rows.map(u => u.id).join("|");
    if(camTiles) camTiles.dataset.cols = String(gridLayout);

    if(forceRebuild || key !== camGridKey){
      camGridKey = key;
      if(!rows.length){
        camTiles.innerHTML = `<p class="monitor__camgrid-empty">Sin coincidencias</p>`;
        return;
      }
      camTiles.innerHTML = rows.map(u => {
        const m = opsMeta(u.ops);
        const alertCls = (u.ops === "alert" || u.alert) ? " is-alert" : "";
        const active = u.id === focusId ? " is-active" : "";
        const offline = u.ops === "offline";
        const badge = offline
          ? `<span class="monitor__tile-badge monitor__tile-badge--off">Sin señal</span>`
          : `<span class="monitor__tile-badge"><i aria-hidden="true"></i>En vivo</span>`;
        return `<button type="button" class="monitor__tile${active}${alertCls}${offline ? " is-offline" : ""}"
                  role="listitem" data-id="${u.id}" aria-pressed="${u.id === focusId}">
          <span class="monitor__tile-veil" aria-hidden="true"></span>
          ${badge}
          <span class="monitor__tile-bar">
            <span class="monitor__tile-code">${u.code}</span>
            <span class="monitor__chip monitor__chip--${m.tone}">${m.label}</span>
          </span>
        </button>`;
      }).join("");
    }

    camTiles.querySelectorAll(".monitor__tile").forEach(tile => {
      const u = byId(tile.dataset.id);
      if(!u) return;
      const m = opsMeta(u.ops);
      const offline = u.ops === "offline";
      tile.classList.toggle("is-active", u.id === focusId);
      tile.classList.toggle("is-alert", !!(u.ops === "alert" || u.alert));
      tile.classList.toggle("is-offline", offline);
      tile.setAttribute("aria-pressed", u.id === focusId ? "true" : "false");

      const barChip = tile.querySelector(".monitor__tile-bar .monitor__chip");
      if(barChip){
        barChip.className = `monitor__chip monitor__chip--${m.tone}`;
        barChip.textContent = m.label;
      }

      let badge = tile.querySelector(".monitor__tile-badge");
      if(!badge){
        badge = document.createElement("span");
        badge.className = "monitor__tile-badge";
        tile.appendChild(badge);
      }
      if(offline){
        badge.className = "monitor__tile-badge monitor__tile-badge--off";
        badge.innerHTML = "Sin señal";
      }else{
        badge.className = "monitor__tile-badge";
        badge.innerHTML = `<i aria-hidden="true"></i>En vivo`;
      }

      syncTileMedia(tile, u);
    });
  };

  const renderList = () => {
    if(!listEl) return;
    const rows = filtered();
    listEl.innerHTML = rows.map(u => {
      const m = opsMeta(u.ops);
      const modeTxt = u.mode === "manual" ? "Manual" : "Autónomo";
      const alertCls = (u.ops === "alert" || u.alert) ? " is-alert" : "";
      const active = u.id === focusId ? " is-active" : "";
      const low = u.battery <= 20 ? " is-low" : "";
      return `<li role="none">
        <button type="button" class="monitor__item${active}${alertCls}"
                role="option" aria-selected="${u.id === focusId}" data-id="${u.id}">
          <img class="monitor__thumb" src="${thumbFor(u)}" alt="" width="56" height="40" decoding="async">
          <span class="monitor__item-body">
            <span class="monitor__item-code">
              ${u.code}<span class="monitor__item-sep" aria-hidden="true"> / </span><span class="monitor__item-type">${typeLabel(u.type)}</span>
            </span>
            <span class="monitor__item-row">
              <span class="monitor__chip monitor__chip--${m.tone}">${m.label}</span>
              <span class="monitor__batt${low}">${Math.round(u.battery)}%</span>
              <span class="monitor__item-mode">${modeTxt}</span>
            </span>
          </span>
        </button>
      </li>`;
    }).join("") || `<li class="monitor__empty">Sin coincidencias</li>`;
  };

  const renderMinimap = u => {
    if(!mapSvg || !u) return;
    const pts = u.route && u.route.length ? u.route : [[50,50]];
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
    const idx = Math.min(pts.length - 1, Math.floor((u.routeProgress || 0) * (pts.length - 1)));
    const t = (u.routeProgress || 0) * (pts.length - 1) - idx;
    const a = pts[idx];
    const b = pts[Math.min(pts.length - 1, idx + 1)];
    const x = a[0] + (b[0] - a[0]) * (t || 0);
    const y = a[1] + (b[1] - a[1]) * (t || 0);
    const dest = pts[pts.length - 1];
    mapSvg.innerHTML = `
      <path class="monitor__map-route" d="${path}" fill="none" stroke-linecap="round" stroke-dasharray="2.5 2"/>
      <circle class="monitor__map-dest" cx="${dest[0]}" cy="${dest[1]}" r="2.6"/>
      <circle class="monitor__map-unit" cx="${x}" cy="${y}" r="3.4"/>
      <polygon class="monitor__map-head" points="0,-5 4,4 -4,4"
        transform="translate(${x} ${y}) rotate(${u.heading || 0})"/>`;
  };

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  };

  const isLogAlert = e =>
    e.tone === "danger" || e.alert === true ||
    /\balerta\b|crític|\boffline\b|enlace perdido|sin conexión|emergencia|detener|sin heartbeat|ráfaga/i.test(e.text || "");

  const parseHm = t => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
    if(!m) return null;
    return (+m[1]) * 60 + (+m[2]);
  };
  const formatHm = mins => {
    const n = ((Math.round(mins) % 1440) + 1440) % 1440;
    const h = Math.floor(n / 60);
    const m = n % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  };
  const formatHms = mins => `${formatHm(mins)}:00`;

  const buildTimelineModel = u => {
    const log = u.log || [];
    const times = log.map(e => parseHm(e.t)).filter(v => v != null);
    const endMin = times.length ? Math.max.apply(null, times) : 11 * 60 + 28;
    const windowMin = (u.recording && u.recording.windowMin) || 240;
    const startMin = endMin - windowMin;
    const thumb = (u.recording && u.recording.thumb) || TL_SCENE_THUMB;
    const frameCount = 32;
    const step = windowMin / frameCount;
    const frames = [];
    for(let i = 0; i < frameCount; i++){
      const tMin = startMin + step * (i + 0.5);
      frames.push({
        t: formatHm(tMin),
        tMin,
        thumb,
        pct: ((i + 0.5) / frameCount) * 100
      });
    }
    const alerts = [];
    const seen = new Set();
    log.forEach(e => {
      if(!isLogAlert(e)) return;
      const tMin = parseHm(e.t);
      if(tMin == null || tMin < startMin || tMin > endMin) return;
      const key = `${e.t}|${e.text}`;
      if(seen.has(key)) return;
      seen.add(key);
      const pct = ((tMin - startMin) / windowMin) * 100;
      const short = String(e.text || "Alerta").replace(/^Alerta( de| preliminar)?\s*/i, "").slice(0, 22);
      alerts.push({ t: e.t, tMin, pct, label: short || "Alerta", text: e.text });
    });
    return { startMin, endMin, windowMin, thumb, frames, alerts };
  };

  const stopTlPlayback = () => {
    tlPlaying = false;
    if(tlTimer){ clearInterval(tlTimer); tlTimer = null; }
    const playIcon = tlPlayBtn && tlPlayBtn.querySelector(".monitor__tl-icon-play");
    const pauseIcon = tlPlayBtn && tlPlayBtn.querySelector(".monitor__tl-icon-pause");
    if(playIcon) playIcon.hidden = false;
    if(pauseIcon) pauseIcon.hidden = true;
    tlPlayBtn?.classList.remove("is-active");
  };

  const syncLiveBadge = () => {
    if(!liveEl) return;
    const span = liveEl.querySelector("span");
    const u = focused();
    const offline = u && u.ops === "offline";
    liveEl.classList.toggle("is-offline", !!offline);
    liveEl.classList.toggle("is-replay", !offline && tlReplay);
    if(span){
      span.textContent = offline ? "OFFLINE" : (tlReplay ? "REPLAY" : "EN VIVO");
    }
  };

  const applyTlPosition = (pct, { fromUser } = {}) => {
    if(!tlModel) return;
    tlPct = Math.max(0, Math.min(100, pct));
    const atLive = tlPct >= 99.2;
    if(atLive){
      tlReplay = false;
      stopTlPlayback();
      if(video && focused()?.ops !== "offline") video.play().catch(() => {});
    }else{
      tlReplay = true;
      if(fromUser) stopTlPlayback();
      if(video) video.pause();
    }
    const tMin = tlModel.startMin + (tlModel.windowMin * tlPct) / 100;
    if(tlPlayhead) tlPlayhead.style.left = `${tlPct}%`;
    if(tlClock) tlClock.textContent = formatHms(tMin);
    if(tlMode){
      tlMode.textContent = tlReplay ? "REPLAY" : "EN VIVO";
      tlMode.classList.toggle("is-replay", tlReplay);
    }
    if(tlTrack){
      tlTrack.setAttribute("aria-valuenow", String(Math.round(tlPct)));
      tlTrack.setAttribute("aria-valuetext", formatHm(tMin));
    }
    if(tlFilm){
      const frames = tlFilm.querySelectorAll(".monitor__tl-frame");
      if(frames.length){
        const idx = Math.min(frames.length - 1, Math.max(0, Math.floor((tlPct / 100) * frames.length)));
        frames.forEach((el, i) => el.classList.toggle("is-active", i === idx));
      }
    }
    tlGoLiveBtn?.classList.toggle("is-active", !tlReplay);
    syncLiveBadge();
  };

  const goTlLive = () => {
    stopTlPlayback();
    applyTlPosition(100);
    if(video && focused()?.ops !== "offline") video.play().catch(() => {});
  };

  const pctFromPointer = e => {
    if(!tlTrack) return 100;
    const rect = tlTrack.getBoundingClientRect();
    if(!rect.width) return tlPct;
    return ((e.clientX - rect.left) / rect.width) * 100;
  };

  const renderTimeline = u => {
    if(!tlFilm || !u) return;
    tlModel = buildTimelineModel(u);
    tlFilm.style.backgroundImage = "";
    tlFilm.innerHTML = tlModel.frames.map((f, i) =>
      `<span class="monitor__tl-frame" data-i="${i}" style="background-image:url('${f.thumb}')">
        <time>${f.t}</time>
      </span>`
    ).join("");
    if(tlAlerts){
      tlAlerts.innerHTML = tlModel.alerts.map((a, i) =>
        `<button type="button" class="monitor__tl-mark" data-i="${i}"
           style="left:${a.pct.toFixed(2)}%" data-label="Alerta"
           title="${a.t} · ${a.text}" aria-label="Alerta ${a.t}: ${a.text}">
           <span class="monitor__tl-mark-dot" aria-hidden="true"></span>
           <span class="monitor__tl-mark-flag">Alerta</span>
         </button>`
      ).join("");
    }
    if(tlHours){
      const mid = tlModel.startMin + tlModel.windowMin / 2;
      tlHours.innerHTML =
        `<span>${formatHm(tlModel.startMin)}</span>` +
        `<span>${formatHm(mid)}</span>` +
        `<span>${formatHm(tlModel.endMin)}</span>`;
    }
    /* Mantener posición relativa al cambiar de unidad solo si seguimos en replay. */
    applyTlPosition(tlReplay ? tlPct : 100);
  };

  const setTlVisible = visible => {
    tlVisible = !!visible;
    if(tlRoot) tlRoot.hidden = !tlVisible;
    root.classList.toggle("is-tl-open", tlVisible);
    if(tlOpenBtn){
      tlOpenBtn.hidden = tlVisible;
      tlOpenBtn.setAttribute("aria-expanded", tlVisible ? "true" : "false");
    }
    if(tlCloseBtn) tlCloseBtn.setAttribute("aria-expanded", tlVisible ? "true" : "false");
    if(tlVisible){
      const u = focused();
      if(u) renderTimeline(u);
    }else{
      goTlLive();
    }
  };

  const startTlPlayback = () => {
    if(!tlModel || !tlReplay) return;
    stopTlPlayback();
    tlPlaying = true;
    const playIcon = tlPlayBtn && tlPlayBtn.querySelector(".monitor__tl-icon-play");
    const pauseIcon = tlPlayBtn && tlPlayBtn.querySelector(".monitor__tl-icon-pause");
    if(playIcon) playIcon.hidden = true;
    if(pauseIcon) pauseIcon.hidden = false;
    tlPlayBtn?.classList.add("is-active");
    tlTimer = setInterval(() => {
      const next = tlPct + (100 / tlModel.windowMin) * 0.35;
      if(next >= 100){
        applyTlPosition(100);
        stopTlPlayback();
        return;
      }
      applyTlPosition(next);
    }, 120);
  };

  const renderLog = u => {
    if(!logEl) return;
    const entries = (u.log || []).slice().reverse();
    logEl.innerHTML = entries.map(e => {
      const alert = isLogAlert(e);
      return `<li class="${alert ? "is-alert" : ""}">
        <span class="monitor__log-dot" aria-hidden="true"></span>
        <time>${e.t}</time>
        <span class="monitor__log-text">
          ${alert ? `<span class="monitor__log-flag">Alerta</span>` : ""}
          ${e.text}
        </span>
      </li>`;
    }).join("")
      || `<li class="monitor__log-empty">
        <span class="monitor__log-dot" aria-hidden="true"></span>
        <span class="monitor__log-text" style="opacity:.75">Sin eventos</span>
      </li>`;
  };

  const controlEl = document.getElementById("monitor-control");
  const controlManual = document.getElementById("monitor-control-manual");

  const applyModeUi = u => {
    const autoBtn = document.getElementById("monitor-mode-auto");
    const manBtn = document.getElementById("monitor-mode-manual");
    const isManual = u.mode === "manual";
    const offline = u.ops === "offline";
    if(autoBtn) autoBtn.classList.toggle("is-active", !isManual);
    if(manBtn) manBtn.classList.toggle("is-active", isManual);
    if(controlEl) controlEl.dataset.expanded = isManual ? "true" : "false";
    if(controlManual) controlManual.hidden = !isManual;
    if(sticksEl) sticksEl.classList.toggle("is-disabled", offline);
    if(modeHint){
      modeHint.textContent = offline
        ? "Sin enlace — control no disponible"
        : "Operador en control manual";
    }
    if(estopBtn) estopBtn.disabled = offline;
  };

  const showToast = (msg, danger) => {
    if(!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = msg;
    toastEl.classList.toggle("is-danger", !!danger);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
  };

  const bindStream = u => {
    if(!video || !u) return;
    if(isMultiCam()){
      video.pause();
      return;
    }
    const offline = u.ops === "offline";
    if(offline){
      tlReplay = false;
      stopTlPlayback();
      video.removeAttribute("src");
      video.load();
      syncLiveBadge();
      return;
    }
    const src = streamFor(u);
    if(video.getAttribute("src") !== src){
      video.src = src;
    }
    if(tlReplay) video.pause();
    else video.play().catch(() => {});
    syncLiveBadge();
  };

  const renderFocus = () => {
    const u = focused();
    if(!u) return;
    if(isMultiCam()){
      renderCamGrid(false);
      return;
    }
    const m = opsMeta(u.ops);

    setText("monitor-id", u.code);
    setText("monitor-name", u.name);
    if(opsChip){
      opsChip.textContent = m.label;
      opsChip.className = `monitor__chip monitor__chip--${m.tone}`;
    }
    const battPct = Math.round(u.battery);
    setText("monitor-battery", `${battPct}%`);
    setText("monitor-batt-pct", `${battPct}%`);
    setText("monitor-autonomy", u.autonomyMin > 0 ? `${Math.round(u.autonomyMin)} min` : "—");
    setText("monitor-signal", `${Math.round(u.signal)}%`);
    setText("monitor-speed", `${u.speed.toFixed(1)} km/h`);
    setText("monitor-heading", `${Math.round(u.heading)}°`);
    setText("monitor-uptime", u.uptime || "—");
    setText("monitor-mission", u.mission || "Sin misión");
    const dist = u.ops === "mission" || u.ops === "returning"
      ? `${Math.max(40, Math.round((1 - (u.routeProgress || 0)) * 520))} m al destino`
      : "—";
    setText("monitor-distance", dist);

    const battLow = u.battery <= 20;
    const battMid = u.battery > 20 && u.battery <= 40;
    if(battFill && battBar){
      battFill.style.width = Math.max(0, Math.min(100, u.battery)) + "%";
      battBar.classList.toggle("is-low", battLow);
      battBar.classList.toggle("is-mid", battMid);
    }
    if(battSection){
      battSection.classList.toggle("is-low", battLow);
      battSection.classList.toggle("is-mid", battMid);
    }
    if(battBadge){
      battBadge.classList.toggle("is-low", battLow);
      battBadge.classList.toggle("is-mid", battMid);
      battBadge.setAttribute("title", `Batería ${battPct}%`);
    }
    if(battBadgeFill){
      /* Ancho del fill interno del icono (rect máx. 14 en viewBox). */
      const w = Math.max(1.2, Math.min(14, (battPct / 100) * 14));
      battBadgeFill.setAttribute("width", String(w.toFixed(1)));
    }

    renderMinimap(u);
    renderLog(u);
    if(tlVisible) renderTimeline(u);
    else syncLiveBadge();
    applyModeUi(u);
    bindStream(u);
    if(estopBtn) estopBtn.classList.toggle("is-latched", estopLatched);
  };

  const selectUnit = id => {
    if(!byId(id)) return;
    const changed = focusId !== id;
    focusId = id;
    estopLatched = false;
    if(changed){
      tlReplay = false;
      tlPct = 100;
      stopTlPlayback();
    }
    renderList();
    if(isMultiCam()) renderCamGrid(false);
    else renderFocus();
  };

  const openFocusView = id => {
    if(id){
      focusId = id;
      estopLatched = false;
    }
    gridLayout = 1;
    applyGridLayout();
    renderList();
    renderFocus();
  };

  const setMode = mode => {
    const u = focused();
    if(!u || u.ops === "offline") return;
    u.mode = mode === "manual" ? "manual" : "auto";
    if(u.mode === "manual"){
      u.ops = "manual";
      u.log.push({ t: stamp(), text:"Operador tomó control manual" });
      showToast("Control manual activo", false);
    }else{
      u.ops = u.alert ? "alert" : (u.incidentId ? "mission" : "patrol");
      u.log.push({ t: stamp(), text:"Control devuelto a VIGIA" });
      showToast("Modo autónomo reanudado", false);
    }
    renderSummary();
    renderList();
    renderFocus();
  };

  const stamp = () => {
    const d = new Date();
    return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  };

  const emergencyStop = () => {
    const u = focused();
    if(!u || u.ops === "offline") return;
    estopLatched = true;
    u.speed = 0;
    u.mode = "manual";
    u.ops = "manual";
    u.log.push({ t: stamp(), text:"DETENER de emergencia", tone:"danger" });
    showToast("Unidad detenida — emergencia", true);
    renderSummary();
    renderList();
    renderFocus();
  };

  const quickAction = kind => {
    const u = focused();
    if(!u || u.ops === "offline") return;
    if(kind === "base"){
      u.ops = "returning";
      u.mode = "auto";
      u.routeProgress = Math.min(0.2, u.routeProgress || 0);
      u.log.push({ t: stamp(), text:"Orden: regresar a base" });
      showToast("Retorno a base iniciado", false);
    }else if(kind === "pose"){
      u.speed = 0;
      u.log.push({ t: stamp(), text:"Pose standby" });
      showToast("Pose standby", false);
    }
    renderSummary();
    renderList();
    renderFocus();
  };

  /* Joysticks: solo teatro visual + ligera telemetría en manual. */
  const bindPad = (padId, knobId, onMove) => {
    const pad = document.getElementById(padId);
    const knob = document.getElementById(knobId);
    if(!pad || !knob) return;
    let active = false;

    const setKnob = (nx, ny) => {
      const max = 28;
      knob.style.transform = `translate(${nx * max}px, ${ny * max}px)`;
    };

    const fromEvent = e => {
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      let dx = (clientX - cx) / (rect.width / 2);
      let dy = (clientY - cy) / (rect.height / 2);
      const mag = Math.hypot(dx, dy) || 1;
      if(mag > 1){ dx /= mag; dy /= mag; }
      setKnob(dx, dy);
      onMove(dx, dy);
    };

    const end = () => {
      active = false;
      pad.classList.remove("is-active");
      setKnob(0, 0);
      onMove(0, 0);
    };

    pad.addEventListener("pointerdown", e => {
      if(sticksEl && sticksEl.hidden) return;
      active = true;
      pad.classList.add("is-active");
      pad.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    pad.addEventListener("pointermove", e => { if(active) fromEvent(e); });
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
  };

  bindPad("monitor-pad-drive", "monitor-knob-drive", (dx, dy) => {
    const u = focused();
    if(!u || u.mode !== "manual") return;
    u.speed = Math.round(Math.hypot(dx, dy) * 8 * 10) / 10;
    if(Math.abs(dx) > 0.05) u.heading = (u.heading + dx * 3 + 360) % 360;
    setText("monitor-speed", `${u.speed.toFixed(1)} km/h`);
    setText("monitor-heading", `${Math.round(u.heading)}°`);
  });

  bindPad("monitor-pad-look", "monitor-knob-look", () => {});

  const tick = () => {
    fleet.forEach(u => {
      if(u.ops === "offline" || u.ops === "charging"){
        if(u.ops === "charging" && u.battery < 100){
          u.battery = Math.min(100, u.battery + 0.15);
        }
        return;
      }
      if(u.battery > 0){
        u.battery = Math.max(0, u.battery - (u.mode === "manual" ? 0.04 : 0.02));
        if(u.autonomyMin > 0) u.autonomyMin = Math.max(0, u.autonomyMin - 0.02);
      }
      if(u.battery <= 15 && u.ops !== "alert" && u.ops !== "manual"){
        u.ops = "alert";
        u.alert = { kind:"battery", message:`Batería baja · ${Math.round(u.battery)}%` };
      }
      if((u.ops === "mission" || u.ops === "patrol" || u.ops === "returning") && u.mode === "auto"){
        u.routeProgress = Math.min(0.98, (u.routeProgress || 0) + 0.0025);
      }
    });

    /* Aviso contextual ocasional sobre el foco */
    if(Math.random() < 0.04){
      const u = focused();
      if(u && u.alert) showToast(u.alert.message, u.alert.kind !== "obstacle");
      else if(u && u.ops === "mission") showToast("Obstáculo menor · esquivando", false);
    }

    renderSummary();
    renderList();
    if(isMultiCam()) renderCamGrid(false);
    else renderFocus();
  };

  const startSim = () => {
    if(tickTimer) return;
    tickTimer = setInterval(tick, 2000);
  };

  const stopSim = () => {
    clearInterval(tickTimer);
    tickTimer = null;
    if(video) video.pause();
    pauseCamVideos();
  };

  /* —— Eventos UI —— */
  listEl?.addEventListener("click", e => {
    const btn = e.target.closest("[data-id]");
    if(btn) selectUnit(btn.dataset.id);
  });

  viewBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const next = Number(btn.getAttribute("data-grid"));
      if(!next || next === gridLayout) return;
      gridLayout = next;
      applyGridLayout();
      renderList();
      if(!isMultiCam()) renderFocus();
    });
  });

  camTiles?.addEventListener("click", e => {
    const tile = e.target.closest(".monitor__tile[data-id]");
    if(tile) selectUnit(tile.dataset.id);
  });

  camTiles?.addEventListener("dblclick", e => {
    const tile = e.target.closest(".monitor__tile[data-id]");
    if(tile) openFocusView(tile.dataset.id);
  });

  camFocusBtn?.addEventListener("click", () => openFocusView(focusId));

  telemToggle?.addEventListener("click", () => {
    if(!telemMore) return;
    const open = telemMore.hidden;
    telemMore.hidden = !open;
    telemToggle.setAttribute("aria-expanded", open ? "true" : "false");
    telemToggle.setAttribute("aria-label",
      open ? "Ocultar telemetría" : "Mostrar más telemetría");
  });

  const setLogVisible = visible => {
    logVisible = !!visible;
    if(logCard) logCard.hidden = !logVisible;
    if(logOpenBtn){
      logOpenBtn.hidden = logVisible;
      logOpenBtn.setAttribute("aria-expanded", logVisible ? "true" : "false");
    }
    if(logCloseBtn) logCloseBtn.setAttribute("aria-expanded", logVisible ? "true" : "false");
  };
  logCloseBtn?.addEventListener("click", () => setLogVisible(false));
  logOpenBtn?.addEventListener("click", () => setLogVisible(true));
  setLogVisible(false);

  tlCloseBtn?.addEventListener("click", () => setTlVisible(false));
  tlOpenBtn?.addEventListener("click", () => setTlVisible(true));
  tlGoLiveBtn?.addEventListener("click", () => goTlLive());
  tlPlayBtn?.addEventListener("click", () => {
    if(!tlModel) return;
    if(!tlReplay) applyTlPosition(Math.min(tlPct, 92), { fromUser:true });
    if(tlPlaying) stopTlPlayback();
    else startTlPlayback();
  });
  tlAlerts?.addEventListener("click", e => {
    const mark = e.target.closest(".monitor__tl-mark");
    if(!mark || !tlModel) return;
    const a = tlModel.alerts[+mark.dataset.i];
    if(!a) return;
    applyTlPosition(a.pct, { fromUser:true });
  });
  const scrubTl = e => applyTlPosition(pctFromPointer(e), { fromUser:true });
  tlTrack?.addEventListener("pointerdown", e => {
    if(e.target.closest(".monitor__tl-mark")) return;
    tlTrack.setPointerCapture?.(e.pointerId);
    scrubTl(e);
  });
  tlTrack?.addEventListener("pointermove", e => {
    if(!tlTrack.hasPointerCapture?.(e.pointerId)) return;
    scrubTl(e);
  });
  tlTrack?.addEventListener("keydown", e => {
    if(!tlModel) return;
    if(e.key === "ArrowLeft"){ e.preventDefault(); applyTlPosition(tlPct - 2, { fromUser:true }); }
    if(e.key === "ArrowRight"){ e.preventDefault(); applyTlPosition(tlPct + 2, { fromUser:true }); }
    if(e.key === "Home"){ e.preventDefault(); applyTlPosition(0, { fromUser:true }); }
    if(e.key === "End"){ e.preventDefault(); goTlLive(); }
  });
  setTlVisible(false);

  searchEl?.addEventListener("input", () => {
    search = searchEl.value || "";
    renderList();
    if(isMultiCam()) renderCamGrid(true);
  });

  filterBtn?.addEventListener("click", e => {
    e.stopPropagation();
    fillFilter();
    setFilterMenuOpen(!!filterMenu?.hidden);
  });

  filterMenu?.addEventListener("click", e => {
    const opt = e.target.closest(".monitor__filter-opt");
    if(!opt) return;
    filterOps = opt.dataset.ops || "";
    syncFilterUi();
    setFilterMenuOpen(false);
    renderList();
    if(isMultiCam()) renderCamGrid(true);
  });

  document.addEventListener("click", e => {
    if(!filterMenu || filterMenu.hidden) return;
    if(filterBtn?.contains(e.target) || filterMenu.contains(e.target)) return;
    setFilterMenuOpen(false);
  });

  document.addEventListener("keydown", e => {
    if(e.key === "Escape") setFilterMenuOpen(false);
  });

  document.getElementById("monitor-mode-auto")?.addEventListener("click", () => setMode("auto"));
  document.getElementById("monitor-mode-manual")?.addEventListener("click", () => setMode("manual"));
  estopBtn?.addEventListener("click", emergencyStop);

  root.querySelectorAll("[data-quick]").forEach(btn => {
    btn.addEventListener("click", () => quickAction(btn.dataset.quick));
  });

  const openUnitOnMap = () => {
    const u = focused();
    if(!u) return;
    if(typeof window.nexusSetModule === "function"){
      window.nexusSetModule("operacion");
    }
    requestAnimationFrame(() => {
      if(typeof window.nexusFocusDeviceMarker === "function"){
        window.nexusFocusDeviceMarker(u.markerKey, u.code);
      }
    });
  };

  const minimapEl = document.getElementById("monitor-minimap");
  const mapFrame = document.getElementById("monitor-map-frame");
  const mapResize = document.getElementById("monitor-map-resize");
  const MAP_W_MIN = 192;
  const MAP_W_MAX = 560;

  const setMapWidth = px => {
    if(!minimapEl) return;
    const maxByLayout = Math.max(MAP_W_MIN, Math.floor((root.clientWidth || 1200) * 0.55));
    const w = Math.round(Math.min(MAP_W_MAX, maxByLayout, Math.max(MAP_W_MIN, px)));
    minimapEl.style.setProperty("--monitor-map-w", w + "px");
    minimapEl.classList.add("is-map-resized");
    if(mapResize){
      mapResize.setAttribute("aria-valuenow", String(w));
      mapResize.setAttribute("aria-valuetext", `${w} píxeles`);
    }
  };

  mapFrame?.addEventListener("dblclick", openUnitOnMap);
  mapFrame?.addEventListener("keydown", e => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      openUnitOnMap();
    }
  });

  if(mapResize && minimapEl){
    let mapDragging = false;
    let mapStartX = 0;
    let mapStartW = 0;

    const onMapMove = e => {
      if(!mapDragging) return;
      setMapWidth(mapStartW + (mapStartX - e.clientX));
    };
    const endMapDrag = e => {
      if(!mapDragging) return;
      mapDragging = false;
      minimapEl.classList.remove("is-resizing");
      try{ mapResize.releasePointerCapture(e.pointerId); }catch(_){}
      window.removeEventListener("pointermove", onMapMove);
      window.removeEventListener("pointerup", endMapDrag);
      window.removeEventListener("pointercancel", endMapDrag);
    };

    mapResize.addEventListener("pointerdown", e => {
      if(e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      mapDragging = true;
      mapStartX = e.clientX;
      mapStartW = minimapEl.getBoundingClientRect().width;
      minimapEl.classList.add("is-resizing");
      mapResize.setPointerCapture?.(e.pointerId);
      window.addEventListener("pointermove", onMapMove);
      window.addEventListener("pointerup", endMapDrag);
      window.addEventListener("pointercancel", endMapDrag);
    });

    mapResize.addEventListener("keydown", e => {
      const step = e.shiftKey ? 48 : 16;
      const cur = parseFloat(mapResize.getAttribute("aria-valuenow") || "352");
      if(e.key === "ArrowLeft" || e.key === "ArrowUp"){
        e.preventDefault();
        setMapWidth(cur + step);
      }else if(e.key === "ArrowRight" || e.key === "ArrowDown"){
        e.preventDefault();
        setMapWidth(cur - step);
      }else if(e.key === "Home"){
        e.preventDefault();
        setMapWidth(MAP_W_MIN);
      }else if(e.key === "End"){
        e.preventDefault();
        setMapWidth(MAP_W_MAX);
      }
    });

    mapResize.addEventListener("dblclick", e => {
      e.preventDefault();
      e.stopPropagation();
      minimapEl.style.removeProperty("--monitor-map-w");
      minimapEl.classList.remove("is-map-resized");
      requestAnimationFrame(() => {
        const w = Math.round(minimapEl.getBoundingClientRect().width);
        mapResize.setAttribute("aria-valuenow", String(w));
      });
    });
  }

  /* Teclado opcional en manual: WASD / flechas */
  window.addEventListener("keydown", e => {
    if(pane.hidden) return;
    const u = focused();
    if(!u || u.mode !== "manual") return;
    const step = 0.15;
    if(e.key === "ArrowUp" || e.key === "w" || e.key === "W"){ u.speed = Math.min(8, u.speed + step); e.preventDefault(); }
    if(e.key === "ArrowDown" || e.key === "s" || e.key === "S"){ u.speed = Math.max(0, u.speed - step); e.preventDefault(); }
    if(e.key === "ArrowLeft" || e.key === "a" || e.key === "A"){ u.heading = (u.heading - 6 + 360) % 360; e.preventDefault(); }
    if(e.key === "ArrowRight" || e.key === "d" || e.key === "D"){ u.heading = (u.heading + 6) % 360; e.preventDefault(); }
    if(e.key === " "){ emergencyStop(); e.preventDefault(); }
    renderFocus();
  });

  const openMonitor = (key) => {
    if(typeof window.nexusSetModule === "function"){
      window.nexusSetModule("monitoreo");
    }else{
      const shell = document.getElementById("shell");
      if(shell) shell.dataset.module = "monitoreo";
      pane.hidden = false;
    }
    fillFilter();
    applyGridLayout();
    renderSummary();
    if(key){
      const hit = fleet.find(u =>
        u.id === key || u.code === key || u.markerKey === key || u.deviceId === key);
      if(hit) focusId = hit.id;
    }
    if(!focusId && fleet[0]) focusId = fleet[0].id;
    renderList();
    if(isMultiCam()) renderCamGrid(true);
    else renderFocus();
    startSim();
  };

  /* Observa visibilidad del pane (cambio de módulo en shell). */
  const mo = new MutationObserver(() => {
    if(pane.hidden) stopSim();
    else{
      fillFilter();
      applyGridLayout();
      renderSummary();
      renderList();
      if(isMultiCam()) renderCamGrid(true);
      else renderFocus();
      startSim();
    }
  });
  mo.observe(pane, { attributes:true, attributeFilter:["hidden"] });

  applyGridLayout();

  /* —— Redimensionar columna de flota —— */
  if(splitter){
    let dragging = false;

    const onPointerMove = e => {
      if(!dragging) return;
      const left = root.getBoundingClientRect().left;
      setFleetWidth(e.clientX - left);
    };

    const endDrag = e => {
      if(!dragging) return;
      dragging = false;
      root.classList.remove("is-resizing");
      try{ splitter.releasePointerCapture(e.pointerId); }catch(_){}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };

    splitter.addEventListener("pointerdown", e => {
      if(e.button != null && e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      root.classList.add("is-resizing");
      splitter.setPointerCapture?.(e.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    });

    splitter.addEventListener("keydown", e => {
      const step = e.shiftKey ? 48 : 16;
      const cur = parseFloat(splitter.getAttribute("aria-valuenow") || "336");
      if(e.key === "ArrowLeft"){
        e.preventDefault();
        setFleetWidth(cur - step);
      }else if(e.key === "ArrowRight"){
        e.preventDefault();
        setFleetWidth(cur + step);
      }else if(e.key === "Home"){
        e.preventDefault();
        setFleetWidth(FLEET_W_MIN);
      }else if(e.key === "End"){
        e.preventDefault();
        setFleetWidth(FLEET_W_MAX);
      }
    });

    splitter.addEventListener("dblclick", () => {
      root.style.removeProperty("--monitor-fleet-w");
      root.classList.remove("is-fleet-resized");
      requestAnimationFrame(syncSplitterAria);
    });

    syncSplitterAria();
  }

  window.nexusOpenMonitor = openMonitor;
  window.nexusMonitorFocusId = () => focusId;
})();
