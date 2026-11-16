/* ============================================================
   OPERADORES DE CAMPO — monitoreo de oficiales y sus tres
   dispositivos (bodycam, radio, cámara de patrulla).

   - Un operador es la unidad: una sola ficha agrupa sus equipos.
   - Vive en Monitoreo (pestaña "Oficiales" junto a robots) y en el mapa.
     En Salud de dispositivos cada equipo es una fila (bodycam, cámara
     de patrulla o radio) y debajo solo el oficial asignado.
   - La vista de cámara replica el HUD de robots: datos arriba a la
     izquierda, mapa al centro, detalle a la derecha y Hablar abajo.
     La cuadrícula del oficial es 1 (una cámara) o 2 (bodycam y patrulla).
   - Todo es simulado: datos en data.js (bloque FIELD_*). No hay
     alta de dispositivos, ni video, audio o radio reales, ni
     ubicación real. Sin fotos: avatares con iniciales.
   ============================================================ */
(function fieldOperators(){
  if(typeof FIELD_OPERATORS === "undefined" || typeof FIELD_SIM === "undefined") return;

  const $ = id => document.getElementById(id);
  const monitorRoot = $("monitor");
  const monitorCount = $("monitor-count");
  const monitorVideo = $("monitor-video");
  const viewEl = $("field-view");
  const stageEl = $("field-stage");
  const fichaEl = $("field-ficha");
  const radioEl = $("field-radio");
  const alertEl = $("field-alert");
  const listEl = $("field-list");
  const summaryEl = $("field-summary");
  const countEl = $("field-count");
  const searchEl = $("field-search");
  const filterBtn = $("field-filter-btn");
  const filterMenu = $("field-filter-menu");
  const filterLabel = $("field-filter-label");
  const unitEl = $("field-unit");
  const mapSvg = $("field-map-svg");
  const mapFrame = $("field-map-frame");
  const invEl = $("field-inv");
  const fleetEl = $("field-fleet");
  const vigiaLog = $("vigia-log");
  const sourceCountEl = $("field-source-count");
  const robotsCountEl = $("monitor-source-robots-count");
  const sourceToggle = document.querySelector(".monitor__source");
  if(!monitorRoot || !viewEl || !listEl || !invEl || !radioEl) return;

  /* ---------- utilidades ---------- */
  const ICON = {
    bodycam:  `<rect x="6" y="7" width="12" height="10" rx="2.5"/><circle cx="12" cy="12" r="2.4"/><path d="M9 7 10 5h4l1 2"/>`,
    radio:    `<rect x="7" y="8" width="10" height="12" rx="2"/><path d="M10 8V4.5M14 8V4.5"/><path d="M10 12.5h4M10 15.5h4"/>`,
    patrulla: `<path d="M3 15.5 5.5 10h10.5l3 3.5v2H3Z"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="17" cy="16.5" r="1.6"/><path d="M8 10 9.5 7h4.5"/>`,
    shield:   `<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/>`
  };
  const svg = (k, cls = "") =>
    `<svg class="${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ICON[k]}</svg>`;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  const toSec = s => { const [h = 0, m = 0, x = 0] = String(s).split(":").map(Number); return h * 3600 + m * 60 + x; };
  const BASE = toSec(FIELD_SIM.clockBase);
  const fmtHMS = s => [Math.floor(s / 3600) % 24, Math.floor((s % 3600) / 60), Math.floor(s % 60)]
    .map(v => String(v).padStart(2, "0")).join(":");

  const pct = v => `${Math.round(v)}%`;
  const battClass = v => (v <= 20 ? "is-low" : v <= 40 ? "is-mid" : "");

  /* ---------- estado ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const parseDur = s => { const [m = 0, x = 0] = String(s || "0:0").split(":").map(Number); return m * 60 + x; };
  /* Semilla → estado de simulación. Horas "HH:MM" pasan a segundos del día. */
  const normalize = o => {
    const estados = (o.estados || []).map(e => ({ s: toSec(e.t), key: e.key }));
    const stopped = o.mov && o.mov.modo === "detenido";
    return {
      ...o,
      estados,
      mensajes: (o.mensajes || []).map(m => ({ s: toSec(m.t), de: m.de, texto: m.texto, leido: !!m.leido })),
      llamadas: (o.llamadas || []).map(c => ({ tipo: c.tipo, s: toSec(c.t), dur: parseDur(c.dur), por: c.por, grupo: c.grupo || null })),
      serviceS: toSec(o.since),
      stopS: stopped && estados.length ? estados[estados.length - 1].s : BASE,
      req: null, patrolReq: null, pos: null, patrolPos: null,
      alerta: null,        // alerta del radio abierta: { id, tipo, estado, ... }
      escucha: null,       // escucha ambiente activa: { motivo, por, s0, auto }
      dispatch: null,      // unidad despachada a un incidente: { incidentId, stage, ... }
      radioOffUntil: null, // radio apagado por la simulación hasta esta hora
      atenciones: []       // ciclos despacho → en sitio → finalizado (indicadores)
    };
  };
  const ops = FIELD_OPERATORS.map(o => normalize(clone(o)));
  let simSec = 0;

  const now = () => fmtHMS(BASE + simSec);
  const nowHM = () => now().slice(0, 5);
  const byId = id => ops.find(o => o.id === id) || null;
  const chName = id => (FIELD_CHANNELS.find(c => c.id === id) || { name: id }).name;
  const stMeta = k => FIELD_STATUS[k] || { label: k, tone: "info" };
  const srcLabel = src => (src === "bodycam" ? "Bodycam" : "Cámara de patrulla");
  const srcDevice = (o, src) => (src === "bodycam" ? o.bodycam.id : o.patrol.camId);
  const srcVideo = (o, src) => (src === "bodycam" ? o.bodycam.src : o.patrol.src);
  const srcLive = (o, src) => (src === "bodycam" ? (o.bodycam.online && o.bodycam.transmitting) : o.patrol.online);
  /* El muro muestra el clip si el dispositivo está en línea. */
  const srcHasVideo = (o, src) => (src === "bodycam" ? o.bodycam.online : o.patrol.online);
  /* Vista 1: la cámara en línea, salvo que el operador haya elegido una. */
  const shownSource = o => {
    if(!o) return source;
    if(sourceLock) return source;
    if(o.bodycam.online) return "bodycam";
    if(o.patrol.online) return "patrulla";
    return "bodycam";
  };
  const isLive = o => srcLive(o, "bodycam");
  const devOn = (o, k) => (k === "bodycam" ? o.bodycam.online : k === "radio" ? o.radio.online : o.patrol.online);
  const devText = (o, k) => {
    if(k === "bodycam"){
      if(!o.bodycam.online) return "Fuera de línea";
      if(o.bodycam.transmitting) return "Transmitiendo en vivo";
      if(o.req) return o.req.stage === "sent" ? "Solicitud enviada" : "Solicitud aceptada";
      return "En espera";
    }
    if(k === "radio"){
      if(!o.radio.online) return "Fuera de línea";
      if(o.radio.transmitting) return "Transmitiendo";
      return `Escuchando · ${chName(o.channel)}`;
    }
    if(!o.patrol.online) return "Sin señal";
    return o.patrol.recording ? "En línea · grabando" : "En línea · sin grabar";
  };
  const serviceMin = o => Math.max(0, Math.round((BASE + simSec - toSec(o.since)) / 60));
  const CHIP_TONE = { info:"info", warn:"warning", ok:"success", danger:"danger" };
  const chipClass = tone => CHIP_TONE[tone] ? `monitor__chip monitor__chip--${CHIP_TONE[tone]}` : "monitor__chip";
  const statusChip = k => { const m = stMeta(k); return `<span class="${chipClass(m.tone)}">${esc(m.label)}</span>`; };

  let mode = "robots";           // robots | field
  let focusId = "of-ramirez";    // siempre hay un operador seleccionado
  let gridLayout = 1;            // 1 | 2 (bodycam y patrulla del mismo oficial)
  let source = "bodycam";        // cámara de la vista 1: bodycam | patrulla
  let sourceLock = false;        // true cuando el operador eligió la cámara en la vista 2
  let tlOpen = false;
  let tlReplay = false;
  let tlPlaying = false;
  let tlPct = 100;
  let tlTimer = null;
  let tlDur = 0;
  let tlFilmSrc = "";
  const tlFrameCache = new Map();
  let fStatus = "";
  let search = "";
  let markForm = null;           // { opId, src } formulario de evidencia abierto
  let mapFocusId = null;         // operador resaltado en el mapa desde el inventario
  let cardOpId = null;           // oficial con la ficha vertical abierta
  let cardCam = "auto";          // auto | bodycam | patrol
  let cardTab = "op";            // op | msg | hist | act
  let cardListenForm = false;    // formulario de escucha abierto en la ficha
  let busy = false;              // puntero presionado: no reconstruir listas bajo el cursor
  let nextEmergencyAt = FIELD_SIM.emergencyFirstSec;
  let alertKey = "";
  const stageKey = { v: "" };
  const markers = {};
  const evidence = [];
  let evSeq = 1;

  /* Radio */
  const chActive = {};           // canal -> { who, mine, opId, start, until } | null
  FIELD_CHANNELS.forEach(c => { chActive[c.id] = null; });
  const radioHist = [];
  let listenCh = "ch-1";
  let callTarget = "of-ramirez";
  let pttOn = false;
  let filterOpen = false;
  let drawerOpen = false;

  /* ---------- registro ---------- */
  const pushOpLog = (o, text) => {
    o.log.push({ t: nowHM(), text });
    if(o.log.length > 80) o.log.shift();
  };
  const aiLog = (tone, html) => {
    if(!vigiaLog) return;
    const item = document.createElement("div");
    item.className = "log__item is-enter";
    item.innerHTML = `<span class="log__dot log__dot--${tone}"></span><p class="log__text">${html}</p><span class="log__time">${nowHM()}</span>`;
    vigiaLog.appendChild(item);
    while(vigiaLog.children.length > 60) vigiaLog.firstElementChild.remove();
  };
  const pushRadio = (kind, who, ch, text) => {
    radioHist.unshift({ t: nowHM(), kind, who, ch, text });
    if(radioHist.length > 14) radioHist.pop();
  };

  /* ---------- posición y movimiento simulado ---------- */
  const SPEED = FIELD_SIM.speedKmh;
  const randIn = ([a, b]) => a + Math.random() * (b - a);
  const nowS = () => BASE + simSec;
  const hmsOf = s => fmtHMS(s);
  const fmtMS = sec => { const t = Math.max(0, Math.round(sec)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const posAt = (route, p) => {
    if(!route || route.length === 0) return [0, 0];
    if(route.length === 1) return route[0];
    if(p >= 1) return route[route.length - 1];
    const f = (((p % 1) + 1) % 1) * (route.length - 1);
    const i = Math.floor(f);
    const t = f - i;
    const a = route[i];
    const b = route[Math.min(i + 1, route.length - 1)];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const place = o => {
    o.pos = posAt(o.route, o.progress);
    o.patrolPos = [o.pos[0] + 0.00032, o.pos[1] - 0.00020];
  };
  const stepSim = () => {
    const minutes = FIELD_SIM.tickMs / 60000;
    ops.forEach(o => {
      if(o.dispatch) advanceDispatch(o);
      else{
        steer(o);
        if(o.mov.modo !== "detenido") o.progress = (o.progress + FIELD_SIM.stepPerTick * (o.mov.kmh / 20)) % 1;
      }
      if(o.bodycam.online) o.bodycam.battery = Math.max(3, o.bodycam.battery - FIELD_SIM.bodycamDrainPerMin * minutes);
      if(o.radio.online)   o.radio.battery   = Math.max(3, o.radio.battery - FIELD_SIM.radioDrainPerMin * minutes);
      place(o);
    });
  };

  /* ---------- video: solicitud, transmisión, detención ---------- */
  const requestVideo = o => {
    if(!o || o.bodycam.transmitting || o.req) return;
    o.req = { stage: "sent", at: simSec, revive: !o.bodycam.online };
    pushOpLog(o, `Solicitud de video enviada a ${o.bodycam.id}`);
    pushRadio("video", "Centro de mando", o.channel, `Video solicitado · ${o.name} · ${o.bodycam.id}`);
    aiLog("info", `Solicitud de video enviada a <b>${esc(o.bodycam.id)}</b> · ${esc(o.name)}`);
  };
  const requestPatrolVideo = o => {
    if(!o || o.patrol.online || o.patrolReq) return;
    o.patrolReq = { stage: "sent", at: simSec };
    pushOpLog(o, `Solicitud de video enviada a ${o.patrol.camId}`);
    pushRadio("video", "Centro de mando", o.channel, `Video solicitado · ${o.name} · ${o.patrol.camId}`);
    aiLog("info", `Solicitud de video enviada a <b>${esc(o.patrol.camId)}</b> · ${esc(o.name)}`);
  };
  const startTransmit = o => {
    o.req = null;
    o.bodycam.transmitting = true;
    pushOpLog(o, `${o.bodycam.id} transmite en vivo`);
    pushRadio("video", o.name, o.channel, `${o.bodycam.id} transmitiendo en vivo`);
    aiLog("ok", `Bodycam <b>${esc(o.bodycam.id)}</b> comienza a transmitir · ${esc(o.name)}`);
    if(o.patrol.online) aiLog("info", `Cámara de patrulla <b>${esc(o.patrol.camId)}</b> enlazada a ${esc(o.name)}`);
  };
  const stopTransmit = o => {
    if(!o || !o.bodycam.transmitting) return;
    o.bodycam.transmitting = false;
    pushOpLog(o, `${o.bodycam.id} detiene la transmisión`);
  };
  const advanceRequests = () => {
    ops.forEach(o => {
      if(o.req){
        const age = simSec - o.req.at;
        if(!o.bodycam.online && !o.req.revive) o.req = null;
        else{
          if(o.req.stage === "sent" && age >= FIELD_SIM.requestSentSec){
            o.req.stage = "accepted";
            pushOpLog(o, `${o.bodycam.id}: solicitud aceptada`);
          }
          if(o.req && o.req.stage === "accepted" && age >= FIELD_SIM.requestAcceptSec){
            if(o.req.revive && !o.bodycam.online){
              o.bodycam.online = true;
              o.bodycam.recording = true;
              if(o.bodycam.battery < 20) o.bodycam.battery = 48;
              if(!o.bodycam.signal) o.bodycam.signal = 72;
            }
            startTransmit(o);
          }
        }
      }
      if(!o.patrolReq) return;
      if(o.patrol.online){ o.patrolReq = null; return; }
      const age = simSec - o.patrolReq.at;
      if(o.patrolReq.stage === "sent" && age >= FIELD_SIM.requestSentSec){
        o.patrolReq.stage = "accepted";
        pushOpLog(o, `${o.patrol.camId}: solicitud aceptada`);
      }
      if(o.patrolReq && o.patrolReq.stage === "accepted" && age >= FIELD_SIM.requestAcceptSec){
        o.patrol.online = true;
        o.patrol.recording = true;
        o.patrolReq = null;
        pushOpLog(o, `${o.patrol.camId} en línea`);
        pushRadio("video", o.name, o.channel, `${o.patrol.camId} transmitiendo`);
        aiLog("ok", `Cámara de patrulla <b>${esc(o.patrol.camId)}</b> en línea · ${esc(o.name)}`);
      }
    });
  };

  /* ---------- estado derivado: radio, teclas y alertas ---------- */
  const opEstado = o => {
    if(!o.radio.online) return "apagado";
    return o.estados.length ? o.estados[o.estados.length - 1].key : "disponible";
  };
  const alertOpen = o => !!(o.alerta && o.alerta.estado !== "cerrada");
  const alertActive = o => !!(o.alerta && o.alerta.estado === "activa");
  const alertOf = () => ops.find(alertOpen) || null;
  const locLabel = o => (o.radio.online ? `radio ${o.radio.id}` : `bodycam ${o.bodycam.id}`);
  const distKm = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180) * 111, (a[1] - b[1]) * 111);
  const CALL_LABEL = { individual: "Llamada individual", grupo: "Llamada de grupo", telefono: "Enlace telefónico" };

  /* ---------- bitácora unificada ----------
     Un solo registro para todo: estados, alertas, llamadas, mensajes,
     escucha ambiente, video y acciones de la IA. */
  const bitacora = [];
  const BITA_MAX = 400;
  let bitaSeq = 0;
  const bita = (tipo, o, origen, detalle, extra = {}) => {
    bitacora.unshift({
      id: "B" + String(++bitaSeq).padStart(4, "0"),
      s: nowS(),
      t: hmsOf(nowS()),
      tipo,
      opId: o ? o.id : null,
      oficial: extra.oficial || (o ? o.name : "Centro de mando"),
      origen,                      // Oficial | Operador | IA
      detalle,
      nota: extra.nota || "",
      dur: extra.dur || "",
      incidentId: extra.incidentId || null
    });
    if(bitacora.length > BITA_MAX) bitacora.pop();
  };

  /* Estado de sistema que vive fuera de los oficiales. */
  let llamada = null;            // última llamada: en curso, llamando o recién terminada
  let llamadaSeq = 0;
  let alertSeq = 0;
  let incSeq = 0;
  let chainQueue = [];           // trabajo diferido: pasos de la IA, despacho, llamadas
  const aiChains = [];           // cadenas de la IA, una por alerta
  const vigilancia = [];         // señales de vigilancia (activas y resueltas)
  let vigSeq = 0;
  const alertasTurno = [];       // alertas del turno (indicadores)

  const callInvolves = (o, c = llamada) => {
    if(!c || c.estado === "finalizada") return false;
    if(c.tipo === "grupo") return o.group === c.grupo;
    return c.opId === o.id;
  };
  const radioState = o => (!o.radio.online ? "apagado" : (callInvolves(o) ? "llamada" : "encendido"));
  const unreadOf = o => o.mensajes.filter(m => m.de === "of" && !m.leido).length;
  const markRead = o => { o.mensajes.forEach(m => { if(m.de === "of") m.leido = true; }); };

  const incidentUpdate = (incId, text) => {
    const inc = INCIDENTS.find(i => i.id === incId);
    if(!inc) return;
    inc.history = inc.history || [];
    inc.history.push({ t: nowHM(), text });
    if(typeof window.nexusRefreshIncidentDetail === "function") window.nexusRefreshIncidentDetail();
  };

  /* ---------- movimiento: conducción simulada y despacho ---------- */
  const advanceDispatch = o => {
    const d = o.dispatch;
    o.progress = Math.min(1, o.progress + FIELD_SIM.despachoPaso);
    if(d.stage === "en_camino"){
      o.mov.kmh = randIn(SPEED.vehiculo);
      if(o.progress >= 1) arriveDispatch(o);
    }
  };
  const steer = o => {
    const m = o.mov;
    const k = opEstado(o);
    if(m.modo === "detenido"){
      if(k !== "en_sitio" && Math.random() < FIELD_SIM.arrancaChancePerTick){
        m.modo = Math.random() < 0.5 ? "a_pie" : "vehiculo";
        m.kmh = randIn(SPEED[m.modo]);
        if(m.rumbo == null) m.rumbo = Math.round(Math.random() * 359);
      }
      return;
    }
    if(k !== "en_sitio" && Math.random() < FIELD_SIM.paradaChancePerTick){
      m.modo = "detenido";
      m.kmh = 0;
      o.stopS = nowS();
      return;
    }
    const [lo, hi] = SPEED[m.modo] || SPEED.a_pie;
    m.kmh = Math.min(hi, Math.max(lo, m.kmh + randIn([-3, 3])));
    m.rumbo = Math.round(((m.rumbo ?? 0) + randIn([-12, 12]) + 360) % 360);
  };
  const startDispatch = (unit, inc, dest) => {
    unit.dispatch = { incidentId: inc.id, despachoS: nowS(), enSitioS: null, stage: "en_camino" };
    unit.incidentId = inc.id;
    unit.route = [unit.pos.slice(), dest.slice()];
    unit.progress = 0;
    unit.mov = { modo: "vehiculo", kmh: randIn(SPEED.vehiculo), rumbo: unit.mov.rumbo };
    chainQueue.push({ at: nowS() + FIELD_SIM.callRingSec, run: () => {
      if(unit.dispatch && unit.dispatch.stage === "en_camino") setKey(unit, "en_camino", "Oficial");
    } });
  };
  const arriveDispatch = o => {
    const d = o.dispatch;
    d.stage = "en_sitio";
    d.enSitioS = nowS();
    o.mov = { modo: "detenido", kmh: 0, rumbo: o.mov.rumbo };
    o.stopS = nowS();
    setKey(o, "en_sitio", "Oficial");
    chainQueue.push({ at: nowS() + randIn(FIELD_SIM.atencionSec), run: () => finishDispatch(o, d) });
  };
  const finishDispatch = (o, d) => {
    if(o.dispatch !== d) return;
    setKey(o, "finalizado", "Oficial");
    o.dispatch = null;
    o.atenciones.push({ incidentId: d.incidentId, despachoS: d.despachoS, enSitioS: d.enSitioS, finS: nowS() });
    o.incidentId = null;
    o.route = [o.pos.slice(), [o.pos[0] + 0.002, o.pos[1] + 0.001]];
    o.progress = 0;
    o.mov = { modo: "detenido", kmh: 0, rumbo: o.mov.rumbo };
    o.stopS = nowS();
  };

  /* ---------- teclas y radio ---------- */
  const setKey = (o, key, origen) => {
    if(!o || !o.radio.online || key === "apagado" || !FIELD_STATUS[key]) return false;
    if(opEstado(o) === key) return false;
    o.estados.push({ s: nowS(), key });
    if(o.estados.length > 200) o.estados.shift();
    const rk = FIELD_RADIO_KEYS.find(x => x.id === key);
    const label = FIELD_STATUS[key].label;
    bita("Estado", o, origen, label, { nota: rk ? `Tecla ${rk.n} · radio ${o.radio.id}` : "", incidentId: o.incidentId });
    pushOpLog(o, `Reporta por radio: ${label.toLowerCase()}`);
    if(o.incidentId) incidentUpdate(o.incidentId, `${o.name} reporta: ${label.toLowerCase()}`);
    return true;
  };
  const setRadio = (o, on, origen, nota = "") => {
    if(!o || o.radio.online === on) return false;
    o.radio.online = on;
    if(!on) o.radio.transmitting = false;
    bita("Estado", o, origen, on ? "Radio encendido" : "Radio apagado", { nota, incidentId: o.incidentId });
    pushOpLog(o, on ? `Radio ${o.radio.id} encendido` : `Radio ${o.radio.id} apagado`);
    if(!on && llamada && llamada.estado !== "finalizada" && llamada.tipo === "individual" && callInvolves(o)){
      endCall("IA", "radio apagado durante la llamada");
    }
    return true;
  };

  /* ---------- mensajes de radio ---------- */
  const sendMessage = (o, texto, de = "op") => {
    const t = String(texto ?? "").trim();
    if(!o || !t || t.length > FIELD_SIM.msgMaxChars || !o.radio.online) return false;
    o.mensajes.push({ s: nowS(), de, texto: t, leido: true });
    if(o.mensajes.length > 80) o.mensajes.shift();
    bita("Mensaje", o, de === "op" ? "Operador" : "IA", t, { nota: de === "op" ? "Enviado a radio" : "Enviado por IA", incidentId: o.incidentId });
    return true;
  };

  /* ---------- escucha ambiente ----------
     Solo con permiso del operador y motivo obligatorio. Siempre queda
     registrada en bitácora. La IA la activa sola en alertas. */
  const startEscucha = (o, motivo, por, auto = false) => {
    if(!o) return { ok: false, reason: "sin oficial" };
    if(o.escucha) return { ok: false, reason: "ya está activa" };
    if(!o.radio.online) return { ok: false, reason: "radio apagado" };
    const m = String(motivo || "").trim();
    if(!m) return { ok: false, reason: "falta el motivo" };
    o.escucha = { motivo: m, por, s0: nowS(), auto: !!auto };
    bita("Escucha ambiente", o, auto ? "IA" : "Operador", auto ? "Escucha automática activada" : "Escucha ambiente iniciada", { nota: `Escucha: ${por} · Motivo: ${m}`, incidentId: o.incidentId });
    return { ok: true };
  };
  const requestEscucha = (o, motivo) => {
    if(!FIELD_OPERATOR_USER.permisoEscucha) return { ok: false, reason: "sin permiso de escucha" };
    return startEscucha(o, motivo, FIELD_OPERATOR_USER.name, false);
  };
  const endEscucha = (o, origen = "Operador") => {
    if(!o || !o.escucha) return false;
    const e = o.escucha;
    bita("Escucha ambiente", o, origen, "Escucha ambiente terminada", { nota: `Escucha: ${e.por} · Motivo: ${e.motivo}`, dur: fmtMS(nowS() - e.s0), incidentId: o.incidentId });
    o.escucha = null;
    return true;
  };

  /* ---------- llamadas: individual, grupo y enlace telefónico ---------- */
  const callWho = c => {
    if(c.tipo === "grupo") return (FIELD_GROUPS.find(g => g.id === c.grupo) || { name: c.grupo }).name;
    if(c.tipo === "telefono") return (FIELD_PHONE_LINKS.find(l => l.id === c.linkId) || { masked: "Teléfono" }).masked;
    const o = byId(c.opId);
    return o ? o.name : "Oficial";
  };
  const startCall = (tipo, target, origen, por, auto = false, durSec = 0) => {
    if(llamada && llamada.estado !== "finalizada") return { ok: false, reason: "ya hay una llamada en curso" };
    const o = target.opId ? byId(target.opId) : null;
    if(tipo === "individual" || tipo === "telefono"){
      if(!o) return { ok: false, reason: "sin oficial" };
      if(!o.radio.online) return { ok: false, reason: "radio apagado" };
    }
    if(tipo === "grupo" && !FIELD_GROUPS.some(g => g.id === target.grupo)) return { ok: false, reason: "sin grupo" };
    llamadaSeq += 1;
    const phone = tipo === "telefono";
    llamada = {
      id: "LL" + String(llamadaSeq).padStart(3, "0"),
      tipo,
      opId: o ? o.id : null,
      grupo: target.grupo || null,
      linkId: target.linkId || null,
      estado: phone ? "en_curso" : "llamando",
      s0: nowS(),
      sCurso: phone ? nowS() : null,
      origen, por, auto, durSec, dur: 0
    };
    const c = llamada;
    bita("Llamada", o, origen, `${CALL_LABEL[tipo]} · ${callWho(c)} · ${phone ? "en curso" : "llamando"}`, {
      nota: `Por ${por}`,
      incidentId: o ? o.incidentId : null,
      oficial: tipo === "grupo" ? callWho(c) : undefined
    });
    if(o) pushOpLog(o, `${CALL_LABEL[tipo]} ${phone ? "en curso" : "entrante"}`);
    aiLog("info", `${esc(CALL_LABEL[tipo])} · <b>${esc(callWho(c))}</b> · ${esc(por)}`);
    return { ok: true, id: c.id };
  };
  const endCall = (origen, nota = "") => {
    if(!llamada || llamada.estado === "finalizada") return false;
    const c = llamada;
    c.estado = "finalizada";
    c.dur = c.sCurso ? nowS() - c.sCurso : 0;
    const o = c.opId ? byId(c.opId) : null;
    const members = c.tipo === "grupo" ? ops.filter(x => x.group === c.grupo) : (o ? [o] : []);
    members.forEach(m => m.llamadas.unshift({ tipo: c.tipo, s: c.s0, dur: c.dur, por: c.por, grupo: c.grupo }));
    bita("Llamada", o, origen, `${CALL_LABEL[c.tipo]} finalizada · ${callWho(c)}`, {
      nota: nota || (c.sCurso ? `Por ${c.por}` : "sin respuesta"),
      dur: fmtMS(c.dur),
      incidentId: o ? o.incidentId : null,
      oficial: c.tipo === "grupo" ? callWho(c) : undefined
    });
    return true;
  };
  const startPhoneLink = (opId, linkId) => startCall("telefono", { opId, linkId }, "Operador", FIELD_OPERATOR_USER.name);

  /* ---------- alertas del radio ---------- */
  const ensureIncident = (o, tipo, alertId) => {
    const label = FIELD_ALERT_KINDS[tipo].label;
    let inc = o.incidentId ? INCIDENTS.find(i => i.id === o.incidentId) : null;
    if(inc){
      inc.status = "attending";
    }else{
      incSeq += 1;
      inc = {
        id: "inc-f" + incSeq,
        folio: "4300091" + String(100 + incSeq).padStart(3, "0"),
        type: `${label} · ${o.name}`,
        priority: "high",
        status: "attending",
        sector: o.sector,
        address: `${o.sector} · ${locLabel(o)}`,
        elapsed: "00:00",
        cam: "",
        stream: "",
        description: `Creado por ${label.toLowerCase()} de ${o.fullName}. Ubicación tomada del radio ${o.radio.id}; si el radio se apaga, de la bodycam ${o.bodycam.id}.`,
        units: [],
        history: [],
        lng: o.pos[0],
        lat: o.pos[1]
      };
      INCIDENTS.push(inc);
      o.incidentId = inc.id;
    }
    if(o.alerta && o.alerta.id === alertId) o.alerta.incidentId = inc.id;
    incidentUpdate(inc.id, `${label}: ubicación de ${o.name} por ${locLabel(o)}`);
    return inc;
  };
  const dispatchNearest = (o, incId) => {
    const inc = INCIDENTS.find(i => i.id === incId);
    const cands = ops.filter(x => x.id !== o.id && x.radio.online && !x.dispatch && !alertOpen(x) && opEstado(x) === "disponible");
    if(!inc || !cands.length){
      bita("IA", o, "IA", "Sin unidad disponible para el incidente", { incidentId: incId });
      return null;
    }
    const unit = cands.reduce((a, b) => (distKm(a.pos, o.pos) <= distKm(b.pos, o.pos) ? a : b));
    const km = distKm(unit.pos, o.pos);
    startDispatch(unit, inc, o.pos);
    bita("IA", unit, "IA", `Despachado al incidente ${inc.folio} · ${km.toFixed(1)} km`, { incidentId: inc.id });
    incidentUpdate(inc.id, `Unidad despachada: ${unit.name} (${km.toFixed(1)} km)`);
    sendMessage(unit, `Incidente ${inc.folio} · ${inc.type}. Confirma con tu tecla En camino.`, "ia");
    return { unit, km };
  };
  const startPatrolRecording = (o, origen) => {
    if(!o.patrol.online) return false;
    o.patrol.recording = true;
    if(o.bodycam.online) o.bodycam.recording = true;
    bita("Video", o, origen, `${o.patrol.camId} grabando · ${o.bodycam.id} enlazada al mismo incidente`, { incidentId: o.incidentId });
    return true;
  };
  /* Cadena de la IA: cada paso ocurre en su segundo y deja rastro en bitácora. */
  const startChain = (o, alertId, tipo) => {
    const label = FIELD_ALERT_KINDS[tipo].label.toLowerCase();
    const chain = { id: "C" + alertId, alertId, opId: o.id, tipo, estado: "en_curso", incidentId: null, pasos: [], t: hmsOf(nowS()), intervenida: null, bitIds: [] };
    const pasos = [
      { text: `Recibe la alerta de ${label} del radio ${o.radio.id}`, run: () => locLabel(o) },
      { text: "Crea o actualiza el incidente con la ubicación del oficial", run: () => {
        const inc = ensureIncident(o, tipo, alertId);
        chain.incidentId = inc.id;
        return `${inc.folio} · ubicación por ${locLabel(o)}`;
      } },
      { text: `Activa la bodycam ${o.bodycam.id} y enlaza la cámara de patrulla ${o.patrol.camId}`, run: () => {
        requestVideo(o);
        if(o.patrol.online) startPatrolRecording(o, "IA");
        else requestPatrolVideo(o);
        return o.patrol.online ? `${o.patrol.camId} grabando` : `solicitud enviada a ${o.patrol.camId}`;
      } },
      { text: "Despacha a la unidad disponible más cercana y le envía los datos", run: () => {
        const d = dispatchNearest(o, chain.incidentId);
        return d ? `${d.unit.name} · ${d.km.toFixed(1)} km` : "sin unidad disponible";
      } },
      { text: "Activa la escucha ambiente y la registra en bitácora", run: () => {
        const r = startEscucha(o, `Alerta de ${label}`, "Centro de mando (IA)", true);
        return r.ok ? "escucha automática activa" : `no disponible: ${r.reason}`;
      } },
      { text: `Marca el video del momento como evidencia (pregrabación ${FIELD_SIM.pregrabSec} s)`, run: () => {
        addEvidence(o, "bodycam", `Marcada por IA al activar ${label} · pregrabación ${FIELD_SIM.pregrabSec} s`, chain.incidentId);
        if(o.patrol.online) addEvidence(o, "patrol", "Marcada por IA · mismo incidente que la bodycam", chain.incidentId);
        return o.patrol.online ? `${o.bodycam.id} y ${o.patrol.camId}` : o.bodycam.id;
      } }
    ];
    chain.pasos = pasos.map(p => ({ text: p.text, t: "", detalle: "", done: false, skipped: false }));
    aiChains.unshift(chain);
    if(aiChains.length > 20) aiChains.pop();
    const t0 = nowS();
    pasos.forEach((p, i) => {
      chainQueue.push({ at: t0 + FIELD_SIM.cadenaPasosSec[i], run: () => {
        if(chain.intervenida) return;   // el operador frenó la cadena: este paso no se ejecuta
        const det = p.run() || "";
        const st = chain.pasos[i];
        st.done = true;
        st.t = hmsOf(nowS());
        st.detalle = det;
        bita("IA", o, "IA", p.text, { nota: det, incidentId: chain.incidentId });
        chain.bitIds.push(bitacora[0].id);
        if(chain.pasos.every(s => s.done)) chain.estado = "completa";
      } });
    });
  };
  const triggerAlert = (o, tipo, origen) => {
    if(!o || !FIELD_ALERT_KINDS[tipo] || !o.radio.online || alertOpen(o)) return null;
    const label = FIELD_ALERT_KINDS[tipo].label;
    alertSeq += 1;
    const id = "AL" + String(alertSeq).padStart(3, "0");
    o.alerta = { id, tipo, estado: "activa", s: nowS(), t: hmsOf(nowS()), atendidaT: "", atendidaPor: "", cerradaT: "", cerradaPor: "", incidentId: null, origen };
    alertasTurno.push({ opId: o.id, tipo, s: nowS() });
    bita("Alerta", o, origen, origen === "Operador" ? `${label} simulado por el operador` : `${label} activado en el radio ${o.radio.id}`, { incidentId: o.incidentId });
    pushOpLog(o, `Alerta: ${label.toLowerCase()}`);
    pushRadio("emergencia", o.name, o.channel, `ALERTA · ${label.toUpperCase()} · ${o.radio.id}`);
    aiLog("warn", `${esc(label)} · <b>${esc(o.name)}</b> · ${esc(locLabel(o))}`);
    startChain(o, id, tipo);
    return id;
  };
  const markAttended = (o, por) => {
    if(!o || !alertActive(o)) return false;
    const a = o.alerta;
    a.estado = "atendida";
    a.atendidaT = hmsOf(nowS());
    a.atendidaPor = por;
    bita("Alerta", o, "Operador", `${FIELD_ALERT_KINDS[a.tipo].label} atendida`, { nota: `Por ${por}`, incidentId: o.incidentId });
    pushOpLog(o, `Alerta atendida · ${por}`);
    aiLog("ok", `Alerta de <b>${esc(o.name)}</b> atendida · ${esc(por)}`);
    return true;
  };
  const closeAlert = (o, por) => {
    if(!o || !alertOpen(o)) return false;
    const a = o.alerta;
    a.estado = "cerrada";
    a.cerradaT = hmsOf(nowS());
    a.cerradaPor = por;
    bita("Alerta", o, "Operador", `${FIELD_ALERT_KINDS[a.tipo].label} cerrada`, { nota: `Por ${por}`, incidentId: o.incidentId });
    pushOpLog(o, `Alerta cerrada · ${por}`);
    aiLog("ok", `Alerta de <b>${esc(o.name)}</b> cerrada · ${esc(por)}`);
    return true;
  };

  /* ---------- señales de vigilancia de la IA ---------- */
  const signalOn = (o, tipo, texto) => {
    if(vigilancia.some(v => v.activa && v.opId === o.id && v.tipo === tipo)) return;
    vigSeq += 1;
    vigilancia.unshift({ id: "V" + vigSeq, opId: o.id, tipo, texto, t: hmsOf(nowS()), activa: true });
    if(vigilancia.length > 60) vigilancia.pop();
    bita("IA", o, "IA", `Señal de vigilancia: ${texto}`, { incidentId: o.incidentId });
    aiLog("warn", `Señal de vigilancia · <b>${esc(o.name)}</b> · ${esc(texto)}`);
  };
  const signalOff = (o, tipo) => {
    vigilancia.forEach(v => { if(v.activa && v.opId === o.id && v.tipo === tipo) v.activa = false; });
  };
  const watch = () => {
    const now = nowS();
    ops.forEach(o => {
      const enServicio = now - o.serviceS < 8 * 3600;
      if(enServicio && !o.radio.online){
        signalOn(o, "radio", o.bodycam.online
          ? `Radio ${o.radio.id} apagado · ubicación por bodycam ${o.bodycam.id}`
          : `Radio ${o.radio.id} apagado y sin ubicación`);
      }else signalOff(o, "radio");

      const detenidoMucho = o.incidentId && o.mov.modo === "detenido" && now - o.stopS >= FIELD_SIM.stoppedAlertMin * 60;
      if(detenidoMucho) signalOn(o, "detenido", `Detenido ${Math.round((now - o.stopS) / 60)} min en el incidente ${o.incidentId}`);
      else signalOff(o, "detenido");

      if(o.radio.online && opEstado(o) === "en_sitio" && o.mov.kmh > 20) signalOn(o, "velocidad", `Velocidad ${Math.round(o.mov.kmh)} km/h con estado En sitio`);
      else signalOff(o, "velocidad");
    });
  };

  /* ---------- simulación de la semana: alertas, teclas, llamadas, mensajes ---------- */
  const runChain = () => {
    const t = nowS();
    const due = chainQueue.filter(j => j.at <= t);
    if(!due.length) return;
    chainQueue = chainQueue.filter(j => j.at > t);
    due.forEach(j => j.run());
  };
  const simRadios = () => {
    ops.forEach(o => {
      if(o.radioOffUntil && nowS() >= o.radioOffUntil){
        o.radioOffUntil = null;
        setRadio(o, true, "Oficial", "Reconexión de radio");
      }
      if(!o.radio.online || o.radioOffUntil || alertOpen(o) || o.dispatch) return;
      if(Math.random() < FIELD_SIM.radioOffChancePerTick){
        setRadio(o, false, "Oficial", "Pérdida de señal simulada");
        o.radioOffUntil = nowS() + randIn(FIELD_SIM.radioOffSec);
      }
    });
  };
  const simKeys = () => {
    if(Math.random() > FIELD_SIM.radioKeyChancePerTick) return;
    const pool = ops.filter(o => o.radio.online && !o.dispatch && !alertOpen(o));
    if(!pool.length) return;
    const o = pool[Math.floor(Math.random() * pool.length)];
    const opts = ["disponible", "en_camino", "en_sitio", "finalizado"].filter(k => k !== opEstado(o));
    setKey(o, opts[Math.floor(Math.random() * opts.length)], "Oficial");
  };
  const simCalls = () => {
    if(llamada && llamada.estado !== "finalizada") return;
    if(Math.random() > FIELD_SIM.callChancePerTick) return;
    const dur = randIn(FIELD_SIM.llamadaDurSec);
    if(Math.random() < 0.6){
      const pool = ops.filter(o => o.radio.online && !o.dispatch);
      if(!pool.length) return;
      const o = pool[Math.floor(Math.random() * pool.length)];
      startCall("individual", { opId: o.id }, "Oficial", o.name, true, dur);
    }else{
      const g = FIELD_GROUPS[Math.floor(Math.random() * FIELD_GROUPS.length)];
      const members = ops.filter(o => o.group === g.id && o.radio.online);
      if(!members.length) return;
      const who = members[Math.floor(Math.random() * members.length)];
      startCall("grupo", { grupo: g.id }, "Oficial", who.name, true, dur);
    }
  };
  const tickCall = () => {
    if(!llamada || llamada.estado === "finalizada") return;
    const c = llamada;
    const t = nowS();
    if(c.estado === "llamando" && t - c.s0 >= FIELD_SIM.callRingSec){
      c.estado = "en_curso";
      c.sCurso = t;
    }
    if(c.estado === "en_curso" && c.auto && c.durSec && t - c.sCurso >= c.durSec) endCall(c.origen);
  };
  const simMessages = () => {
    if(Math.random() > FIELD_SIM.msgChancePerTick) return;
    const pool = ops.filter(o => o.radio.online);
    if(!pool.length) return;
    const o = pool[Math.floor(Math.random() * pool.length)];
    const texto = FIELD_MESSAGE_POOL[Math.floor(Math.random() * FIELD_MESSAGE_POOL.length)];
    o.mensajes.push({ s: nowS(), de: "of", texto, leido: false });
    if(o.mensajes.length > 80) o.mensajes.shift();
    bita("Mensaje", o, "Oficial", texto, { incidentId: o.incidentId });
  };
  const maybeAlert = () => {
    if(simSec < nextEmergencyAt) return;
    const [a, b] = FIELD_SIM.emergencyEverySec;
    nextEmergencyAt = simSec + a + Math.random() * (b - a);
    const pool = ops.filter(o => o.radio.online && !alertOpen(o) && !o.dispatch);
    if(!pool.length) return;
    const o = pool[Math.floor(Math.random() * pool.length)];
    triggerAlert(o, Math.random() < 0.5 ? "emergencia" : "hombre_caido", "Oficial");
  };

  /* ---------- radio ---------- */
  const callOp = o => {
    if(!o || !o.radio.online) return;
    if(chActive[o.channel]){
      pushRadio("llamada", "Centro de mando", o.channel, `Canal ocupado · no se pudo llamar a ${o.name}`);
      return;
    }
    chActive[o.channel] = { who: "Centro de mando (tú)", mine: true, opId: null, start: simSec, until: simSec + 4 };
    pushRadio("llamada", "Centro de mando", o.channel, `Llamada directa a ${o.name} · ${o.radio.id}`);
    pushOpLog(o, "Llamada directa del centro de mando");
    aiLog("info", `Llamada directa a <b>${esc(o.name)}</b> · ${esc(chName(o.channel))}`);
  };
  const pttDown = () => {
    if(pttOn || chActive[listenCh]) return;
    pttOn = true;
    chActive[listenCh] = { who: "Centro de mando (tú)", mine: true, opId: null, start: simSec, until: Infinity };
    renderRadio();
  };
  const pttUp = () => {
    if(!pttOn) return;
    pttOn = false;
    const a = chActive[listenCh];
    if(a && a.mine) a.until = simSec;
    renderRadio();
  };
  /* HUD de voz: llamar, grupo y escucha del oficial en foco (sustituye a Hablar) */
  let voiceFor = null;          // oficial al que corresponde el estado del HUD
  let voiceListenOpen = false;  // formulario de escucha abierto
  let voiceErr = "";            // motivo del último intento fallido
  const paintVoice = () => {
    const o = byId(focusId);
    if(!o) return;
    if(voiceFor !== o.id){ voiceFor = o.id; voiceListenOpen = false; voiceErr = ""; }
    const on = o.radio.online;
    const busyLine = !!(llamada && llamada.estado !== "finalizada");
    const inCall = callInvolves(o);
    const permiso = !!FIELD_OPERATOR_USER.permisoEscucha;
    const grp = FIELD_GROUPS.find(g => g.id === o.group);
    const callBtn = $("field-voice-call");
    if(callBtn){
      callBtn.textContent = inCall ? "Colgar" : "Llamar";
      callBtn.disabled = !inCall && (busyLine || !on);
      callBtn.title = inCall ? `Colgar la llamada con ${o.name}`
        : !on ? "Radio apagado: no se puede llamar"
        : busyLine ? "Ya hay una llamada en curso"
        : `Llamada individual a ${o.name}`;
    }
    const grpBtn = $("field-voice-group");
    if(grpBtn){
      grpBtn.disabled = busyLine || !on || !grp;
      grpBtn.title = !on ? "Radio apagado: no se puede llamar"
        : !grp ? "Sin grupo de radio"
        : busyLine ? "Ya hay una llamada en curso"
        : `Llamada a ${grp.name}`;
    }
    const listenBtn = $("field-voice-listen");
    const listening = !!o.escucha;
    const formOpen = voiceListenOpen && !listening && permiso && on;
    if(listenBtn){
      listenBtn.textContent = listening ? "Fin escucha" : "Escucha";
      listenBtn.disabled = !permiso || (!listening && !on);
      listenBtn.title = !permiso ? "Sin permiso de escucha"
        : listening ? "Terminar la escucha ambiente"
        : !on ? "Radio apagado: no hay escucha"
        : "Escucha ambiente con motivo";
      listenBtn.setAttribute("aria-pressed", String(listening));
      listenBtn.setAttribute("aria-expanded", String(formOpen));
    }
    const form = $("field-voice-form");
    if(form) form.hidden = !formOpen;
    const hint = $("field-voice-hint");
    if(hint){
      const text = voiceErr ? `No inicia: ${voiceErr}`
        : !permiso ? "Sin permiso de escucha"
        : !on ? "Radio fuera de línea: sin llamada ni escucha"
        : busyLine && !inCall ? "Hay una llamada en curso"
        : "Simulado, sin audio real";
      if(hint.textContent !== text) hint.textContent = text;
    }
  };
  const voiceAct = fn => () => { fn(); render(true); };
  const setDrawer = open => {
    drawerOpen = open;
    const drawer = $("field-drawer");
    const openBtn = $("field-log-open");
    if(drawer) drawer.hidden = !open;
    if(openBtn){
      openBtn.hidden = open;
      openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
  };
  const closeTransmissions = () => {
    Object.keys(chActive).forEach(ch => {
      const a = chActive[ch];
      if(!a || a.until === Infinity || simSec < a.until) return;
      const dur = Math.max(1, Math.round(simSec - a.start));
      if(a.opId){
        const o = byId(a.opId);
        if(o) o.radio.transmitting = false;
      }
      pushRadio("voz", a.who, ch, `Transmisión · ${dur} s`);
      chActive[ch] = null;
    });
  };
  const chatter = () => {
    if(Math.random() > FIELD_SIM.radioChatterChance) return;
    const ch = FIELD_CHANNELS[Math.floor(Math.random() * FIELD_CHANNELS.length)].id;
    if(chActive[ch]) return;
    const pool = ops.filter(o => o.radio.online && o.channel === ch);
    const speaker = pool.length && Math.random() > 0.25 ? pool[Math.floor(Math.random() * pool.length)] : null;
    const dur = 4 + Math.floor(Math.random() * 4);
    chActive[ch] = {
      who: speaker ? speaker.name : "Central C5",
      mine: false,
      opId: speaker ? speaker.id : null,
      start: simSec,
      until: simSec + dur
    };
    if(speaker) speaker.radio.transmitting = true;
  };

  /* ---------- evidencia ---------- */
  const addEvidence = (o, src, note, incidentId) => {
    const device = srcDevice(o, src);
    const ev = {
      id: "EV-" + String(evSeq++).padStart(3, "0"),
      opId: o.id,
      source: src,
      deviceId: device,
      sec: simSec,
      t: now(),
      note: String(note || "").trim(),
      incidentId: incidentId || null
    };
    evidence.unshift(ev);
    pushOpLog(o, `Evidencia ${ev.id} marcada · ${device}`);
    const inc = INCIDENTS.find(i => i.id === ev.incidentId);
    if(inc) aiLog("ok", `Evidencia <b>${esc(ev.id)}</b> vinculada a incidente <b>${esc(inc.folio)}</b> · ${esc(device)}`);
    if(typeof window.nexusRefreshIncidentDetail === "function") window.nexusRefreshIncidentDetail();
    return ev;
  };
  const evidenceFor = incId => {
    const list = evidence.filter(e => e.incidentId === incId);
    return list.map(e => {
      const o = byId(e.opId);
      const rel = list
        .filter(x => x.id !== e.id && x.opId !== e.opId && Math.abs(x.sec - e.sec) <= FIELD_SIM.relatedWindowSec)
        .map(x => byId(x.opId).name);
      return `<li class="field-ev">`
        + `<span class="field-ev__t">${esc(e.t)}</span>`
        + `<span class="field-ev__body">`
        + `<span class="field-ev__who"><b>${esc(o.name)}</b> · ${esc(srcLabel(e.source))} ${esc(e.deviceId)}</span>`
        + (e.note ? `<span class="field-ev__note">${esc(e.note)}</span>` : "")
        + (rel.length ? `<span class="field-ev__rel">Coincide en tiempo con ${esc([...new Set(rel)].join(", "))}</span>` : "")
        + `<span class="field-ev__id">${esc(e.id)}</span>`
        + `</span></li>`;
    }).join("");
  };

  /* ---------- navegación ---------- */
  const goMap = pos => {
    if(typeof window.nexusSetModule === "function") window.nexusSetModule("operacion");
    if(pos && typeof window.nexusFocusMapOnPoint === "function"){
      window.nexusFocusMapOnPoint(pos[0], pos[1], { zoom: 16.8, duration: 900 });
    }
  };
  const openIncident = id => {
    if(typeof window.nexusSetModule === "function") window.nexusSetModule("operacion");
    if(typeof window.nexusOpenMode === "function") window.nexusOpenMode("incidents");
    if(typeof window.nexusOpenIncidentById === "function") window.nexusOpenIncidentById(id);
  };
  const setMode = next => {
    mode = next;
    if(mode === "robots" && monitorCount && typeof MONITOR_FLEET !== "undefined"){
      monitorCount.textContent = `${MONITOR_FLEET.length} unidades`;
    }
    render(true);
  };
  // monitor.js reescribe el contador con las unidades de robots; en modo oficiales lo mantenemos.
  if(monitorCount){
    new MutationObserver(() => {
      if(mode !== "field") return;
      const want = `${ops.length} oficiales`;
      if(monitorCount.textContent !== want) monitorCount.textContent = want;
    }).observe(monitorCount, { childList: true, characterData: true, subtree: true });
  }
  const openOperator = id => {
    const o = byId(id);
    if(!o) return;
    focusId = id;
    gridLayout = 1;
    markForm = null;
    if(typeof window.nexusCloseDevcard === "function") window.nexusCloseDevcard();
    if(typeof window.nexusSetModule === "function") window.nexusSetModule("monitoreo");
    setMode("field");
  };
  window.nexusFieldOpenOperator = openOperator;
  /* Abrir un robot desde el mapa debe mostrar la vista de robots, no la de oficiales. */
  if(typeof window.nexusOpenMonitor === "function"){
    const openFleetMonitor = window.nexusOpenMonitor;
    window.nexusOpenMonitor = key => {
      if(mode !== "robots") setMode("robots");
      return openFleetMonitor(key);
    };
  }

  /* Clic en el marcador: ficha vertical del oficial. Doble clic: monitoreo. */
  const ofcard = document.getElementById("ofcard");
  const STATUS_CLASS = {
    danger:"status--danger", warn:"status--warning", ok:"status--success",
    info:"status--info", muted:"status--muted"
  };
  let markerClickTimer = null;

  const closeOfficerCard = () => {
    const wasOpen = !!(ofcard && !ofcard.hidden);
    cardListenForm = false;
    if(ofcard) ofcard.hidden = true;
    cardOpId = null;
    cardCam = "auto";
    const media = document.getElementById("ofcard-media");
    if(media){
      media.innerHTML = "";
      delete media.dataset.key;
    }
    if(wasOpen || mapFocusId){
      mapFocusId = null;
      if(wasOpen && typeof window.nexusClearMapRoute === "function") window.nexusClearMapRoute();
      renderMarkers();
    }
  };
  window.nexusFieldOnCardClose = closeOfficerCard;

  const openMapCard = id => {
    const o = byId(id);
    if(!o || !ofcard) return;
    if(cardOpId === id && !ofcard.hidden){
      closeOfficerCard();
      return;
    }
    if(typeof window.nexusCloseDevcard === "function") window.nexusCloseDevcard();
    if(typeof window.nexusSetModule === "function") window.nexusSetModule("operacion");
    cardOpId = id;
    cardCam = "auto";
    cardTab = "op";
    cardListenForm = false;
    ofcard.hidden = false;
    mapFocusId = id;
    const inc = o.incidentId && typeof INCIDENTS !== "undefined"
      ? INCIDENTS.find(i => i.id === o.incidentId) : null;
    if(inc && inc.lng != null && o.pos && typeof window.nexusShowRouteToPoint === "function"){
      window.nexusShowRouteToPoint(o.pos, [Number(inc.lng), Number(inc.lat)], {
        kind:"ground", colorToken:"--accent-blue", key:"field:" + id
      });
    }else if(typeof window.nexusClearMapRoute === "function"){
      window.nexusClearMapRoute();
    }
    if(o.pos && typeof window.nexusFocusMapOnPoint === "function"){
      window.nexusFocusMapOnPoint(o.pos[0], o.pos[1], { zoom:15.6, duration:800 });
    }
    paintOfficerCard();
    renderMarkers();
  };

  /* ---------- mapa: marcadores de operador ---------- */
  const layerOn = k => document.querySelector(`.layer[data-layer="${k}"]`)?.getAttribute("aria-pressed") === "true";
  const visibleOnMap = o => {
    const layers = ["bodycam", "radio", "patrulla"].some(layerOn);
    if(!layers) return false;
    if(!o.radio.online && !o.bodycam.online) return true;
    return ["bodycam", "radio", "patrulla"].some(k => devOn(o, k) && layerOn(k));
  };

  const ensureMarkers = () => {
    if(Object.keys(markers).length || !window.nexusMap || typeof maplibregl === "undefined") return;
    ops.forEach(o => {
      const anchor = document.createElement("div");
      anchor.className = "marker-anchor oficial-anchor";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "marker marker--oficial";
      btn.dataset.fieldMarker = o.id;
      btn.innerHTML = `<span class="marker--oficial__ini" aria-hidden="true"></span>`
        + `<span class="marker--oficial__rumbo" aria-hidden="true"></span>`
        + `<span class="marker--oficial__devs" aria-hidden="true">`
        + `<i data-dev="bodycam"></i><i data-dev="patrulla"></i><i data-dev="radio"></i></span>`
        + `<span class="marker--oficial__tag" hidden></span>`;
      btn.title = "Clic: ficha en el mapa · Doble clic: monitoreo";
      btn.addEventListener("click", e => {
        e.stopPropagation();
        clearTimeout(markerClickTimer);
        markerClickTimer = setTimeout(() => openMapCard(o.id), 230);
      });
      btn.addEventListener("dblclick", e => {
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(markerClickTimer);
        openOperator(o.id);
      });
      anchor.appendChild(btn);
      const marker = new maplibregl.Marker({ element: anchor }).setLngLat(o.pos).addTo(window.nexusMap);
      markers[o.id] = { marker, anchor, btn };
    });
  };
  const renderMarkers = () => {
    ensureMarkers();
    ops.forEach(o => {
      const mk = markers[o.id];
      if(!mk) return;
      mk.marker.setLngLat(o.pos);
      const b = mk.btn;
      b.hidden = !visibleOnMap(o);
      b.classList.toggle("is-emergency", alertActive(o));
      b.classList.toggle("is-radio", !!o.radio.transmitting && !alertActive(o));
      b.classList.toggle("is-live", isLive(o));
      b.classList.toggle("is-offline", !o.radio.online);
      b.setAttribute("aria-label", `${o.name}, ${stMeta(opEstado(o)).label}`);
      const ini = b.querySelector(".marker--oficial__ini");
      if(ini && ini.textContent !== o.initials) ini.textContent = o.initials;
      /* Flecha de rumbo: solo si la unidad se mueve y tiene rumbo */
      const moving = !!(o.mov && o.mov.modo !== "detenido" && o.mov.rumbo != null);
      const arrow = b.querySelector(".marker--oficial__rumbo");
      if(arrow){
        arrow.hidden = !moving;
        if(moving) arrow.style.setProperty("--rumbo", `${Math.round(o.mov.rumbo)}deg`);
      }
      /* Etiqueta bajo la punta: solo si hay algo que atender (radio apagado o alerta abierta) */
      const tag = b.querySelector(".marker--oficial__tag");
      if(tag){
        const txt = !o.radio.online ? "Radio apagado"
          : alertOpen(o) ? FIELD_ALERT_KINDS[o.alerta.tipo].label : "";
        tag.hidden = !txt;
        if(tag.textContent !== txt) tag.textContent = txt;
        tag.dataset.tone = !o.radio.online ? "off" : "alert";
      }
      ["bodycam", "radio", "patrulla"].forEach(k => {
        const dot = b.querySelector(`[data-dev="${k}"]`);
        if(!dot) return;
        const on = devOn(o, k);
        const st = on ? "on" : "off";
        if(dot.dataset.state !== st) dot.dataset.state = st;
        const tip = `${FIELD_DEVICE_LABEL[k]}: ${on ? "en línea" : "fuera de línea"}`;
        if(dot.title !== tip) dot.title = tip;
      });
      mk.anchor.classList.toggle("is-op-focus", mapFocusId === o.id);
    });
  };
  window.nexusFieldApplyLayers = () => renderMarkers();

  /* ---------- fuente, grid y modo ---------- */
  const renderSourceUi = () => {
    if(monitorRoot.dataset.source !== mode) monitorRoot.dataset.source = mode;
    document.querySelectorAll("[data-monitor-source]").forEach(b => {
      const on = b.dataset.monitorSource === mode;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    viewEl.hidden = mode !== "field";
    viewEl.dataset.cams = String(gridLayout);
    if(fleetEl) fleetEl.hidden = mode !== "field";
    document.querySelectorAll("[data-field-grid]").forEach(b => {
      const on = Number(b.dataset.fieldGrid) === gridLayout;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  };

  /* ---------- resumen, filtros y lista ---------- */
  const renderSummary = () => {
    summaryEl.innerHTML = Object.keys(FIELD_STATUS).map(k => {
      const m = FIELD_STATUS[k];
      const n = ops.filter(o => opEstado(o) === k).length;
      return `<div class="field-sum field-sum--${m.tone}" role="listitem">`
        + `<span class="field-sum__n">${n}</span><span class="field-sum__l">${esc(m.label)}</span></div>`;
    }).join("");
    if(sourceCountEl) sourceCountEl.textContent = ops.length;
    if(mode === "field" && monitorCount) monitorCount.textContent = `${ops.length} oficiales`;
  };
  const syncFilter = () => {
    if(filterLabel){
      if(!fStatus){
        filterLabel.textContent = "Todos";
        filterLabel.className = "monitor__filter-label";
      }else{
        const m = stMeta(fStatus);
        filterLabel.className = `monitor__filter-label ${chipClass(m.tone)}`;
        filterLabel.textContent = m.label;
      }
    }
    filterBtn?.classList.toggle("is-filtered", !!fStatus);
    filterMenu?.querySelectorAll(".monitor__filter-opt").forEach(opt => {
      const on = (opt.dataset.fStatus || "") === fStatus;
      opt.classList.toggle("is-active", on);
      opt.setAttribute("aria-selected", on ? "true" : "false");
    });
  };
  const setFilterOpen = open => {
    filterOpen = open;
    if(filterMenu) filterMenu.hidden = !open;
    filterBtn?.classList.toggle("is-open", open);
    filterBtn?.setAttribute("aria-expanded", open ? "true" : "false");
  };
  const fillFilter = () => {
    if(!filterMenu || filterMenu.dataset.ready) return;
    const opts = [
      { key:"", label:"Todos", tone:null },
      ...Object.keys(FIELD_STATUS).map(k => ({ key:k, label:FIELD_STATUS[k].label, tone:FIELD_STATUS[k].tone }))
    ];
    filterMenu.innerHTML = opts.map(o =>
      `<button type="button" class="monitor__filter-opt" role="option" data-f-status="${o.key}" aria-selected="false">`
      + `<span class="${o.tone ? chipClass(o.tone) : "monitor__chip"}">${esc(o.label)}</span></button>`
    ).join("");
    filterMenu.dataset.ready = "1";
    syncFilter();
  };
  const filtered = () => {
    const q = search.trim().toLowerCase();
    return ops
      .filter(o => {
        if(fStatus && opEstado(o) !== fStatus) return false;
        if(!q) return true;
        return `${o.name} ${o.fullName} ${o.badge} ${o.patrol.id} ${o.bodycam.id} ${o.radio.id}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const rk = x => (alertOpen(x) ? -1 : (FIELD_STATUS_RANK[opEstado(x)] ?? 9));
      const d = rk(a) - rk(b);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      });
  };
  const RADIO_ROW = { encendido: "Radio encendido", llamada: "En llamada", apagado: "Radio apagado" };
  const renderList = () => {
    const list = filtered();
    countEl.textContent = `${list.length} de ${ops.length} operadores`;
    if(!list.length){
      listEl.innerHTML = `<li class="field-fleet__empty">Sin coincidencias con estos filtros.</li>`;
      return;
    }
    listEl.innerHTML = list.map(o => {
      const active = o.id === focusId;
      const alert = alertActive(o) ? " is-alert" : "";
      const rs = radioState(o);
      const unread = unreadOf(o);
      const alertTag = alertOpen(o)
        ? `<span class="field-item__alert${alertActive(o) ? "" : " is-done"}">${alertActive(o) ? "Alerta" : "Atendida"}</span>`
        : "";
      return `<li role="none">`
        + `<button type="button" class="monitor__item${active ? " is-active" : ""}${alert}" role="option" aria-selected="${active}" data-field-op="${o.id}">`
        + `<span class="field__avatar" aria-hidden="true">${esc(o.initials)}</span>`
        + `<span class="monitor__item-body">`
        + `<span class="monitor__item-code">${esc(o.name)}<span class="monitor__item-sep" aria-hidden="true"> / </span><span class="monitor__item-type">${esc(o.patrol.id)}</span></span>`
        + `<span class="monitor__item-row">${alertTag}${statusChip(opEstado(o))}`
        + `<span class="monitor__item-mode">${esc(o.sector)}</span></span>`
        + `<span class="monitor__item-row field-item__radio is-${rs}">`
        + `<span class="field-item__state">${RADIO_ROW[rs] || rs}</span>`
        + (unread ? `<span class="field-item__unread" title="Mensajes del oficial sin leer">${unread} sin leer</span>` : "")
        + `</span>`
        + `</span></button></li>`;
    }).join("");
  };

  /* ---------- panel de radios (quinto modo del orbe, columna derecha) ---------- */
  const rd = { view: "radios", q: "", est: "", grp: "", sel: null };
  const RD_ICON = {
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    msg: '<path d="M4 5h16v11H9l-5 4z"/>',
    group: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 5"/>'
  };
  const rdIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RD_ICON[k]}</svg>`;
  const rdBusy = () => !!(llamada && llamada.estado !== "finalizada");
  const rdGroupLive = gid => !!(rdBusy() && llamada.tipo === "grupo" && llamada.grupo === gid);
  const rdLast = o => {
    const times = [o.estados.at(-1), o.mensajes.at(-1)]
      .map(x => (x && typeof x.s === "number" ? x.s : null)).filter(t => t !== null);
    if(!times.length) return "—";
    const d = Math.max(0, Math.round(nowS() - Math.max(...times)));
    return d < 60 ? `hace ${d} s` : `hace ${Math.round(d / 60)} min`;
  };
  const rdPill = o => {
    if(!o.radio.online) return { key: "off", label: "Apagado" };
    if(callInvolves(o)) return { key: "call", label: llamada.tipo === "grupo" ? "Llamada grupo" : "Llamada indiv." };
    return { key: "on", label: "Encendido" };
  };
  const rdMatch = o => {
    const q = rd.q.trim().toLowerCase();
    if(q && !`${o.radio.id} ${o.name} ${o.fullName}`.toLowerCase().includes(q)) return false;
    if(rd.est && radioState(o) !== { on: "encendido", off: "apagado", call: "llamada" }[rd.est]) return false;
    return !rd.grp || o.group === rd.grp;
  };
  const rdRow = o => {
    const sel = rd.sel === o.id;
    const pill = rdPill(o);
    const callDis = !o.radio.online || rdBusy();
    return `<li class="radios-row${sel ? " is-sel" : ""}">`
      + `<button type="button" class="radios-row__main" data-rd-sel="${o.id}" aria-pressed="${sel}" title="Poner en foco en el mapa">`
      + `<span class="radios-row__id">${esc(o.radio.id)}</span>`
      + `<span class="radios-row__who"><span class="radios-row__name">${esc(o.name)}</span>`
      + `<span class="radios-row__last">Último reporte ${esc(rdLast(o))}</span></span>`
      + `<span class="radios-pill is-${pill.key}">${esc(pill.label)}</span></button>`
      + `<button type="button" class="radios-row__act" data-rd-call="${o.id}" aria-label="Llamada individual con ${esc(o.name)}"${callDis ? " disabled" : ""}>${rdIcon("phone")}</button>`
      + `<button type="button" class="radios-row__act" data-rd-msg="${o.id}" aria-label="Mensaje a ${esc(o.name)}"${o.radio.online ? "" : " disabled"}>${rdIcon("msg")}</button>`
      + `</li>`;
  };
  const rdGroupDisabled = (g, live) => !live && (rdBusy() || !ops.some(o => o.group === g.id && o.radio.online));
  const rdGroupSection = g => {
    const all = ops.filter(o => o.group === g.id);
    const rows = all.filter(rdMatch);
    if(!rows.length) return "";
    const live = rdGroupLive(g.id);
    return `<section class="radios-group">`
      + `<div class="radios-group__head"><h3 class="radios-group__name">${esc(g.name)}</h3>`
      + `<span class="radios-group__count">${rows.length} de ${all.length}</span><span class="radios-group__grow"></span>`
      + `<button type="button" class="radios-group__call${live ? " is-live" : ""}" data-rd-grp="${g.id}"${rdGroupDisabled(g, live) ? " disabled" : ""}>`
      + `${rdIcon("group")}${live ? "Colgar grupo" : "Llamada de grupo"}</button></div>`
      + `<ul class="radios-list">${rows.map(rdRow).join("")}</ul></section>`;
  };
  const rdGroupCard = g => {
    const all = ops.filter(o => o.group === g.id);
    const live = rdGroupLive(g.id);
    const ind = rdBusy() && llamada.tipo === "individual" && all.some(o => o.id === llamada.opId);
    const activity = live ? `Llamada de grupo en curso · ${llamada.por}`
      : ind ? "1 llamada individual en curso" : "Sin actividad";
    return `<li class="radios-card">`
      + `<span class="radios-card__icon">${rdIcon("group")}</span>`
      + `<div class="radios-card__body"><p class="radios-card__name">${esc(g.name)}</p>`
      + `<p class="radios-card__members">${all.length} integrantes</p>`
      + `<p class="radios-card__act${live || ind ? " is-live" : ""}">${esc(activity)}</p></div>`
      + `<button type="button" class="radios-group__call${live ? " is-live" : ""}" data-rd-grp="${g.id}"${rdGroupDisabled(g, live) ? " disabled" : ""}>`
      + `${live ? "Colgar grupo" : "Llamada de grupo"}</button></li>`;
  };
  const rdFoot = () => {
    const o = byId(rd.sel || focusId);
    if(!o) return;
    const grp = FIELD_GROUPS.find(g => g.id === o.group);
    const live = !!grp && rdGroupLive(grp.id);
    const busy = rdBusy();
    const label = $("radios-focus-label");
    if(label) label.textContent = `${o.radio.id} · ${o.name}${o.radio.online ? "" : " · radio apagado"}`;
    const ind = $("radios-act-ind");
    if(ind) ind.disabled = !o.radio.online || busy;
    const gb = $("radios-act-grp");
    if(gb){
      gb.disabled = !grp || (!live && rdGroupDisabled(grp, false));
      gb.textContent = live ? "Colgar grupo" : "Llamada de grupo";
    }
    const msg = $("radios-act-msg");
    if(msg) msg.disabled = !o.radio.online;
    const hint = $("radios-hint");
    if(hint){
      const text = !o.radio.online ? "Radio apagado: no hay llamada ni mensaje"
        : busy && !live && !callInvolves(o) ? "Hay una llamada en curso"
        : "";
      if(hint.textContent !== text) hint.textContent = text;
    }
  };
  const renderRadios = () => {
    const panel = $("radios-panel");
    if(!panel || panel.hidden) return;
    const count = st => ops.filter(o => radioState(o) === st).length;
    const setT = (id, t) => { const el = $(id); if(el && el.textContent !== t) el.textContent = t; };
    setT("radios-sum-on", String(count("encendido")));
    setT("radios-sum-off", String(count("apagado")));
    setT("radios-sum-call", String(count("llamada")));
    setT("radios-sub", `${ops.length} radios en ${FIELD_GROUPS.length} grupos`);
    panel.querySelectorAll("[data-rd-view]").forEach(t => {
      const on = t.dataset.rdView === rd.view;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    const groups = FIELD_GROUPS.filter(g => !rd.grp || g.id === rd.grp);
    const body = $("radios-body");
    if(body){
      const html = rd.view === "radios"
        ? (groups.map(rdGroupSection).join("") || `<p class="radios-empty">Ningún radio coincide con la búsqueda o los filtros.</p>`)
        : `<ul class="radios-cards">${groups.map(rdGroupCard).join("")}</ul>`;
      putHtml(body, html);
    }
    rdFoot();
  };
  const rdSelect = id => {
    const o = byId(id);
    if(!o) return;
    rd.sel = id;
    focusId = id;
    if(!(cardOpId === id && ofcard && !ofcard.hidden)) openMapCard(id);
    render(true);
  };
  const rdCall = id => {
    const o = byId(id);
    if(!o || !o.radio.online || rdBusy()) return;
    startCall("individual", { opId: o.id }, "Operador", FIELD_OPERATOR_USER.name);
    render(true);
  };
  const rdGroup = gid => {
    if(rdGroupLive(gid)) endCall("Operador");
    else startCall("grupo", { grupo: gid }, "Operador", FIELD_OPERATOR_USER.name);
    render(true);
  };
  const rdMsg = id => {
    const o = byId(id);
    if(!o || !o.radio.online) return;
    rd.sel = id;
    if(!(cardOpId === id && ofcard && !ofcard.hidden)) openMapCard(id);
    cardTab = "msg";
    render(true);
  };

  /* ---------- panel de IA: cadena de campo, señales y actividad ----------
     Cada alerta abre una cadena con pasos y hora. «Intervenir» frena la
     cadena: los pasos que faltan no se ejecutan. */
  const faiRoot = {
    panel: $("ai-panel"), chains: $("fai-chains"), signals: $("fai-signals"),
    activity: $("fai-activity"), count: $("fai-count")
  };
  const faiOpenLog = new Set();   // cadenas con su bitácora desplegada
  const FAI_CHECK = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="m5 12 5 5 9-9"/></svg>';
  const FAI_TONE = { Alerta: "warn", "Escucha ambiente": "task", Llamada: "info", Mensaje: "info", Video: "info", Estado: "ok", IA: "ok" };
  const faiIntervene = id => {
    const c = aiChains.find(x => x.id === id);
    if(!c || c.estado !== "en_curso") return;
    const o = byId(c.opId);
    if(!o) return;
    const label = FIELD_ALERT_KINDS[c.tipo].label.toLowerCase();
    c.intervenida = { t: hmsOf(nowS()), por: FIELD_OPERATOR_USER.name };
    c.estado = "intervenida";
    c.pasos.forEach(s => { if(!s.done) s.skipped = true; });
    bita("IA", o, "Operador", `Cadena de ${label} frenada · pasos pendientes sin ejecutar`, { nota: `Por ${c.intervenida.por}`, incidentId: c.incidentId });
    c.bitIds.push(bitacora[0].id);
    pushOpLog(o, "Cadena de la IA frenada por el operador");
    aiLog("warn", `Cadena de <b>${esc(label)}</b> frenada por el operador · ${esc(o.name)}`);
    if(!(cardOpId === o.id && ofcard && !ofcard.hidden)) openMapCard(o.id);
    cardTab = "op";
    render(true);
  };
  const faiChainHtml = (c, full) => {
    const o = byId(c.opId);
    const label = FIELD_ALERT_KINDS[c.tipo].label;
    const [estadoCls, estadoTxt] = c.estado === "completa" ? ["status--success", "Completa"]
      : c.estado === "intervenida" ? ["status--warning", "Frenada"]
      : ["status--info", "En curso"];
    let liveSet = false;
    const steps = c.pasos.map(s => {
      let cls = "chain__step--wait", icon = "", time = "—";
      if(s.done){ cls = "chain__step--done"; icon = FAI_CHECK; time = s.t; }
      else if(s.skipped){ time = "No ejecutado"; }
      else if(c.estado === "en_curso" && !liveSet){ cls = "chain__step--live"; icon = "<i></i>"; liveSet = true; time = "En curso"; }
      const detail = s.done && s.detalle ? `<span class="fai-step__detail">${esc(s.detalle)}</span>` : "";
      return `<div class="chain__step ${cls}"><div class="chain__dot">${icon}</div>`
        + `<div class="chain__label">${esc(s.text)}<span class="chain__time">${esc(time)}</span>${detail}</div></div>`;
    }).join("");
    const logOpen = faiOpenLog.has(c.id);
    const entries = logOpen
      ? c.bitIds.map(id => bitacora.find(b => b.id === id)).filter(Boolean).map(b =>
          `<div class="log__item"><span class="log__dot log__dot--${FAI_TONE[b.tipo] || "info"}"></span>`
          + `<p class="log__text"><b>${esc(b.oficial)}</b> · ${esc(b.detalle)}</p><span class="log__time">${esc(b.t)}</span></div>`).join("")
      : "";
    const stop = c.intervenida ? ` · frenada ${esc(c.intervenida.t)} por ${esc(c.intervenida.por)}` : "";
    return `<article class="fai-chain">`
      + `<header class="fai-chain__head"><h3 class="fai-chain__title">${esc(label)} · ${esc(o ? o.name : "Oficial")}</h3>`
      + `<span class="status ${estadoCls}">${estadoTxt}</span></header>`
      + `<p class="fai-chain__meta">${esc(o ? locLabel(o) : "")} · inicio ${esc(c.t)}${stop}</p>`
      + (full ? `<div class="chain">${steps}</div>` : "")
      + `<div class="fai-chain__actions">`
      + `<button type="button" class="btn btn--ghost" data-fai-intervene="${esc(c.id)}"${c.estado === "en_curso" ? "" : " disabled"}>Intervenir</button>`
      + `<button type="button" class="btn btn--ghost" data-fai-log="${esc(c.id)}" aria-expanded="${logOpen}">Ver en bitácora</button>`
      + `</div>`
      + (logOpen ? `<div class="log fai-chain__log">${entries || `<p class="fai-empty">Sin entradas en bitácora.</p>`}</div>` : "")
      + `</article>`;
  };
  const renderAiField = () => {
    if(!faiRoot.chains || faiRoot.panel.hidden) return;
    /* La cadena más reciente va completa; la anterior solo muestra resumen, salvo que siga en curso. */
    putHtml(faiRoot.chains, aiChains.slice(0, 2).map((c, i) => faiChainHtml(c, i === 0 || c.estado === "en_curso")).join("")
      || `<p class="fai-empty">Sin cadenas de campo en el turno. Se abren con una alerta de emergencia u hombre caído.</p>`);
    const activas = vigilancia.filter(v => v.activa).length;
    const txt = `${aiChains.length} ${aiChains.length === 1 ? "cadena" : "cadenas"} · ${activas} ${activas === 1 ? "señal activa" : "señales activas"}`;
    if(faiRoot.count.textContent !== txt) faiRoot.count.textContent = txt;
    const sigs = [...vigilancia].sort((a, b) => Number(b.activa) - Number(a.activa)).slice(0, 6);
    putHtml(faiRoot.signals, sigs.map(v => {
      const o = byId(v.opId);
      return `<div class="log__item"><span class="log__dot log__dot--${v.activa ? "warn" : "task"}"></span>`
        + `<p class="log__text"><b>${esc(o ? o.name : "Oficial")}</b> · ${esc(v.texto)}<span class="fai-state">${v.activa ? "Activa" : "Resuelta"}</span></p>`
        + `<span class="log__time">${esc(v.t)}</span></div>`;
    }).join("") || `<p class="fai-empty">Sin señales de vigilancia.</p>`);
    putHtml(faiRoot.activity, bitacora.filter(b => b.origen === "IA").slice(0, 8).map(b =>
      `<div class="log__item"><span class="log__dot log__dot--${FAI_TONE[b.tipo] || "info"}"></span>`
      + `<p class="log__text"><b>${esc(b.oficial)}</b> · ${esc(b.detalle)}</p><span class="log__time">${esc(b.t)}</span></div>`
    ).join("") || `<p class="fai-empty">Sin actividad de la IA.</p>`);
  };
  $("fai-chains")?.addEventListener("click", e => {
    let el;
    if((el = e.target.closest("[data-fai-intervene]"))){ faiIntervene(el.dataset.faiIntervene); return; }
    if((el = e.target.closest("[data-fai-log]"))){
      const id = el.dataset.faiLog;
      if(faiOpenLog.has(id)) faiOpenLog.delete(id); else faiOpenLog.add(id);
      renderAiField();
    }
  });

  /* ---------- alerta de emergencia ---------- */
  const renderAlert = () => {
    const e = alertOf();
    const key = e ? `${e.id}:${e.alerta.id}:${e.alerta.estado}` : "";
    if(key === alertKey) return;
    alertKey = key;
    if(!e){
      alertEl.hidden = true;
      alertEl.innerHTML = "";
      return;
    }
    alertEl.hidden = false;
    alertEl.innerHTML = `<span class="field__alert-pip" aria-hidden="true"></span>`
      + `<p class="field__alert-text"><b>${esc(FIELD_ALERT_KINDS[e.alerta.tipo].label)}</b> · ${esc(e.name)} · ${esc(locLabel(e))}${e.alerta.estado === "atendida" ? " · atendida por " + esc(e.alerta.atendidaPor) : ""}</p>`
      + `<button type="button" class="btn btn--ghost" data-field-see="${e.id}">Ver operador</button>`
      + (e.alerta.estado === "activa" ? `<button type="button" class="btn btn--primary" data-field-ack="${e.id}">Atender</button>` : `<button type="button" class="btn btn--primary" data-field-close="${e.id}">Cerrar</button>`);
  };

  /* ---------- inventario en Dispositivos: un renglón por equipo ---------- */
  const devCode = (o, k) => (k === "bodycam" ? o.bodycam.id : k === "radio" ? o.radio.id : o.patrol.camId);
  const healthChip = online => {
    const meta = (typeof DEVICE_STATUS !== "undefined" && DEVICE_STATUS[online ? "online" : "offline"])
      || { label: online ? "En línea" : "Fuera de línea", tone: online ? "success" : "danger" };
    return `<span class="status status--${meta.tone} device__status">${esc(meta.label)}</span>`;
  };
  const renderInventory = () => {
    const groups = [
      ["bodycam", "Bodycam"],
      ["patrulla", "Cámara de patrulla"],
      ["radio", "Radio"]
    ];
    const key = groups.map(([k]) => ops.map(o => `${k}:${devCode(o, k)}:${devOn(o, k) ? 1 : 0}`).join(",")).join("|");
    if(invEl.dataset.key === key && invEl.childElementCount){
      invEl.hidden = false;
      return;
    }
    invEl.dataset.key = key;
    invEl.hidden = false;
    invEl.setAttribute("aria-label", "Dispositivos de campo");
    const total = ops.length * groups.length;
    const rows = groups.map(([k, label]) => {
      const items = ops.slice().sort((a, b) => devCode(a, k).localeCompare(devCode(b, k)));
      return `<li class="field-inv__kind">${esc(label)}</li>`
        + items.map(o => {
            const code = devCode(o, k);
            const on = devOn(o, k);
            return `<li><button type="button" class="device" data-field-map="${o.id}"`
              + ` aria-label="${esc(label)} ${esc(code)}, asignado a ${esc(o.name)}, ${on ? "en línea" : "fuera de línea"}">`
              + `<span class="device__icon" aria-hidden="true">${svg(k)}</span>`
              + `<span class="device__meta">`
              + `<span class="device__code">${esc(label)} ${esc(code)}</span>`
              + `<span class="device__name">${esc(o.name)}</span>`
              + `</span>${healthChip(on)}</button></li>`;
          }).join("");
    }).join("");
    invEl.innerHTML = `<div class="field-inv__head">`
      + `<h3 class="field-inv__title">Dispositivos de campo</h3>`
      + `<span class="field-inv__count">${total}</span></div>`
      + `<ul class="field-inv__list">${rows}</ul>`;
  };

  const renderLayerCounts = () => {
    ["bodycam", "radio", "patrulla"].forEach(k => {
      const c = document.querySelector(`.layer[data-layer="${k}"] .layer__count`);
      if(c) c.textContent = ops.filter(o => devOn(o, k)).length;
    });
  };

  /* ---------- ficha del operador ---------- */
  const renderFicha = () => {
    const o = byId(focusId);
    if(!o){ fichaEl.innerHTML = ""; return; }
    const inc = o.incidentId ? INCIDENTS.find(i => i.id === o.incidentId) : null;
    const bcAct = !o.bodycam.online ? ""
      : o.bodycam.transmitting ? `<button type="button" class="btn btn--ghost" data-field-stop="${o.id}">Detener transmisión</button>`
      : o.req ? ""
      : `<button type="button" class="btn btn--primary" data-field-req="${o.id}">Pedir video</button>`;
    const logHtml = o.log.slice(-8).reverse()
      .map(l => `<li><span class="field__log-t">${esc(l.t)}</span><span>${esc(l.text)}</span></li>`).join("");
    fichaEl.innerHTML = `<header class="field__ficha-head">`
      + `<span class="field__avatar field__avatar--lg" aria-hidden="true">${esc(o.initials)}</span>`
      + `<div class="field__ficha-id"><p class="field__ficha-name">${esc(o.fullName)}</p>`
      + `<p class="field__ficha-sub">${esc(o.badge)} · ${esc(o.corp)} · ${esc(o.role)}</p></div></header>`
      + `<div class="field__ficha-status">${statusChip(opEstado(o))}`
      + `<span class="field__ficha-meta">En servicio ${serviceMin(o)} min · ${esc(o.sector)}</span></div>`
      + `<section class="field__dev field__dev--bodycam${isLive(o) ? " is-live" : ""}${o.bodycam.online ? "" : " is-off"}">`
      + `<header class="field__dev-head"><span class="field__dev-ico">${svg("bodycam")}</span>`
      + `<div class="field__dev-id"><p class="field__dev-kind">Bodycam</p><p class="field__dev-code">${esc(o.bodycam.id)}</p></div>`
      + `<span class="field__dev-state">${esc(devText(o, "bodycam"))}</span></header>`
      + `<dl class="field__dev-stats">`
      + `<div><dt>Batería</dt><dd class="${battClass(o.bodycam.battery)}">${pct(o.bodycam.battery)}</dd></div>`
      + `<div><dt>Señal</dt><dd>${o.bodycam.online ? pct(o.bodycam.signal) : "—"}</dd></div>`
      + `<div><dt>Grabación</dt><dd>${o.bodycam.online && o.bodycam.recording ? "Activa" : "Inactiva"}</dd></div>`
      + `</dl>${bcAct ? `<div class="field__dev-act">${bcAct}</div>` : ""}</section>`
      + `<section class="field__dev field__dev--patrulla${o.patrol.online ? "" : " is-off"}">`
      + `<header class="field__dev-head"><span class="field__dev-ico">${svg("patrulla")}</span>`
      + `<div class="field__dev-id"><p class="field__dev-kind">Cámara de patrulla</p><p class="field__dev-code">${esc(o.patrol.camId)} · ${esc(o.patrol.label)}</p></div>`
      + `<span class="field__dev-state">${esc(devText(o, "patrulla"))}</span></header>`
      + `</section>`
      + `<section class="field__dev field__dev--radio${o.radio.transmitting ? " is-live" : ""}${o.radio.online ? "" : " is-off"}">`
      + `<header class="field__dev-head"><span class="field__dev-ico">${svg("radio")}</span>`
      + `<div class="field__dev-id"><p class="field__dev-kind">Radio</p><p class="field__dev-code">${esc(o.radio.id)}</p></div>`
      + `<span class="field__dev-state">${esc(devText(o, "radio"))}</span></header>`
      + `<dl class="field__dev-stats">`
      + `<div><dt>Batería</dt><dd class="${battClass(o.radio.battery)}">${pct(o.radio.battery)}</dd></div>`
      + `<div><dt>Señal</dt><dd>${o.radio.online ? pct(o.radio.signal) : "—"}</dd></div>`
      + `<div><dt>Canal</dt><dd>${esc(chName(o.channel))}</dd></div>`
      + `</dl></section>`
      + (inc
        ? `<button type="button" class="field__inc" data-field-incident="${inc.id}"><span class="field__inc-k">Incidente asignado</span>`
          + `<b>${esc(inc.folio)}</b><span>${esc(inc.type)} · ${esc(inc.address)}</span></button>`
        : `<p class="field__inc field__inc--none"><span class="field__inc-k">Incidente asignado</span><span>Sin incidente asignado</span></p>`)
      + `<section class="field__ficha-log"><h3 class="field__ficha-title">Registro</h3><ol>${logHtml}</ol></section>`;
  };

  /* ---------- radio: canales, hablar, llamar, historial ---------- */
  const renderRadio = () => {
    const hist = radioHist.slice(0, 8).map(h =>
      `<li class="field-hist field-hist--${h.kind}"><span class="field-hist__t">${esc(h.t)}</span>`
      + `<span class="field-hist__ch">${esc(chName(h.ch))}</span>`
      + `<span class="field-hist__txt">${esc(h.text)}</span></li>`).join("");
    radioEl.innerHTML = hist || `<li class="field__muted">Sin transmisiones recientes.</li>`;
  };

  /* ---------- escenario: vista de campo ---------- */
  const idleText = (o, src) => src === "bodycam"
    ? (o.bodycam.online ? "Sin transmisión" : "Bodycam fuera de línea")
    : (o.patrol.online ? "Cámara sin señal" : "Cámara de patrulla sin señal");
  const camTile = (o, src) => {
    const live = srcHasVideo(o, src);
    return `<button type="button" class="field__tile${live ? "" : " is-idle"}" data-field-tile="${o.id}" data-field-src="${src}" aria-label="${esc(srcLabel(src))} de ${esc(o.name)}">`
      + (live
        ? `<video class="field__tile-media" data-f-video="${o.id}" data-f-src="${src}" muted loop playsinline></video>`
        : `<div class="field__tile-idle">${svg(src === "bodycam" ? "bodycam" : "patrulla")}<span>${esc(idleText(o, src))}</span></div>`)
      + `<span class="field__tile-bar"><span class="field__tile-name">${esc(srcLabel(src))}</span>`
      + `<span class="field__tile-code">${esc(srcDevice(o, src))}</span></span>`
      + `</button>`;
  };
  const incOptions = sel => INCIDENTS.map(i =>
    `<option value="${i.id}"${i.id === sel ? " selected" : ""}>${esc(i.folio)} · ${esc(i.type)}</option>`).join("");

  const buildStage = () => {
    const o = byId(focusId);
    if(!o){ stageEl.innerHTML = ""; return; }
    if(gridLayout > 1){
      stageEl.innerHTML = `<div class="field__tiles" style="--cols:2" role="list" aria-label="Bodycam y cámara de patrulla">`
        + camTile(o, "bodycam") + camTile(o, "patrulla") + `</div>`;
      return;
    }
    const cam = shownSource(o);
    const live = srcHasVideo(o, cam);
    const idle = idleText(o, cam);
    stageEl.innerHTML = live
      ? `<video class="field__video" data-f-video="${o.id}" data-f-src="${cam}" muted loop playsinline></video>`
      : `<div class="field__idle">${svg(cam === "bodycam" ? "bodycam" : "patrulla")}<p>${esc(idle)}</p></div>`;
  };
  const syncVideos = () => {
    stageEl.querySelectorAll("video[data-f-video]").forEach(v => {
      const o = byId(v.dataset.fVideo);
      if(!o) return;
      const want = srcVideo(o, v.dataset.fSrc || source);
      if(v.dataset.src !== want){
        v.dataset.src = want;
        v.src = want;
      }
      const hold = tlReplay && gridLayout === 1 && (v.dataset.fSrc || source) === shownSource(o);
      if(v.paused && !hold){
        const p = v.play();
        if(p && p.catch) p.catch(() => {});
      }
    });
  };
  const mainVideo = () => stageEl.querySelector("video.field__video");
  const wallClock = offsetSec => {
    const d = new Date(Date.now() - Math.max(0, offsetSec) * 1000);
    const p = n => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const grabFrames = (src, n = 14) => {
    if(tlFrameCache.has(src)) return Promise.resolve(tlFrameCache.get(src));
    return new Promise(resolve => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      let settled = false;
      const done = val => {
        if(settled) return;
        settled = true;
        tlFrameCache.set(src, val);
        resolve(val);
      };
      const timer = setTimeout(() => done({ urls:[], duration:0 }), 8000);
      v.onerror = () => { clearTimeout(timer); done({ urls:[], duration:0 }); };
      v.onloadedmetadata = () => {
        const dur = v.duration;
        if(!dur || !isFinite(dur)){ clearTimeout(timer); done({ urls:[], duration:0 }); return; }
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext("2d");
        const urls = [];
        let i = 0;
        const step = () => {
          if(i >= n){ clearTimeout(timer); done({ urls, duration:dur }); return; }
          const t = Math.max(0, Math.min(dur * ((i + 0.5) / n), Math.max(0, dur - 0.05)));
          const onseek = () => {
            v.removeEventListener("seeked", onseek);
            try{
              ctx.drawImage(v, 0, 0, 160, 90);
              urls.push(canvas.toDataURL("image/jpeg", 0.6));
            }catch(err){
              urls.push("");
            }
            i += 1;
            step();
          };
          v.addEventListener("seeked", onseek);
          try{
            if(Math.abs((v.currentTime || 0) - t) < 0.02) onseek();
            else v.currentTime = t;
          }catch(err){
            v.removeEventListener("seeked", onseek);
            urls.push("");
            i += 1;
            step();
          }
        };
        step();
      };
      v.src = src;
    });
  };
  const stopTlPlay = () => {
    tlPlaying = false;
    if(tlTimer){ clearInterval(tlTimer); tlTimer = null; }
    const playIcon = $("field-tl-play")?.querySelector(".monitor__tl-icon-play");
    const pauseIcon = $("field-tl-play")?.querySelector(".monitor__tl-icon-pause");
    if(playIcon) playIcon.hidden = false;
    if(pauseIcon) pauseIcon.hidden = true;
    $("field-tl-play")?.classList.remove("is-active");
  };
  const paintTlChrome = () => {
    const dur = tlDur || 0;
    const playhead = $("field-tl-playhead");
    const clock = $("field-tl-clock");
    const modeEl = $("field-tl-mode");
    const track = $("field-tl-track");
    const liveBtn = $("field-tl-golive");
    if(playhead) playhead.style.left = `${tlPct}%`;
    if(clock) clock.textContent = dur ? wallClock(dur * (1 - tlPct / 100)) : "—";
    if(modeEl){
      modeEl.textContent = tlReplay ? "REPLAY" : "EN VIVO";
      modeEl.classList.toggle("is-replay", tlReplay);
    }
    if(track){
      track.setAttribute("aria-valuenow", String(Math.round(tlPct)));
      track.setAttribute("aria-valuetext", clock ? clock.textContent : "");
    }
    liveBtn?.classList.toggle("is-active", !tlReplay);
    const frames = $("field-tl-film")?.querySelectorAll(".monitor__tl-frame");
    if(frames && frames.length){
      const idx = Math.min(frames.length - 1, Math.max(0, Math.floor((tlPct / 100) * frames.length)));
      frames.forEach((el, i) => el.classList.toggle("is-active", i === idx));
    }
  };
  const applyTl = (pct, fromUser) => {
    tlPct = Math.max(0, Math.min(100, pct));
    const atLive = tlPct >= 99.2;
    const v = mainVideo();
    const dur = (v && isFinite(v.duration) && v.duration) || tlDur || 0;
    if(dur) tlDur = dur;
    if(atLive){
      tlReplay = false;
      stopTlPlay();
      if(v){
        v.loop = true;
        if(v.paused){ const p = v.play(); if(p && p.catch) p.catch(() => {}); }
      }
    }else{
      tlReplay = true;
      if(fromUser) stopTlPlay();
      if(v && dur){
        v.loop = false;
        const t = Math.min(Math.max(0, dur - 0.05), (tlPct / 100) * dur);
        if(Math.abs(v.currentTime - t) > 0.2) v.currentTime = t;
        if(fromUser) v.pause();
      }
    }
    paintTlChrome();
  };
  const goFieldLive = () => {
    stopTlPlay();
    tlReplay = false;
    tlPct = 100;
    const v = mainVideo();
    if(v){
      v.loop = true;
      if(v.paused){ const p = v.play(); if(p && p.catch) p.catch(() => {}); }
    }
    paintTlChrome();
  };
  const startTlPlay = () => {
    if(!tlReplay) applyTl(Math.min(tlPct, 92), true);
    tlPlaying = true;
    const playIcon = $("field-tl-play")?.querySelector(".monitor__tl-icon-play");
    const pauseIcon = $("field-tl-play")?.querySelector(".monitor__tl-icon-pause");
    if(playIcon) playIcon.hidden = true;
    if(pauseIcon) pauseIcon.hidden = false;
    $("field-tl-play")?.classList.add("is-active");
    const v = mainVideo();
    if(v){
      v.loop = false;
      const p = v.play();
      if(p && p.catch) p.catch(() => {});
    }
    if(tlTimer) clearInterval(tlTimer);
    tlTimer = setInterval(() => {
      if(!tlPlaying) return;
      const vid = mainVideo();
      const dur = vid && isFinite(vid.duration) ? vid.duration : 0;
      if(!vid || !dur) return;
      if(vid.ended || vid.currentTime >= dur - 0.08){ goFieldLive(); return; }
      tlPct = (vid.currentTime / dur) * 100;
      tlReplay = true;
      paintTlChrome();
    }, 200);
  };
  const paintFilm = (src, pack) => {
    const film = $("field-tl-film");
    const hours = $("field-tl-hours");
    const alerts = $("field-tl-alerts");
    if(!film) return;
    const dur = (pack && pack.duration) || tlDur || 0;
    if(dur) tlDur = dur;
    const n = (pack && pack.urls && pack.urls.length) || 14;
    const o = byId(focusId);
    film.innerHTML = Array.from({ length:n }, (_, i) => {
      const thumb = pack && pack.urls && pack.urls[i] ? pack.urls[i] : "";
      const t = dur ? wallClock(dur * (1 - (i + 0.5) / n)) : "";
      const bg = thumb ? ` style="background-image:url('${thumb}')"` : "";
      return `<span class="monitor__tl-frame" data-i="${i}"${bg}><time>${t}</time></span>`;
    }).join("");
    if(hours){
      hours.innerHTML = dur
        ? `<span>${wallClock(dur)}</span><span>${wallClock(dur / 2)}</span><span>${wallClock(0)}</span>`
        : `<span>—</span><span>—</span><span>—</span>`;
    }
    if(alerts){
      alerts.innerHTML = o && alertActive(o)
        ? `<button type="button" class="monitor__tl-mark" data-field-tl-mark="88"
             style="left:88%" title="Emergencia" aria-label="Emergencia">
             <span class="monitor__tl-mark-dot" aria-hidden="true"></span>
             <span class="monitor__tl-mark-flag">Emergencia</span>
           </button>`
        : "";
    }
    paintTlChrome();
  };
  const refreshFilm = () => {
    if(!tlOpen) return;
    const o = byId(focusId);
    const film = $("field-tl-film");
    if(!o || !film) return;
    const cam = shownSource(o);
    const src = srcHasVideo(o, cam) ? srcVideo(o, cam) : "";
    if(src === tlFilmSrc && film.childElementCount) return;
    tlFilmSrc = src;
    tlDur = 0;
    paintFilm("", null);
    if(!src) return;
    grabFrames(src).then(pack => {
      if(tlFilmSrc !== src) return;
      paintFilm(src, pack);
    });
  };
  const setTlOpen = open => {
    tlOpen = !!open;
    const panel = $("field-timeline");
    const btn = $("field-tl-open");
    if(panel) panel.hidden = !tlOpen;
    if(btn){
      btn.hidden = tlOpen;
      btn.setAttribute("aria-expanded", tlOpen ? "true" : "false");
    }
    $("field-tl-close")?.setAttribute("aria-expanded", tlOpen ? "true" : "false");
    $("field-view")?.classList.toggle("is-tl-open", tlOpen);
    if(!tlOpen) goFieldLive();
    else{
      tlFilmSrc = "";
      refreshFilm();
      goFieldLive();
    }
  };
  const paintPip = () => {
    const pip = $("field-pip");
    if(!pip) return;
    const o = byId(focusId);
    const vid = $("field-pip-video");
    const idle = $("field-pip-idle");
    const label = $("field-pip-label");
    if(!o){ pip.hidden = true; return; }
    pip.hidden = false;
    if(gridLayout !== 1){
      vid?.pause();
      return;
    }
    const alt = shownSource(o) === "bodycam" ? "patrulla" : "bodycam";
    const short = alt === "bodycam" ? "Bodycam" : "Patrulla";
    if(label) label.textContent = short;
    pip.setAttribute("aria-label", `Cambiar a ${short}`);
    const has = srcHasVideo(o, alt);
    if(idle) idle.hidden = has;
    if(!vid) return;
    vid.hidden = !has;
    if(!has){
      if(vid.dataset.src){
        vid.removeAttribute("src");
        vid.dataset.src = "";
        vid.load();
      }
      return;
    }
    const want = srcVideo(o, alt);
    if(vid.dataset.src !== want){
      vid.dataset.src = want;
      vid.src = want;
    }
    if(vid.paused){
      const p = vid.play();
      if(p && p.catch) p.catch(() => {});
    }
  };
  const renderStage = () => {
    const formKey = markForm ? `${markForm.opId}:${markForm.src}` : "";
    const key = [mode, gridLayout, shownSource(byId(focusId)), focusId, formKey,
      ops.map(x => [x.id, opEstado(x), alertOpen(x) ? x.alerta.estado : "", x.bodycam.online ? 1 : 0, x.bodycam.transmitting ? 1 : 0,
        x.patrol.online ? 1 : 0, x.patrol.recording ? 1 : 0, x.req ? x.req.stage : "-"].join(".")).join("|")
    ].join("#");
    if(key !== stageKey.v){
      stageKey.v = key;
      buildStage();
    }
    syncVideos();
  };
  const renderUnit = () => {
    const o = byId(focusId);
    if(!unitEl || !o) return;
    const cam = shownSource(o);
    const live = srcHasVideo(o, cam);
    const inc = o.incidentId ? INCIDENTS.find(i => i.id === o.incidentId) : null;
    const batt = o.bodycam.online ? o.bodycam.battery : o.radio.battery;
    const battToneCls = batt <= 20 ? "is-low" : batt <= 40 ? "is-mid" : "";
    const fillW = Math.max(1, Math.round(batt / 100 * 14));
    unitEl.innerHTML = `<div class="monitor__unit-badges">`
      + `<span class="monitor__batt-badge ${battToneCls}" title="Batería de bodycam">`
      + `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">`
      + `<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M20 10v4"/>`
      + `<rect class="monitor__batt-badge-fill" x="4" y="9" width="${fillW}" height="6" rx=".5" fill="currentColor" stroke="none"/>`
      + `</svg><span>${pct(batt)}</span></span>`
      + `<span class="monitor__status">${statusChip(opEstado(o))}</span></div>`
      + `<header class="monitor__unit-head">`
      + `<div class="monitor__live${live ? "" : " is-offline"}"><i aria-hidden="true"></i><span>${live ? "EN VIVO" : "SIN SEÑAL"}</span></div>`
      + `<p class="monitor__id">${esc(o.name)}</p>`
      + `<p class="monitor__name">${esc(o.badge)} · ${esc(o.corp)}</p></header>`
      + `<section class="monitor__unit-mission" aria-label="Incidente asignado">`
      + `<p class="monitor__hud-label">Incidente</p>`
      + `<p class="monitor__mission-text">${inc ? esc(inc.type) : "Sin incidente asignado"}</p>`
      + `<p class="monitor__mission-dist">${esc(srcLabel(cam))} · ${esc(srcDevice(o, cam))} · ${esc(o.sector)}</p>`
      + `</section>`;
  };
  const renderMap = () => {
    const o = byId(focusId);
    if(!mapSvg || !o || !o.route || !o.route.length) return;
    if(mapFrame){
      mapFrame.dataset.fieldMinimap = o.id;
      mapFrame.setAttribute("aria-label", `Ver a ${o.name} en el mapa`);
    }
    const xs = o.route.map(p => p[0]), ys = o.route.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const padX = Math.max(0.0008, (maxX - minX) * 0.2), padY = Math.max(0.0006, (maxY - minY) * 0.2);
    const x0 = minX - padX, x1 = maxX + padX, y0 = minY - padY, y1 = maxY + padY;
    const X = v => ((v - x0) / (x1 - x0)) * 100;
    const Y = v => 100 - ((v - y0) / (y1 - y0)) * 100;
    const path = o.route.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    const dest = o.route[o.route.length - 1];
    const ux = X(o.pos[0]).toFixed(1), uy = Y(o.pos[1]).toFixed(1);
    mapSvg.innerHTML = `<path class="monitor__map-route" d="${path}" fill="none" stroke-linecap="round" stroke-dasharray="2.5 2"/>`
      + `<circle class="monitor__map-dest" cx="${X(dest[0]).toFixed(1)}" cy="${Y(dest[1]).toFixed(1)}" r="2.6"/>`
      + `<circle class="monitor__map-unit" cx="${ux}" cy="${uy}" r="3.4"/>`;
  };

  /* ---------- ficha vertical del oficial ---------- */
  const LOOK_OF = o => {
    if(alertOpen(o)) return "is-emergency";
    const k = opEstado(o);
    if(k === "apagado") return "is-offline";
    if(k === "en_sitio") return "is-incident";
    if(k === "en_camino") return "is-comms";
    return "is-patrol";
  };
  const barCount = sig => Math.max(0, Math.min(4, Math.round(Number(sig) / 25)));
  const battTone = v => (v > 50 ? "is-ok" : v >= 10 ? "is-mid" : "is-low");
  const barsHtml = n => [0, 1, 2, 3].map(i => `<i${i < n ? " class=\"is-on\"" : ""}></i>`).join("");
  const chosenCam = o => {
    if(cardCam === "bodycam" || cardCam === "patrol") return cardCam;
    if(o.bodycam.online) return "bodycam";
    if(o.patrol.online) return "patrol";
    return "bodycam";
  };
  const reqStage = o => {
    if(o.bodycam.transmitting) return 3;
    if(!o.req) return 0;
    if(o.req.stage === "accepted") return 2;
    return 1;
  };
  /* ---------- ficha del oficial: movimiento, radio, alerta, barras, pestañas ---------- */
  const COMPASS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const headingText = d => `${COMPASS[Math.round(d / 45) % 8]} ${Math.round(d)}°`;
  const MODE_TEXT = { a_pie: "A pie", vehiculo: "Vehículo", detenido: "Detenido" };
  const RADIO_TEXT = { encendido: "Radio encendido", llamada: "En llamada", apagado: "Radio apagado" };
  const setTextIn = (id, text) => {
    const el = document.getElementById(id);
    if(el && el.textContent !== text) el.textContent = text;
  };
  const showIn = (id, on) => {
    const el = document.getElementById(id);
    if(el && el.hidden === !!on) el.hidden = !on;
  };
  const setDisabledIn = (id, off, title) => {
    const el = document.getElementById(id);
    if(!el) return;
    if(el.disabled !== !!off) el.disabled = !!off;
    if(title != null && el.title !== title) el.title = title;
  };
  /* Reescribe una lista solo si cambió su contenido: así no se pierde el scroll. */
  const putHtml = (el, html) => {
    if(el && el.dataset.html !== html){
      el.dataset.html = html;
      el.innerHTML = html;
    }
  };
  const callLine = c => {
    const base = `${CALL_LABEL[c.tipo] || c.tipo} · ${callWho(c)}`;
    return c.estado === "llamando" ? `${base} · llamando` : `${base} · en curso`;
  };
  const syncComposer = o => {
    const input = document.getElementById("ofcard-msg-input");
    if(!input) return;
    const on = !!(o && o.radio.online);
    if(input.disabled !== !on) input.disabled = !on;
    setTextIn("ofcard-msg-len", `${input.value.length}/${FIELD_SIM.msgMaxChars}`);
    setDisabledIn("ofcard-msg-send", !on || !input.value.trim());
    setTextIn("ofcard-msg-hint", on ? "" : "Radio apagado: el mensaje no llega");
  };
  const paintCardExtras = o => {
    /* Alerta: título, detalle y acciones según estado */
    const alertOn = alertOpen(o);
    showIn("ofcard-alert", alertOn);
    if(alertOn){
      const a = o.alerta;
      const kind = FIELD_ALERT_KINDS[a.tipo].label;
      setTextIn("ofcard-alert-title", alertActive(o) ? `${kind} · activa` : `${kind} · atendida`);
      const ago = Math.max(0, Math.round(nowS() - a.s));
      const by = a.estado === "atendida" && a.atendidaPor ? ` · atendida por ${a.atendidaPor} a las ${a.atendidaT.slice(0, 5)}` : "";
      setTextIn("ofcard-alert-meta", `Hace ${ago} s · ${locLabel(o)}${by}`);
      showIn("ofcard-alert-att", alertActive(o));
    }

    /* Movimiento y radio */
    const mov = o.mov || {};
    const parado = mov.modo === "detenido";
    setTextIn("ofcard-move-mode", MODE_TEXT[mov.modo] || "—");
    setTextIn("ofcard-move-speed", parado ? "0 km/h" : `${Math.round(mov.kmh || 0)} km/h`);
    setTextIn("ofcard-move-head", parado || mov.rumbo == null ? "Sin rumbo" : `Rumbo ${headingText(mov.rumbo)}`);
    setTextIn("ofcard-move-src", `Ubicación por ${o.radio.online ? "radio" : "bodycam"}`);
    const rs = radioState(o);
    const rEl = document.getElementById("ofcard-radio");
    if(rEl){
      setTextIn("ofcard-radio", RADIO_TEXT[rs] || rs);
      if(rEl.dataset.state !== rs) rEl.dataset.state = rs;
    }

    /* Barras: escucha activa o formulario, y llamada en curso */
    const listen = o.escucha;
    if(listen && cardListenForm) cardListenForm = false;
    showIn("ofcard-listen", !!listen);
    if(listen) setTextIn("ofcard-listen-text", `Escucha ambiente · ${listen.por} · ${listen.motivo} · ${fmtMS(nowS() - listen.s0)}`);
    showIn("ofcard-listen-form", cardListenForm && !listen);
    const call = callInvolves(o) ? llamada : null;
    showIn("ofcard-call", !!call);
    if(call) setTextIn("ofcard-call-text", `${callLine(call)}${call.sCurso ? ` · ${fmtMS(nowS() - call.sCurso)}` : ""}`);

    /* Pie: acciones según radio, llamada activa, enlace y permiso de escucha */
    const busy = !!(llamada && llamada.estado !== "finalizada");
    const on = o.radio.online;
    const grp = FIELD_GROUPS.find(g => g.id === o.group);
    const link = FIELD_PHONE_LINKS.find(l => l.incidentId && l.incidentId === o.incidentId);
    const permiso = !!FIELD_OPERATOR_USER.permisoEscucha;
    const busyMsg = "Ya hay una llamada en curso";
    const offMsg = "Radio apagado: no se puede llamar";
    setDisabledIn("ofcard-call-ind", busy || !on, !on ? offMsg : busy ? busyMsg : "Llamada individual al oficial");
    setDisabledIn("ofcard-call-grp", busy || !on || !grp, !on ? offMsg : !grp ? "Sin grupo de radio" : busy ? busyMsg : `Llamada a ${grp.name}`);
    setDisabledIn("ofcard-call-tel", busy || !on || !link, !on ? offMsg : !link ? "Sin reportante vinculado a su incidente" : busy ? busyMsg : "Enlace telefónico con el reportante");
    const listenTitle = !permiso ? "Sin permiso de escucha"
      : listen ? "Terminar la escucha ambiente"
      : !on ? "Radio apagado: no hay escucha"
      : "Escucha ambiente con motivo";
    setDisabledIn("ofcard-listen-btn", !permiso || (!listen && !on), listenTitle);
    const listenBtn = document.getElementById("ofcard-listen-btn");
    if(listenBtn){
      listenBtn.setAttribute("aria-expanded", String(cardListenForm && !listen));
      listenBtn.setAttribute("aria-pressed", String(!!listen));
    }

    /* Mensajes: contador y lista; al ver la pestaña se marcan como leídos */
    if(cardTab === "msg") markRead(o);
    const unread = unreadOf(o);
    const cnt = document.getElementById("ofcard-msg-count");
    if(cnt){
      cnt.hidden = unread === 0;
      setTextIn("ofcard-msg-count", String(unread));
    }
    setTextIn("ofcard-msg-unread", unread ? `${unread} sin leer` : "Sin mensajes nuevos");
    if(cardTab === "msg"){
      const list = o.mensajes.slice(-30).map(m => {
        const who = m.de === "of" ? o.name : m.de === "op" ? "Operador" : "IA";
        const cls = `ofcard__msg is-${m.de}`;
        return `<li class="${cls}"><span class="ofcard__row-head"><b>${esc(who)}</b><time>${esc(hmsOf(m.s).slice(0, 5))}</time></span><p>${esc(m.texto)}</p></li>`;
      }).join("");
      putHtml(document.getElementById("ofcard-msgs"), list || `<li class="ofcard__row-empty">Sin mensajes en este turno.</li>`);
      syncComposer(o);
    }

    /* Historial del turno */
    if(cardTab === "hist"){
      const states = [...o.estados].reverse().slice(0, 12).map(e => {
        const k = FIELD_RADIO_KEYS.find(x => x.id === e.key);
        return `<li class="ofcard__row"><span class="ofcard__row-head"><b>${esc(stMeta(e.key).label)}</b><time>${esc(hmsOf(e.s).slice(0, 5))}</time></span><p>${k ? `Tecla ${k.n}` : "Sistema"}</p></li>`;
      }).join("");
      putHtml(document.getElementById("ofcard-hist-states"), states || `<li class="ofcard__row-empty">Sin teclas reportadas.</li>`);
      const alerts = bitacora.filter(b => b.opId === o.id && b.tipo === "Alerta").slice(-8).reverse().map(b =>
        `<li class="ofcard__row"><span class="ofcard__row-head"><b>${esc(b.detalle)}</b><time>${esc(String(b.t).slice(0, 5))}</time></span><p>${esc(b.nota || b.origen || "")}</p></li>`
      ).join("");
      putHtml(document.getElementById("ofcard-hist-alerts"), alerts || `<li class="ofcard__row-empty">Sin alertas en este turno.</li>`);
      const calls = o.llamadas.slice(0, 10).map(c =>
        `<li class="ofcard__row"><span class="ofcard__row-head"><b>${esc(CALL_LABEL[c.tipo] || c.tipo)}</b><time>${esc(hmsOf(c.s).slice(0, 5))}</time></span><p>${esc(c.por)} · ${esc(fmtMS(c.dur))}</p></li>`
      ).join("");
      putHtml(document.getElementById("ofcard-hist-calls"), calls || `<li class="ofcard__row-empty">Sin llamadas en este turno.</li>`);
    }

    /* Evidencia marcada desde la operación */
    const evs = evidence.filter(e => e.opId === o.id);
    setTextIn("ofcard-ev-sum", evs.length ? `${evs.length} marcada${evs.length === 1 ? "" : "s"}` : "Sin marcas");
    putHtml(document.getElementById("ofcard-evidence"), evs.length
      ? evs.slice(-5).reverse().map(e =>
          `<li class="ofcard__row"><span class="ofcard__row-head"><b>${esc(e.deviceId)}</b><time>${esc(String(e.t).slice(0, 5))}</time></span><p>${esc(e.note || "Sin nota")}</p></li>`
        ).join("")
      : `<li class="ofcard__row-empty">Sin evidencia marcada.</li>`);
  };

  const paintOfficerCard = () => {
    if(!ofcard || ofcard.hidden || !cardOpId) return;
    const o = byId(cardOpId);
    if(!o){ closeOfficerCard(); return; }
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if(el && el.textContent !== text) el.textContent = text;
    };
    ofcard.classList.remove("is-patrol", "is-incident", "is-video", "is-comms", "is-emergency", "is-offline");
    ofcard.classList.add(LOOK_OF(o));
    setText("ofcard-initials", o.initials);
    setText("ofcard-name", o.name);
    setText("ofcard-role", `${o.corp} · ${o.role}`);
    setText("ofcard-patrol", o.patrol.label || o.patrol.id);
    const meta = stMeta(opEstado(o));
    setText("ofcard-status", meta.label);
    paintCardExtras(o);
    const cam = chosenCam(o);
    const devEl = document.getElementById("ofcard-devs");
    if(devEl){
      const metaBits = opts => (opts.batt ? `<span class="ofcard__batt ${battTone(opts.batt.v)}" style="--p:${Math.round(opts.batt.v)}"><i></i><b>${esc(pct(opts.batt.v))}</b></span>` : "")
        + (opts.bars != null ? `<span class="ofcard__bars" role="img" aria-label="Señal ${opts.bars} de 4">${barsHtml(opts.bars)}</span>` : "")
        + (opts.dot ? `<span class="ofcard__dot" data-on="${opts.dot.on ? "1" : "0"}"></span><span>${esc(opts.dot.text)}</span>` : "");
      const askLabel = req => !req ? "Pedir video" : (req.stage === "accepted" ? "Aceptada" : "Enviada");
      const camTile = (key, camId, name, line2, online, req, opts) => {
        const selected = cam === camId;
        return `<li class="ofcard__dev${online ? "" : " is-off"}${selected ? " is-selected" : ""}">`
          + `<button type="button" class="ofcard__dev-pick" data-ofcam="${camId}" aria-pressed="${selected}"`
          + ` aria-label="Ver streaming de ${esc(name)}">`
          + `<span class="ofcard__dev-top">${svg(key, "ofcard__dev-icon")}<span>${esc(name)}</span></span>`
          + `<span class="ofcard__dev-id">${esc(line2)}</span>`
          + `<span class="ofcard__dev-meta">${metaBits(opts)}</span></button>`
          + (online ? "" : `<button type="button" class="ofcard__dev-ask" data-ofreq="${camId}"${req ? " disabled" : ""}>`
            + `${esc(askLabel(req))}</button>`)
          + `</li>`;
      };
      const html = camTile("bodycam", "bodycam", "Bodycam", o.bodycam.online ? o.bodycam.id : `${o.bodycam.id} · sin video`, o.bodycam.online, o.req, {
        batt:{ v:o.bodycam.battery },
        bars:o.bodycam.online ? barCount(o.bodycam.signal) : 0
      }) + camTile("patrulla", "patrol", "Patrulla", o.patrol.online ? o.patrol.camId : `${o.patrol.camId} · sin video`, o.patrol.online, o.patrolReq, {
        dot:{ on:o.patrol.online, text:o.patrol.online ? "En línea" : "Fuera de línea" }
      }) + `<li class="ofcard__dev${!o.radio.online ? " is-off" : ""}">`
        + `<span class="ofcard__dev-top">${svg("radio", "ofcard__dev-icon")}<span>Radio ${esc(o.radio.id)}</span></span>`
        + `<span class="ofcard__dev-id">${esc(chName(o.channel))}</span>`
        + `<span class="ofcard__dev-meta">${metaBits({ batt:{ v:o.radio.battery } })}</span></li>`;
      if(devEl.innerHTML !== html) devEl.innerHTML = html;
    }
    const sum = document.getElementById("ofcard-stream-sum");
    const camOnline = cam === "bodycam" ? o.bodycam.online : o.patrol.online;
    if(sum){
      sum.textContent = camOnline
        ? (cam === "bodycam" ? "Bodycam" : "Patrulla")
        : "Fuera de línea";
    }
    const switchEl = document.getElementById("ofcard-switch");
    if(switchEl){
      switchEl.hidden = true;
      switchEl.innerHTML = "";
    }
    const mediaEl = document.getElementById("ofcard-media");
    const emptyEl = document.getElementById("ofcard-empty");
    const stage = cam === "patrol"
      ? (!o.patrolReq ? 0 : o.patrolReq.stage === "accepted" ? 2 : 1)
      : reqStage(o);
    if(camOnline && mediaEl){
      if(emptyEl) emptyEl.hidden = true;
      mediaEl.hidden = false;
      const src = cam === "bodycam" ? o.bodycam.src : o.patrol.src;
      const live = cam === "bodycam" && o.bodycam.transmitting;
      const rec = cam === "bodycam" ? o.bodycam.recording : o.patrol.recording;
      const devId = cam === "bodycam" ? o.bodycam.id : o.patrol.camId;
      const label = cam === "bodycam" ? "Bodycam" : "Patrulla";
      const key = `${cam}:${src}:${live ? 1 : 0}:${rec ? 1 : 0}`;
      if(mediaEl.dataset.key !== key){
        mediaEl.dataset.key = key;
        const tag = typeof nexusLiveMediaTag === "function" ? nexusLiveMediaTag(src, "ofcard__video", "") : "";
        mediaEl.innerHTML = tag;
      }
      const chip = document.getElementById("ofcard-chips");
      if(chip){
        chip.hidden = false;
        const sig = cam === "bodycam" ? barCount(o.bodycam.signal) : 4;
        chip.innerHTML = `<span class="ofcard__chipbar">`
          + `<span class="ofcard__chip">${esc(label)} · ${esc(devId)}</span>`
          + `<span class="ofcard__chip-row">`
          + (live ? `<span class="ofcard__chip"><i class="is-live"></i>EN VIVO</span>` : `<span class="ofcard__chip">EN LÍNEA</span>`)
          + (rec ? `<span class="ofcard__chip"><i class="is-rec"></i>REC</span>` : "")
          + `</span></span>`
          + `<span class="ofcard__chipbar">`
          + `<span class="ofcard__chip ofcard__chip--time"><span class="ofcard__bars" aria-hidden="true">${barsHtml(sig)}</span>${esc(now())}</span>`
          + `</span>`;
      }
    }else{
      if(mediaEl){ mediaEl.hidden = true; mediaEl.dataset.key = ""; mediaEl.innerHTML = ""; }
      const chip = document.getElementById("ofcard-chips");
      if(chip) chip.hidden = true;
      if(emptyEl){
        emptyEl.hidden = false;
        const devName = cam === "bodycam" ? "Bodycam" : "Patrulla";
        const devId = cam === "bodycam" ? o.bodycam.id : o.patrol.camId;
        const titles = ["Fuera de línea", "Solicitud enviada", "Aceptada"];
        const subs = [
          `${devName} ${devId} sin señal. Pide el video en el recuadro.`,
          "Esperando a que el oficial acepte.",
          `Conectando con ${devName} ${devId}…`
        ];
        const step = Math.max(0, Math.min(stage, 2));
        const steps = ["Enviada", "Aceptada", "En línea"].map((label, i) => {
          const done = stage >= i + 1;
          return `<li class="${done ? "is-done" : ""}"><i></i>${label}</li>`;
        }).join("");
        emptyEl.innerHTML = `<span class="ofcard__empty-icon" aria-hidden="true">${step >= 2 ? "✓" : step === 1 ? "…" : "–"}</span>`
          + `<p class="ofcard__empty-title">${esc(titles[step])}</p>`
          + `<p class="ofcard__empty-sub">${esc(subs[step])}</p>`
          + (stage > 0 ? `<ol class="ofcard__steps" aria-label="Progreso de la solicitud">${steps}</ol>` : "");
      }
    }
    ["op", "msg", "hist", "act"].forEach(k => {
      const panel = document.getElementById(`ofcard-panel-${k}`);
      if(panel) panel.hidden = cardTab !== k;
    });
    ofcard.querySelectorAll("[data-oftab]").forEach(b => {
      const on = b.dataset.oftab === cardTab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    const listElInc = document.getElementById("ofcard-incs");
    if(listElInc){
      const assigned = o.incidentId && typeof INCIDENTS !== "undefined"
        ? INCIDENTS.find(i => i.id === o.incidentId) : null;
      listElInc.innerHTML = assigned
        ? `<li><button type="button" data-ofinc="${esc(assigned.id)}" title="Abrir incidente en el mapa">`
          + `<span class="ofcard__inc-title">${esc(assigned.type)}</span>`
          + `<span class="ofcard__inc-folio">Folio ${esc(assigned.folio)}</span>`
          + `<span class="ofcard__tag">Asignado</span></button></li>`
        : `<li><span class="ofcard__inc-static"><span class="ofcard__inc-title">Sin incidente asignado</span></span></li>`;
    }
  };

  /* ---------- métricas de Seguridad: oficiales por estado, radios y alertas ----------
     Mismas definiciones que el panel de radios: encendido incluye los que
     están en llamada; apagado es radio fuera de servicio. */
  const renderFieldMetrics = () => {
    if(!document.getElementById("sec-field")) return;
    let on = 0, off = 0, call = 0, alertas = 0;
    const porEstado = {};
    ops.forEach(o => {
      const rs = radioState(o);
      if(rs === "apagado") off += 1; else on += 1;
      if(rs === "llamada") call += 1;
      if(alertActive(o)) alertas += 1;
      const k = opEstado(o);
      porEstado[k] = (porEstado[k] || 0) + 1;
    });
    setTextIn("fsec-on", String(on));
    setTextIn("fsec-off", String(off));
    setTextIn("fsec-alert", String(alertas));
    setTextIn("fsec-total", `${ops.length} oficiales · ${call} en llamada`);
    document.querySelector(".fsec__tile--alert")?.classList.toggle("is-on", alertas > 0);
    putHtml(document.getElementById("fsec-states"), Object.keys(FIELD_STATUS).map(k => {
      const m = FIELD_STATUS[k];
      return `<li class="fsec__state fsec__state--${esc(m.tone)}"><b>${porEstado[k] || 0}</b>${esc(m.label)}</li>`;
    }).join(""));
  };

  /* ---------- render general ---------- */
  const render = (force = false) => {
    const live = force || !busy;
    renderSourceUi();
    renderSummary();
    renderMarkers();
    renderLayerCounts();
    renderAlert();
    if(live){
      renderList();
      renderFicha();
      renderRadio();
      renderInventory();
      renderRadios();
      renderAiField();
      renderFieldMetrics();
    }
    if(mode === "field"){
      renderStage();
      renderUnit();
      renderMap();
      paintVoice();
      paintPip();
      refreshFilm();
    }
    paintOfficerCard();
  };

  /* ---------- simulación ---------- */
  const pauseRobotMedia = () => {
    if(monitorVideo && !monitorVideo.paused) monitorVideo.pause();
    document.querySelectorAll("#monitor-camgrid-tiles video").forEach(x => { if(!x.paused) x.pause(); });
  };
  const tick = () => {
    simSec += FIELD_SIM.tickMs / 1000;
    stepSim();
    simRadios();
    simKeys();
    advanceRequests();
    closeTransmissions();
    runChain();
    tickCall();
    simCalls();
    simMessages();
    maybeAlert();
    chatter();
    watch();
    if(mode === "field") pauseRobotMedia();
    render(false);
  };

  /* ---------- eventos ---------- */
  // Interacción activa: no reconstruir listas bajo el cursor.
  document.addEventListener("pointerdown", () => { busy = true; }, true);
  const endBusy = () => { busy = false; };
  document.addEventListener("pointerup", endBusy, true);
  document.addEventListener("pointercancel", endBusy, true);
  document.addEventListener("pointerup", () => pttUp());
  document.addEventListener("pointercancel", () => pttUp());

  if(sourceToggle){
    sourceToggle.addEventListener("click", e => {
      const b = e.target.closest("[data-monitor-source]");
      if(b) setMode(b.dataset.monitorSource);
    });
  }

  listEl.addEventListener("click", e => {
    const el = e.target.closest("[data-field-op]");
    if(!el || el.dataset.fieldOp === focusId) return;
    focusId = el.dataset.fieldOp;
    sourceLock = false;
    markForm = null;
    tlFilmSrc = "";
    goFieldLive();
    render(true);
  });
  filterBtn?.addEventListener("click", e => {
    e.stopPropagation();
    setFilterOpen(!filterOpen);
  });
  filterMenu?.addEventListener("click", e => {
    const el = e.target.closest("[data-f-status]");
    if(!el) return;
    fStatus = el.dataset.fStatus || "";
    setFilterOpen(false);
    syncFilter();
    renderList();
  });
  document.addEventListener("click", e => {
    if(!filterOpen) return;
    if(filterBtn?.contains(e.target) || filterMenu?.contains(e.target)) return;
    setFilterOpen(false);
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && filterOpen) setFilterOpen(false);
  });
  fleetEl?.addEventListener("click", e => {
    const el = e.target.closest("[data-field-grid]");
    if(!el) return;
    const next = Number(el.dataset.fieldGrid);
    if(next !== 1 && next !== 2) return;
    gridLayout = next;
    render(true);
  });
  searchEl?.addEventListener("input", () => {
    search = searchEl.value;
    renderList();
  });

  invEl.addEventListener("click", e => {
    const el = e.target.closest("[data-field-map]");
    if(!el) return;
    const o = byId(el.dataset.fieldMap);
    if(!o) return;
    if(cardOpId === o.id && ofcard && !ofcard.hidden) return;
    openMapCard(o.id);
  });

  alertEl.addEventListener("click", e => {
    let el;
    if((el = e.target.closest("[data-field-see]"))){
      focusId = el.dataset.fieldSee;
      gridLayout = 1;
      openOperator(focusId);
      return;
    }
    if((el = e.target.closest("[data-field-ack]"))){
      markAttended(byId(el.dataset.fieldAck), FIELD_OPERATOR_USER.name);
      render(true);
    }
    if((el = e.target.closest("[data-field-close]"))){
      closeAlert(byId(el.dataset.fieldClose), FIELD_OPERATOR_USER.name);
      render(true);
    }
  });

  viewEl.addEventListener("click", e => {
    const t = e.target;
    let el;
    if(t.closest("#field-log-open")){ setDrawer(true); return; }
    if(t.closest("#field-log-close")){ setDrawer(false); return; }
    if((el = t.closest("[data-field-req]"))){
      requestVideo(byId(el.dataset.fieldReq));
      render(true);
      return;
    }
    if((el = t.closest("[data-field-stop]"))){
      stopTransmit(byId(el.dataset.fieldStop));
      render(true);
      return;
    }
    if((el = t.closest("[data-field-mark]"))){
      const o = byId(el.dataset.fieldMark);
      if(o && srcLive(o, source)) markForm = { opId: o.id, src: source };
      render(true);
      return;
    }
    if(t.closest("[data-field-mark-cancel]")){
      markForm = null;
      render(true);
      return;
    }
    if(t.closest("[data-field-call-go]")){
      callOp(byId(callTarget));
      render(true);
      return;
    }
    if((el = t.closest("[data-field-call]"))){
      callOp(byId(el.dataset.fieldCall));
      render(true);
      return;
    }
    if((el = t.closest("[data-field-ch]"))){
      listenCh = el.dataset.fieldCh;
      renderRadio();
      return;
    }
    if((el = t.closest("[data-field-minimap]"))){
      const o = byId(el.dataset.fieldMinimap);
      goMap(o && o.pos);
      return;
    }
    if((el = t.closest("[data-field-incident]"))){
      openIncident(el.dataset.fieldIncident);
      return;
    }
    if(t.closest("#field-pip")){
      const o = byId(focusId);
      if(!o) return;
      source = shownSource(o) === "bodycam" ? "patrulla" : "bodycam";
      sourceLock = true;
      gridLayout = 1;
      tlFilmSrc = "";
      goFieldLive();
      render(true);
      return;
    }
    if(t.closest("#field-tl-open")){ setTlOpen(true); return; }
    if(t.closest("#field-tl-close")){ setTlOpen(false); return; }
    if(t.closest("#field-tl-golive")){ goFieldLive(); return; }
    if(t.closest("#field-tl-play")){
      if(tlPlaying) stopTlPlay();
      else startTlPlay();
      return;
    }
    if((el = t.closest("[data-field-tl-mark]"))){
      applyTl(Number(el.dataset.fieldTlMark) || 0, true);
      return;
    }
    if((el = t.closest("[data-field-tile]"))){
      if(el.dataset.fieldSrc){ source = el.dataset.fieldSrc; sourceLock = true; }
      focusId = el.dataset.fieldTile;
      gridLayout = 1;
      markForm = null;
      tlFilmSrc = "";
      goFieldLive();
      render(true);
    }
  });
  viewEl.addEventListener("change", e => {
    if(e.target.matches("[data-field-call-select]")) callTarget = e.target.value;
  });
  viewEl.addEventListener("keydown", e => {
    if(e.key === "Enter" && e.target.matches && e.target.matches("[data-field-tile]")) e.target.click();
  });
  const tlTrack = $("field-tl-track");
  const pctFromPointer = e => {
    if(!tlTrack) return tlPct;
    const rect = tlTrack.getBoundingClientRect();
    if(!rect.width) return tlPct;
    return ((e.clientX - rect.left) / rect.width) * 100;
  };
  tlTrack?.addEventListener("pointerdown", e => {
    if(e.target.closest("[data-field-tl-mark]")) return;
    tlTrack.setPointerCapture?.(e.pointerId);
    applyTl(pctFromPointer(e), true);
  });
  tlTrack?.addEventListener("pointermove", e => {
    if(!tlTrack.hasPointerCapture?.(e.pointerId)) return;
    applyTl(pctFromPointer(e), true);
  });
  tlTrack?.addEventListener("keydown", e => {
    if(e.key === "ArrowLeft"){ e.preventDefault(); applyTl(tlPct - 2, true); }
    if(e.key === "ArrowRight"){ e.preventDefault(); applyTl(tlPct + 2, true); }
    if(e.key === "Home"){ e.preventDefault(); applyTl(0, true); }
    if(e.key === "End"){ e.preventDefault(); goFieldLive(); }
  });
  stageEl.addEventListener("submit", e => {
    const form = e.target.closest("[data-field-mark-form]");
    if(!form) return;
    e.preventDefault();
    if(!markForm) return;
    const o = byId(markForm.opId);
    if(!o) return;
    const fd = new FormData(form);
    addEvidence(o, markForm.src, fd.get("note"), fd.get("incident"));
    markForm = null;
    render(true);
  });

  if(ofcard){
    document.getElementById("ofcard-close")?.addEventListener("click", closeOfficerCard);
    document.getElementById("ofcard-monitor")?.addEventListener("click", () => {
      if(cardOpId) openOperator(cardOpId);
    });
    ofcard.addEventListener("click", e => {
      const tab = e.target.closest("[data-oftab]");
      if(tab){
        const tabKey = tab.dataset.oftab;
        cardTab = ["msg", "hist", "act"].includes(tabKey) ? tabKey : "op";
        paintOfficerCard();
        return;
      }
      const camBtn = e.target.closest("[data-ofcam]");
      if(camBtn){
        cardCam = camBtn.dataset.ofcam;
        paintOfficerCard();
        return;
      }
      const incBtn = e.target.closest("[data-ofinc]");
      if(incBtn){
        openIncident(incBtn.dataset.ofinc);
        return;
      }
      const evBtn = e.target.closest("[data-ofev]");
      if(evBtn && cardOpId){
        const o = byId(cardOpId);
        if(!o) return;
        if(!evidence.some(ev => ev.opId === o.id && ev.source === evBtn.dataset.ofev)){
          addEvidence(o, evBtn.dataset.ofev, "Marcada desde la ficha del mapa", o.incidentId);
        }
        paintOfficerCard();
        return;
      }
      const reqBtn = e.target.closest("[data-ofreq]");
      if(reqBtn){
        const which = reqBtn.dataset.ofreq === "patrol" ? "patrol" : "bodycam";
        cardCam = which;
        const o = byId(cardOpId);
        if(o){
          if(which === "patrol") requestPatrolVideo(o);
          else requestVideo(o);
        }
        paintOfficerCard();
      }
    });
    /* Acciones de la ficha: alerta, llamadas, escucha y mensajes */
    const cardOfficer = () => byId(cardOpId);
    const cardAct = fn => () => { fn(); render(true); };
    document.getElementById("ofcard-alert-att")?.addEventListener("click", cardAct(() => markAttended(cardOfficer(), FIELD_OPERATOR_USER.name)));
    document.getElementById("ofcard-alert-close")?.addEventListener("click", cardAct(() => closeAlert(cardOfficer(), FIELD_OPERATOR_USER.name)));
    document.getElementById("ofcard-call-ind")?.addEventListener("click", cardAct(() => {
      const o = cardOfficer();
      if(o) startCall("individual", { opId: o.id }, "Operador", FIELD_OPERATOR_USER.name);
    }));
    document.getElementById("ofcard-call-grp")?.addEventListener("click", cardAct(() => {
      const o = cardOfficer();
      if(o && o.group) startCall("grupo", { grupo: o.group }, "Operador", FIELD_OPERATOR_USER.name);
    }));
    document.getElementById("ofcard-call-tel")?.addEventListener("click", cardAct(() => {
      const o = cardOfficer();
      const link = o && FIELD_PHONE_LINKS.find(l => l.incidentId && l.incidentId === o.incidentId);
      if(link) startPhoneLink(o.id, link.id);
    }));
    document.getElementById("ofcard-call-end")?.addEventListener("click", cardAct(() => endCall("Operador")));
    document.getElementById("ofcard-listen-btn")?.addEventListener("click", cardAct(() => {
      const o = cardOfficer();
      if(!o) return;
      if(o.escucha) endEscucha(o, "Operador");
      else cardListenForm = !cardListenForm;
    }));
    document.getElementById("ofcard-listen-end")?.addEventListener("click", cardAct(() => endEscucha(cardOfficer(), "Operador")));
    document.getElementById("ofcard-listen-cancel")?.addEventListener("click", cardAct(() => { cardListenForm = false; }));
    document.getElementById("ofcard-listen-form")?.addEventListener("submit", e => {
      e.preventDefault();
      const o = cardOfficer();
      const input = document.getElementById("ofcard-listen-motive");
      const hint = document.getElementById("ofcard-listen-hint");
      const r = o ? requestEscucha(o, input ? input.value : "") : { ok: false, reason: "sin oficial" };
      if(r.ok){
        cardListenForm = false;
        if(input) input.value = "";
        if(hint) hint.textContent = "";
      }else if(hint){
        hint.textContent = `No inicia: ${r.reason}`;
      }
      render(true);
    });
    const msgInput = document.getElementById("ofcard-msg-input");
    msgInput?.addEventListener("input", () => syncComposer(cardOfficer()));
    document.getElementById("ofcard-msg-form")?.addEventListener("submit", e => {
      e.preventDefault();
      const o = cardOfficer();
      if(o && msgInput && sendMessage(o, msgInput.value, "op")) msgInput.value = "";
      render(true);
    });
  }

  /* Panel de radios: vistas, selección, llamadas, mensajes y filtros */
  const radiosRoot = $("radios-panel");
  radiosRoot?.addEventListener("click", e => {
    let el;
    if((el = e.target.closest("[data-rd-view]"))){ rd.view = el.dataset.rdView; renderRadios(); return; }
    if((el = e.target.closest("[data-rd-sel]"))){ rdSelect(el.dataset.rdSel); return; }
    if((el = e.target.closest("[data-rd-call]"))){ rdCall(el.dataset.rdCall); return; }
    if((el = e.target.closest("[data-rd-msg]"))){ rdMsg(el.dataset.rdMsg); return; }
    if((el = e.target.closest("[data-rd-grp]"))){ rdGroup(el.dataset.rdGrp); }
  });
  $("radios-search")?.addEventListener("input", e => { rd.q = e.target.value; renderRadios(); });
  $("radios-filter-status")?.addEventListener("change", e => { rd.est = e.target.value; renderRadios(); });
  $("radios-filter-group")?.addEventListener("change", e => { rd.grp = e.target.value; renderRadios(); });
  const rdGroupSel = $("radios-filter-group");
  if(rdGroupSel) rdGroupSel.innerHTML = `<option value="">Todos</option>`
    + FIELD_GROUPS.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("");
  $("radios-act-ind")?.addEventListener("click", () => { const o = byId(rd.sel || focusId); if(o) rdCall(o.id); });
  $("radios-act-grp")?.addEventListener("click", () => { const o = byId(rd.sel || focusId); if(o && o.group) rdGroup(o.group); });
  $("radios-act-msg")?.addEventListener("click", () => { const o = byId(rd.sel || focusId); if(o) rdMsg(o.id); });

  /* HUD de voz: llamar, grupo y escucha del oficial en foco */
  $("field-voice-call")?.addEventListener("click", voiceAct(() => {
    const o = byId(focusId);
    if(!o) return;
    if(callInvolves(o)) endCall("Operador");
    else startCall("individual", { opId: o.id }, "Operador", FIELD_OPERATOR_USER.name);
  }));
  $("field-voice-group")?.addEventListener("click", voiceAct(() => {
    const o = byId(focusId);
    if(o && o.group) startCall("grupo", { grupo: o.group }, "Operador", FIELD_OPERATOR_USER.name);
  }));
  $("field-voice-listen")?.addEventListener("click", voiceAct(() => {
    const o = byId(focusId);
    if(!o) return;
    voiceErr = "";
    if(o.escucha){
      endEscucha(o, "Operador");
      voiceListenOpen = false;
    }else{
      voiceListenOpen = !voiceListenOpen;
    }
  }));
  $("field-voice-cancel")?.addEventListener("click", voiceAct(() => {
    voiceListenOpen = false;
    voiceErr = "";
  }));
  $("field-voice-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const o = byId(focusId);
    const input = $("field-voice-motive");
    const r = o ? requestEscucha(o, input ? input.value : "") : { ok: false, reason: "sin oficial" };
    if(r.ok){
      voiceListenOpen = false;
      voiceErr = "";
      if(input) input.value = "";
    }else{
      voiceErr = r.reason;
    }
    render(true);
  });

  /* ---------- arranque ---------- */
  ops.forEach(place);
  if(robotsCountEl && typeof MONITOR_FLEET !== "undefined") robotsCountEl.textContent = MONITOR_FLEET.length;
  fillFilter();
  renderMarkers();
  aiLog("info", `Operadores de campo en línea · ${ops.filter(o => o.radio.online).length} de ${ops.length} (simulado)`);
  render(true);
  window.nexusFieldEvidenceFor = evidenceFor;
  window.nexusRadiosRefresh = renderRadios;
  window.nexusFieldAiRefresh = renderAiField;
  /* API de estado para el resto de la maqueta y pruebas: lectura del estado
     simulado y acciones del operador (sin lógica de interfaz). */
  window.nexusFieldSim = {
    ops: () => ops,
    bitacora: () => bitacora,
    chains: () => aiChains,
    vigilancia: () => vigilancia,
    llamada: () => llamada,
    estadoDe: o => opEstado(o),
    radioDe: o => radioState(o),
    trigger: (tipo, opId) => { const id = triggerAlert(byId(opId || focusId), tipo, "Operador"); render(true); return id; },
    atender: (opId) => { const r = markAttended(byId(opId), FIELD_OPERATOR_USER.name); render(true); return r; },
    cerrar: (opId) => { const r = closeAlert(byId(opId), FIELD_OPERATOR_USER.name); render(true); return r; },
    escuchar: (opId, motivo) => { const r = requestEscucha(byId(opId), motivo); render(true); return r; },
    terminarEscucha: opId => { const r = endEscucha(byId(opId), "Operador"); render(true); return r; },
    llamar: (tipo, target) => startCall(tipo, target, "Operador", FIELD_OPERATOR_USER.name),
    colgar: () => endCall("Operador"),
    enlaceTel: (opId, linkId) => startPhoneLink(opId, linkId),
    mensaje: (opId, texto) => sendMessage(byId(opId), texto, "op"),
    noLeidos: opId => unreadOf(byId(opId)),
    marcarLeidos: opId => { markRead(byId(opId)); render(true); }
  };
  watch();
  window.nexusFieldOfficersForIncident = incidentId => ops
    .filter(o => o.incidentId === incidentId && o.pos)
    .map(o => ({
      id: o.id,
      name: o.name,
      lng: o.pos[0],
      lat: o.pos[1],
      route: o.route
    }));
  setInterval(tick, FIELD_SIM.tickMs);
})();
