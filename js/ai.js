/* ============================================================
   PANEL DE IA — comportamiento de la columna derecha
   Vigía → IA. Dispositivos → salud. Rutas → patrullaje.
   Incidentes → cola viva. Pausar / Tomar control sin cablear.
   ============================================================ */

/* Menú del orb: abre el panel que corresponde al modo. */
(function saimonModes(){
  const shell = document.getElementById("shell");
  const aiPanel = document.getElementById("ai-panel");
  const devicesPanel = document.getElementById("devices-panel");
  const routesPanel = document.getElementById("routes-panel");
  const incidentsPanel = document.getElementById("incidents-panel");
  const orb = document.querySelector(".agent-orb");
  const nameEl = orb && orb.querySelector(".agent-orb__name");
  const actions = orb && orb.querySelectorAll(".agent-orb__action[data-mode]");
  if(!shell || !aiPanel || !devicesPanel || !routesPanel || !incidentsPanel || !orb || !actions.length) return;

  const LABELS = {
    vigia: "Saimon VIGIA",
    patrol: "Saimon RUTAS",
    devices: "Saimon DISPOSITIVOS",
    incidents: "Saimon INCIDENTES"
  };

  const PANEL_BY_MODE = {
    vigia: aiPanel,
    devices: devicesPanel,
    patrol: routesPanel,
    incidents: incidentsPanel
  };

  const setPanelVisible = (panel, open) => {
    panel.hidden = !open;
    if(open) panel.removeAttribute("inert");
    else panel.setAttribute("inert", "");
  };

  const setRightOpen = open => {
    shell.classList.toggle("is-right-open", open);
    if(typeof window.nexusRefreshMapPadding === "function"){
      window.nexusRefreshMapPadding();
    }
  };

  const closeAllPanels = () => {
    setPanelVisible(aiPanel, false);
    setPanelVisible(devicesPanel, false);
    setPanelVisible(routesPanel, false);
    setPanelVisible(incidentsPanel, false);
    setRightOpen(false);
    if(typeof window.nexusFocusDeviceMarker === "function"){
      window.nexusFocusDeviceMarker(null);
    }
    if(typeof window.nexusFocusUnitMarker === "function"){
      window.nexusFocusUnitMarker(null);
    }
    if(typeof window.nexusClearPatrolSelection === "function"){
      window.nexusClearPatrolSelection();
    }else if(typeof window.nexusClearMapRoute === "function"){
      window.nexusClearMapRoute();
    }
    if(typeof window.nexusClearIncidentSelection === "function"){
      window.nexusClearIncidentSelection();
    }else if(typeof window.nexusClearIncidentPopcard === "function"){
      window.nexusClearIncidentPopcard();
    }
  };

  const clearModeButtons = () => {
    actions.forEach(btn => {
      btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", "false");
    });
    if(nameEl) nameEl.textContent = "Saimon";
    orb.setAttribute("aria-label", "Saimon");
  };

  const activateMode = mode => {
    actions.forEach(btn => {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    if(nameEl) nameEl.textContent = LABELS[mode] || "Saimon";
    orb.setAttribute("aria-label", LABELS[mode] || "Saimon");
  };

  const openModePanel = mode => {
    const target = PANEL_BY_MODE[mode];
    setPanelVisible(aiPanel, target === aiPanel);
    setPanelVisible(devicesPanel, target === devicesPanel);
    setPanelVisible(routesPanel, target === routesPanel);
    setPanelVisible(incidentsPanel, target === incidentsPanel);
    setRightOpen(Boolean(target));
    activateMode(mode);
  };

  const isModeOpen = mode => {
    const panel = PANEL_BY_MODE[mode];
    return panel && !panel.hidden
      && shell.classList.contains("is-right-open")
      && actions.length
      && [...actions].some(b => b.dataset.mode === mode && b.getAttribute("aria-pressed") === "true");
  };

  actions.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;

      if(PANEL_BY_MODE[mode]){
        if(isModeOpen(mode)){
          closeAllPanels();
          clearModeButtons();
          return;
        }
        openModePanel(mode);
        return;
      }

      closeAllPanels();
      activateMode(mode);
    });
  });

  /* Abre un modo desde el mapa u otros módulos (p. ej. marcador → Incidentes). */
  window.nexusOpenMode = mode => {
    if(!PANEL_BY_MODE[mode]) return false;
    openModePanel(mode);
    return true;
  };
})();

/* Tira de agentes: acordeón colapsado por defecto. */
(function agentsDisclosure(){
  const toggle = document.getElementById("agents-toggle");
  if(!toggle) return;

  const panel = document.getElementById(toggle.getAttribute("aria-controls"));
  if(!panel) return;

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    panel.hidden = expanded;
  });
})();

/* Ficha de misión en el muelle: timeline + stream (teatro visual). */
(function unitDevcard(){
  const card = document.getElementById("devcard");
  const title = document.getElementById("devcard-title");
  const subtitle = document.getElementById("devcard-subtitle");
  const refEl = document.getElementById("devcard-ref");
  const track = document.getElementById("devcard-track");
  const codeEl = document.getElementById("devcard-code");
  const destEl = document.getElementById("devcard-dest");
  const badgeEl = document.getElementById("devcard-badge");
  const etaEl = document.getElementById("devcard-eta");
  const media = document.getElementById("devcard-media");
  const modelEl = document.getElementById("devcard-model");
  const closeBtn = card && card.querySelector(".devcard__close");
  const units = document.querySelectorAll(".unit[data-unit]");
  if(!card || !title || !track || !media) return;

  const MODEL_IMG = {
    perro: "assets/saimon-robot.jpg",
    humanoide: "assets/humanoide.jpg",
    dron: "assets/dron-compact.jpg",
    dronMax: "assets/dron-max.jpg",
    camara: "assets/cam-0412.png",
    arco: "assets/arco-01.png"
  };

  const ICONS = {
    check:'<path d="m5 12 4 4L19 7"/>',
    flag:'<path d="M5 21V4"/><path d="M5 4h10l-1.5 3L15 10H5"/>',
    nav:'<path d="m12 3 8 18-8-4-8 4 8-18Z"/>',
    pin:'<path d="M12 21s-7-5.2-7-10a7 7 0 1 1 14 0c0 4.8-7 10-7 10Z"/><circle cx="12" cy="11" r="2.2"/>',
    eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    work:'<rect x="4" y="8" width="16" height="11" rx="1.5"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    idle:'<circle cx="12" cy="12" r="7"/><path d="M12 8v5l3 2"/>'
  };

  const nodeSvg = name =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICONS[name] || ICONS.check}</svg>`;

  const missionTrack = (steps) => steps.map(s => {
    const state = s.state || "wait";
    const label = state === "active" && s.progress ? `${s.label} ${s.progress}` : s.label;
    const icon = state === "wait" ? (s.icon || "idle") : "check";
    return `<li class="mission-track__step is-${state}">
      <span class="mission-track__node">${nodeSvg(icon)}</span>
      <p class="mission-track__label">${label}</p>
      <p class="mission-track__time">${s.time || "—"}</p>
    </li>`;
  }).join("");

  const UNIT_PROFILES = {
    robot:{
      title:"Seguimiento de misión",
      subtitle:"Perro robot en despacho",
      ref:"ZM-14 · Vigía",
      code:"#ZM-14",
      dest:"Hacia Av. Américas · Sector 1 Norte",
      badge:"En ruta",
      badgeTone:"",
      eta:"ETA 3 min · Prioridad alta",
      modelImg: MODEL_IMG.perro,
      media:"live",
      stream: typeof nexusPickGroundVideo === "function" ? nexusPickGroundVideo() : "assets/perro1.mp4",
      cam:"ZM-14",
      track:[
        { label:"Despachado", time:"11:12", state:"done", icon:"flag" },
        { label:"En ruta", time:"11:13", state:"done", icon:"nav" },
        { label:"Aproximación", time:"11:15", state:"active", icon:"pin", progress:"2/3" },
        { label:"En sitio", time:"ETA 3'", state:"wait", icon:"pin" },
        { label:"Cierre", time:"—", state:"wait", icon:"check" }
      ]
    },
    amb:{
      title:"Seguimiento de misión",
      subtitle:"Humanoide de apoyo",
      ref:"HU-07 · Vigía",
      code:"#HU-07",
      dest:"Hacia Av. Américas · apoyo médico",
      badge:"En ruta",
      badgeTone:"",
      eta:"ETA 5 min · Disuasión",
      modelImg: MODEL_IMG.humanoide,
      media:"live",
      stream: typeof nexusPickGroundVideo === "function" ? nexusPickGroundVideo() : "assets/perro2.mp4",
      cam:"HU-07",
      track:[
        { label:"Despachado", time:"11:12", state:"done", icon:"flag" },
        { label:"En ruta", time:"11:14", state:"active", icon:"nav", progress:"1/2" },
        { label:"En sitio", time:"ETA 5'", state:"wait", icon:"pin" },
        { label:"Apoyo", time:"—", state:"wait", icon:"work" },
        { label:"Cierre", time:"—", state:"wait", icon:"check" }
      ]
    },
    drone:{
      title:"Seguimiento de misión",
      subtitle:"Dron de vigilancia",
      ref:"DR-03 · Óptica",
      code:"#DR-03",
      dest:"Sobreincidente · 80 m AGL",
      badge:"Sobrevolando",
      badgeTone:"success",
      eta:"Óptica en vivo · En misión",
      modelImg: MODEL_IMG.dronMax,
      media:"live",
      stream: typeof nexusPickDroneVideo === "function" ? nexusPickDroneVideo() : "assets/dron1.mp4",
      cam:"DR-03",
      track:[
        { label:"Despegue", time:"11:12", state:"done", icon:"flag" },
        { label:"Tránsito", time:"11:13", state:"done", icon:"nav" },
        { label:"Óptica", time:"11:14", state:"active", icon:"eye", progress:"Live" },
        { label:"Relevo", time:"—", state:"wait", icon:"work" },
        { label:"Retorno", time:"—", state:"wait", icon:"check" }
      ]
    },
    demoRobot:{
      title:"Seguimiento de misión",
      subtitle:"Perro robot · accidente",
      ref:"ZM-22 · Demo alerta",
      code:"#ZM-22",
      dest:"Hacia accidente · Sector 1 Norte",
      badge:"En ruta",
      badgeTone:"warning",
      eta:"ETA 4 min · Prioridad alta",
      modelImg: MODEL_IMG.perro,
      media:"live",
      stream:(typeof DEMO_ACCIDENT_STREAMS !== "undefined" && DEMO_ACCIDENT_STREAMS.robot) || "assets/accidente-perro.mp4",
      cam:"ZM-22",
      track:[
        { label:"Alerta", time:"12:03", state:"done", icon:"flag" },
        { label:"Despacho", time:"12:04", state:"done", icon:"flag" },
        { label:"En ruta", time:"12:05", state:"active", icon:"nav", progress:"2/4" },
        { label:"En sitio", time:"ETA 4'", state:"wait", icon:"pin" },
        { label:"Cierre", time:"—", state:"wait", icon:"check" }
      ]
    },
    demoAmb:{
      title:"Seguimiento de misión",
      subtitle:"Humanoide · contención",
      ref:"HU-12 · Demo alerta",
      code:"#HU-12",
      dest:"Hacia accidente · contención",
      badge:"En ruta",
      badgeTone:"warning",
      eta:"ETA 6 min · Apoyo",
      modelImg: MODEL_IMG.humanoide,
      media:"live",
      stream:(typeof DEMO_ACCIDENT_STREAMS !== "undefined" && DEMO_ACCIDENT_STREAMS.amb) || "assets/accidente-humanoide.mp4",
      cam:"HU-12",
      track:[
        { label:"Alerta", time:"12:03", state:"done", icon:"flag" },
        { label:"Despacho", time:"12:04", state:"done", icon:"flag" },
        { label:"En ruta", time:"12:05", state:"active", icon:"nav", progress:"1/3" },
        { label:"En sitio", time:"ETA 6'", state:"wait", icon:"pin" },
        { label:"Cierre", time:"—", state:"wait", icon:"check" }
      ]
    },
    demoDrone:{
      title:"Seguimiento de misión",
      subtitle:"Dron · óptica accidente",
      ref:"DR-09 · Demo alerta",
      code:"#DR-09",
      dest:"Sobreaccidente · óptica",
      badge:"Sobrevolando",
      badgeTone:"success",
      eta:"Óptica en vivo",
      modelImg: MODEL_IMG.dronMax,
      media:"live",
      stream:(typeof DEMO_ACCIDENT_STREAMS !== "undefined" && DEMO_ACCIDENT_STREAMS.drone) || "assets/accidente-dron.mp4",
      cam:"DR-09",
      track:[
        { label:"Alerta", time:"12:03", state:"done", icon:"flag" },
        { label:"Despegue", time:"12:04", state:"done", icon:"flag" },
        { label:"Óptica", time:"12:05", state:"active", icon:"eye", progress:"Live" },
        { label:"Relevo", time:"—", state:"wait", icon:"work" },
        { label:"Retorno", time:"—", state:"wait", icon:"check" }
      ]
    }
  };

  let openKey = null;

  const setPressed = id => {
    units.forEach(u => {
      u.setAttribute("aria-pressed", String(u.dataset.unit === id));
    });
  };

  const liveTag = (src, fallback) =>
    typeof nexusLiveMediaTag === "function"
      ? nexusLiveMediaTag(src, "devcard__photo", fallback)
      : `<img class="devcard__photo" src="${src || fallback}" alt="" width="480" height="270" decoding="async">`;

  const renderMedia = (kind, streamSrc, camLabel) => {
    if(kind === "photo"){
      media.innerHTML = liveTag(streamSrc, "assets/dron-compact.jpg");
      return;
    }
    if(kind === "live" || streamSrc){
      const fallback = typeof nexusPickLiveVideo === "function"
        ? nexusPickLiveVideo()
        : "assets/arco2.mp4";
      const src = streamSrc || fallback;
      const label = camLabel || "CAM-0412";
      media.innerHTML =
        liveTag(src, fallback)
        + `<span class="popcard__live"><i></i>EN VIVO · ${label}</span>`;
      return;
    }
    if(kind === "robot"){
      const src = typeof nexusPickGroundVideo === "function"
        ? nexusPickGroundVideo()
        : "assets/perro1.mp4";
      media.innerHTML = liveTag(src, src)
        + `<span class="popcard__live"><i></i>EN VIVO · ${camLabel || "ZM-14"}</span>`;
      return;
    }
    if(kind === "humanoide"){
      const src = typeof nexusPickGroundVideo === "function"
        ? nexusPickGroundVideo()
        : "assets/perro2.mp4";
      media.innerHTML = liveTag(src, src)
        + `<span class="popcard__live"><i></i>EN VIVO · ${camLabel || "HU-07"}</span>`;
      return;
    }
    media.innerHTML = liveTag(
      typeof nexusPickGroundVideo === "function" ? nexusPickGroundVideo() : "assets/perro1.mp4",
      "assets/perro1.mp4"
    );
  };

  const applyProfile = (profile, key) => {
    const isSimple = !!profile.simple;
    card.classList.toggle("devcard--simple", isSimple);

    title.textContent = profile.title || (isSimple ? "Recurso" : "Seguimiento de misión");
    if(subtitle){
      subtitle.textContent = profile.subtitle || "";
      subtitle.hidden = isSimple || !profile.subtitle;
    }
    if(refEl) refEl.textContent = profile.ref || profile.cam || "";
    if(codeEl) codeEl.textContent = profile.code || "";
    if(destEl) destEl.textContent = profile.dest || "";
    if(etaEl){
      etaEl.textContent = profile.eta || "";
      etaEl.hidden = isSimple || !profile.eta;
    }
    if(badgeEl){
      badgeEl.textContent = profile.badge || "Activo";
      badgeEl.className = "devcard__badge" + (profile.badgeTone ? ` devcard__badge--${profile.badgeTone}` : "");
    }
    if(modelEl){
      if(isSimple || profile.modelImg === null){
        modelEl.hidden = true;
      }else{
        modelEl.hidden = false;
        const src = profile.modelImg || MODEL_IMG.perro;
        modelEl.src = src;
        modelEl.alt = profile.subtitle || profile.cam || "Modelo de unidad";
      }
    }
    if(isSimple || !(profile.track && profile.track.length)){
      track.hidden = true;
      track.innerHTML = "";
    }else{
      track.hidden = false;
      track.innerHTML = missionTrack(profile.track);
    }
    renderMedia(profile.media, profile.stream, profile.cam);
    card.hidden = false;
    openKey = key;
  };

  const close = () => {
    card.hidden = true;
    openKey = null;
    setPressed(null);
    if(typeof window.nexusFocusUnitMarker === "function"){
      window.nexusFocusUnitMarker(null);
    }
    if(typeof window.nexusFocusDeviceMarker === "function"){
      window.nexusFocusDeviceMarker(null);
    }
  };

  const openUnit = (id, opts) => {
    const base = UNIT_PROFILES[id];
    if(!base) return false;
    const profile = Object.assign({}, base);
    const demoStream = window.nexusDemoUnitStreams && window.nexusDemoUnitStreams[id];
    if(opts && opts.stream) profile.stream = opts.stream;
    else if(demoStream) profile.stream = demoStream;
    if(opts && opts.cam) profile.cam = opts.cam;
    if(opts && opts.track) profile.track = opts.track;
    if(opts && opts.badge) profile.badge = opts.badge;
    if(opts && opts.dest) profile.dest = opts.dest;
    if(opts && opts.eta) profile.eta = opts.eta;
    if(typeof window.nexusFocusDeviceMarker === "function"){
      window.nexusFocusDeviceMarker(null);
    }
    applyProfile(profile, "unit:" + id);
    setPressed(id);
    if(!(opts && opts.skipMapFocus) && typeof window.nexusFocusUnitMarker === "function"){
      window.nexusFocusUnitMarker(id);
    }
    return true;
  };

  const openDevice = markerKey => {
    if(typeof DEVICES === "undefined") return false;
    const device = DEVICES.find(d => d.markerKey === markerKey);
    if(!device) return false;

    const typeMeta = (typeof DEVICE_TYPES !== "undefined" && DEVICE_TYPES[device.type]) || { label:device.type };
    const statusMeta = (typeof DEVICE_STATUS !== "undefined" && DEVICE_STATUS[device.status]) || { label:device.status };
    const opsMeta = device.ops && typeof DRONE_OPS !== "undefined" ? DRONE_OPS[device.ops] : null;

    let mediaKind = "robot";
    let stream = device.stream || "";
    let cam = device.code;
    let badge = statusMeta.label;
    let badgeTone = device.status === "online" ? "success"
      : (device.status === "offline" || device.status === "damaged" ? "danger" : "warning");
    let dest = `Cobertura · ${device.sector}`;
    let eta = `${typeMeta.label} · ${device.code}`;
    let modelImg = MODEL_IMG[device.type] || MODEL_IMG.perro;
    let trackSteps = [
      { label:"Disponible", time:"—", state:"done", icon:"flag" },
      { label:"En sector", time:"Ahora", state:"active", icon:"pin" },
      { label:"Patrulla", time:"—", state:"wait", icon:"nav" },
      { label:"Standby", time:"—", state:"wait", icon:"idle" }
    ];

    if(device.type === "dron"){
      mediaKind = "live";
      stream = device.stream
        || (typeof nexusPickDroneVideo === "function" ? nexusPickDroneVideo() : "assets/dron1.mp4");
      modelImg = device.modelImg
        || (device.model === "max" ? MODEL_IMG.dronMax : MODEL_IMG.dron);
      if(device.ops === "hangar"){
        badge = opsMeta?.label || "En hangar";
        badgeTone = "warning";
        dest = `Hangar · ${device.sector}`;
        eta = device.model === "max" ? "Max Tactical" : "Compact";
        trackSteps = [
          { label:"Aterrizaje", time:"—", state:"done", icon:"flag" },
          { label:"Hangar", time:"Ahora", state:"active", icon:"idle" },
          { label:"Carga", time:"—", state:"wait", icon:"work" },
          { label:"Listo", time:"—", state:"wait", icon:"check" }
        ];
      }else{
        badge = opsMeta?.label || "Desplegado";
        badgeTone = "success";
        dest = `Óptica · ${device.sector}`;
        eta = "Desplegado · Live";
        trackSteps = [
          { label:"Despegue", time:"—", state:"done", icon:"flag" },
          { label:"Tránsito", time:"—", state:"done", icon:"nav" },
          { label:"Óptica", time:"Ahora", state:"active", icon:"eye", progress:"Live" },
          { label:"Retorno", time:"—", state:"wait", icon:"check" }
        ];
      }
    }else if(device.type === "humanoide"){
      mediaKind = "live";
      modelImg = MODEL_IMG.humanoide;
      stream = device.stream
        || (typeof nexusPickGroundVideo === "function" ? nexusPickGroundVideo() : "assets/perro1.mp4");
    }else if(device.type === "arco"){
      mediaKind = "live";
      stream = device.stream
        || (typeof nexusPickLiveVideo === "function" ? nexusPickLiveVideo() : "assets/arco2.mp4");
      applyProfile({
        simple:true,
        title: device.name,
        subtitle:"",
        ref: device.code,
        code:"",
        dest: device.sector,
        badge,
        badgeTone,
        eta:"",
        modelImg:null,
        media: mediaKind,
        stream,
        cam,
        track:[]
      }, "device:" + markerKey);
      setPressed(null);
      if(typeof window.nexusFocusUnitMarker === "function"){
        window.nexusFocusUnitMarker(null);
      }
      if(typeof window.nexusFocusDeviceMarker === "function"){
        window.nexusFocusDeviceMarker(markerKey, device.code);
      }
      return true;
    }else if(device.type === "camara"){
      mediaKind = "live";
      stream = device.stream
        || (typeof nexusPickLiveVideo === "function" ? nexusPickLiveVideo() : "assets/arco2.mp4");
      applyProfile({
        simple:true,
        title: device.name,
        subtitle:"",
        ref: device.code,
        code:"",
        dest: device.sector,
        badge,
        badgeTone,
        eta:"",
        modelImg:null,
        media: mediaKind,
        stream,
        cam,
        track:[]
      }, "device:" + markerKey);
      setPressed(null);
      if(typeof window.nexusFocusUnitMarker === "function"){
        window.nexusFocusUnitMarker(null);
      }
      if(typeof window.nexusFocusDeviceMarker === "function"){
        window.nexusFocusDeviceMarker(markerKey, device.code);
      }
      return true;
    }else if(device.type === "perro"){
      mediaKind = "live";
      modelImg = MODEL_IMG.perro;
      stream = device.stream
        || (typeof nexusPickGroundVideo === "function" ? nexusPickGroundVideo() : "assets/perro1.mp4");
    }

    applyProfile({
      title:"Seguimiento de unidad",
      subtitle: device.name,
      ref:`${device.code} · ${typeMeta.label}`,
      code:`#${device.code}`,
      dest,
      badge,
      badgeTone,
      eta,
      modelImg,
      media: mediaKind,
      stream,
      cam,
      track: trackSteps
    }, "device:" + markerKey);

    setPressed(null);
    if(typeof window.nexusFocusUnitMarker === "function"){
      window.nexusFocusUnitMarker(null);
    }
    if(typeof window.nexusFocusDeviceMarker === "function"){
      window.nexusFocusDeviceMarker(markerKey, device.code);
    }
    return true;
  };

  units.forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.unit;
      if(!card.hidden && openKey === "unit:" + id){
        close();
        return;
      }
      openUnit(id);
    });
  });

  /* Delegación en #map: los marcadores se montan con MapLibre y un
     forEach al cargar podía quedar sin listeners si el DOM aún no listo. */
  const isMobileFleet = markerKey => {
    if(typeof DEVICES === "undefined") return false;
    const d = DEVICES.find(x => x.markerKey === markerKey);
    return d && (d.type === "perro" || d.type === "humanoide" || d.type === "dron");
  };

  const onMarkerActivate = (btn, event) => {
    if(!btn || btn.classList.contains("marker--incidente")) return false;
    if(!btn.dataset.device) return false;
    if(event) event.stopPropagation();

    const unitId = btn.dataset.unit;
    const markerKey = btn.dataset.device;

    /* Flota móvil → módulo Monitoreo (teatro de control). */
    if(isMobileFleet(markerKey) && typeof window.nexusOpenMonitor === "function"){
      if(card && !card.hidden) close();
      window.nexusOpenMonitor(markerKey);
      return true;
    }

    if(unitId){
      if(!card.hidden && openKey === "unit:" + unitId){
        close();
        return true;
      }
      openUnit(unitId);
      return true;
    }

    if(!card.hidden && openKey === "device:" + markerKey){
      close();
      return true;
    }
    openDevice(markerKey);
    return true;
  };

  const mapRoot = document.getElementById("map");
  if(mapRoot){
    mapRoot.addEventListener("click", event => {
      const btn = event.target.closest(".marker[data-device]");
      onMarkerActivate(btn, event);
    });
  }else{
    document.querySelectorAll(".marker[data-device]").forEach(btn => {
      btn.addEventListener("click", event => onMarkerActivate(btn, event));
    });
  }

  if(closeBtn) closeBtn.addEventListener("click", close);

  window.nexusOpenDevcardUnit = openUnit;
  window.nexusOpenDevcardDevice = openDevice;
  window.nexusCloseDevcard = close;
})();
