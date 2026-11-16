# Saimon Nexus — Descriptivo de funcionalidades

**Producto:** tablero de comando operativo (smart city / C5) con módulos de mapa y monitoreo de flota  
**Versión documentada:** maqueta actual en `main` (octubre 2026), incluido el módulo de Monitoreo de robots  
**Naturaleza:** maqueta conceptual de alta fidelidad. Los datos, rutas, streams, telemetría y decisiones de IA son ilustrativos; no hay backend ni integraciones en vivo.

---

## 1. Propósito

Saimon Nexus concentra la lectura operativa de la ciudad. El módulo **Mapa** responde en una sola pantalla:

| Zona | Pregunta que responde |
|---|---|
| Columna izquierda | **Cuánto** — volumen, tendencias e indicadores |
| Mapa central | **Dónde** — incidentes, recursos y cobertura espacial |
| Columna derecha | **Qué se está haciendo** — IA autónoma, inventario, rutas o cola de incidentes |

El módulo **Monitoreo** es el teatro de control de la flota móvil (perros robot, humanoides y drones): stream, telemetría y toma de control ilustrativa.

Está pensado para operadores de centro de mando (sala C5), calibrado a monitor **1920×1080**. El tema por defecto es oscuro; se puede pasar a claro desde la barra superior.

---

## 2. Arquitectura de pantalla

### 2.1 Barra superior

- Logo **Saimon Nexus** (versión clara u oscura según el tema).
- Módulos: **Mapa** (tablero operativo), **Monitoreo**, **Administración**, **Tableros**.
- Contexto de sala: Guadalajara, Jal., reloj y clima ilustrativo.
- Interruptor de tema claro / oscuro: cambia el chrome de la interfaz, el logo y el estilo del mapa (día / noche).
- Operador ilustrativo: Valeria Cruz, Operador C5.
- Nota permanente de maqueta conceptual al pie.

### 2.2 Avatar Saimon (esquina superior derecha)

- Figura del agente con resalte visual (disco + glow) para no perderse sobre el mapa.
- Menú de modos al pasar el cursor / enfocar:
  - **Vigía**
  - **Rutas**
  - **Dispositivos**
  - **Incidentes**
- Campana sutil para disparar el **guion demo de alerta entrante**.

### 2.3 Dominios de la columna izquierda

Selector: **Seguridad · Movilidad · Agua · Residuos**.

**Comportamiento (Modelo B):** el dominio solo cambia las métricas de la izquierda. El mapa y los paneles derechos permanecen en contexto de seguridad operativa.

Contenido por dominio:

- Total de incidentes / headline con sparkline
- Incidentes por categoría
- Sectores con mayor incidencia
- Indicadores clave (KPIs)

---

## 3. Mapa táctico

Cartografía vectorial **MapLibre** + OpenFreeMap (estilo oscuro / día). Vista 3D con extrusión de edificios.

### 3.1 Capas de recursos

Encendido/apagado de marcadores:

- Incidentes
- Drones
- Perros robot
- Humanoides
- Cámaras
- Arcos carreteros

### 3.2 Controles de mapa

- Zoom in / out
- Vista 3D ↔ 2D
- Centrar en Guadalajara
- Orientar al norte
- Pantalla completa
- Capas base satelital: reservado (no disponible en esta maqueta)

El día / noche del mapa vive en el interruptor de tema de la barra superior, no en los controles del mapa.

### 3.3 Interacción espacial

- Marcadores de incidente con color por prioridad.
- Al seleccionar un incidente: **popcard** con stream en vivo, radar y enfoque de cámara.
- Al seleccionar unidades asignadas: **ruta** hacia el punto + distancia en callout.
- Ficha flotante (**devcard**) con línea de tiempo de misión, stream en vivo y resumen (código, destino, estado, ETA) para cámaras, arcos y fichas abiertas desde los paneles.
- Al seleccionar un **perro robot, humanoide o dron** en el mapa: se abre el módulo **Monitoreo** con esa unidad en foco.
- Rutas de patrullaje dibujadas sobre el mapa al abrir una ruta del panel.
- Desde el minimapa de Monitoreo (doble clic): regreso al Mapa con el marcador de esa unidad enfocado.

---

## 4. Modo Vigía (IA autónoma)

Panel que muestra el trabajo de Saimon sobre un incidente en curso.

### 4.1 Hilo de ejecución

- Bitácora de acciones de la IA (evaluación, filtrado, clasificación, despacho, reasignación).
- Banner de estado en vivo (“siguiendo unidades…”, folio del incidente).

### 4.2 Plan del incidente

- Identificación del caso, descripción y tiempo transcurrido.
- Cadena de pasos (ubicación validada → confirmación → óptica → despacho → seguimiento → cierre).
- Lista de **recursos despachados** (perro robot, humanoide, dron) con ETA.
- Acciones de teatro: *Pausar autonomía* / *Tomar control* (presentes en UI; sin lógica de producto en esta maqueta).
- Tira de agentes (Vision, Dispatch, Route, Sensor, Incident, Data) en acordeón.

### 4.3 Guion demo: alerta entrante

Activable desde la **campana** junto al avatar Saimon. Simula el ciclo completo:

1. **Notificación** tipo alerta (toast rojo, ~3 s).
2. Apertura automática del panel **Vigía**.
3. Zoom del mapa hacia el punto del nuevo incidente.
4. Animación del log y de la cadena de decisión.
5. Visualización del **stream del arco carretero** en el popcard.
6. Asignación secuencial de unidades (perro → humanoide → dron), cada una con su cámara.
7. Al cierre: **tres rutas** hacia el incidente + cámara del dron activa.
8. El operador permanece en Vigía; la campana permite repetir el guion.

**Caso demo:** accidente automovilístico detectado en **ARC-02** (folio `4300090410`), con unidades dedicadas (ZM-22, HU-12, DR-09) y clips propios, separados del incidente histórico de Av. Américas.

---

## 5. Modo Incidentes

Cola operativa de incidentes vivos.

### 5.1 Lista

- Búsqueda por texto.
- Filtros por **prioridad** (alta / media / baja).
- Filtros por **estatus** (abierto / despachado / cerrado).
- Resumen de abiertos, despachados y en atención.

### 5.2 Detalle

Al abrir un incidente:

- Stream principal (escena) con pestañas hacia ópticas de unidades cuando existen.
- Tipo, estatus, tiempo transcurrido, sector y dirección.
- Descripción operativa.
- Bloque de **unidades asignadas** (foto/stream, código, tipo, ETA).
- **Historial** temporal del caso.
- Sincronización con el mapa: popcard, marcador, rutas y distancias de las unidades.

---

## 6. Modo Dispositivos

Inventario de salud de la flota y sensores.

### 6.1 Catálogo

Tipos: **dron, perro robot, humanoide, cámara, arco carretero**.

Estados de salud: en línea, degradado, fuera de línea, dañado.

Operación de drones:

- **Desplegado** (marcador destacado en mapa)
- **En hangar**

### 6.2 Panel

- Porcentaje en línea y resumen por estado.
- Inventario agrupado por sector.
- Búsqueda y chips de filtro (tipo, estado, críticos, desplegado, hangar).
- Al elegir un dispositivo en lista: enfoque del marcador en mapa.
- Al hacer clic en el marcador: ficha **devcard** con stream o imagen según tipo/estado.

---

## 7. Modo Rutas

Rutas de patrullaje (IA + humano).

- Lista con búsqueda.
- Filtros por estado (en curso, incumplida, programada, pausada) y origen (IA / humano).
- Detalle: metadatos, corporaciones, incidentes cubiertos, autoría e itinerario.
- Trazado de la ruta en el mapa (terrestre o aérea según el caso).

---

## 8. Módulo Monitoreo

Teatro de control de la flota móvil. Se abre desde la barra (**Monitoreo**) o al pulsar un marcador de perro, humanoide o dron en el mapa. Mientras el módulo está visible, una simulación ligera (cada ~2 s) mueve batería, autonomía, avance de ruta y avisos. Al salir, la simulación y los videos se pausan.

La flota de demo son **9 unidades** enlazadas al inventario del mapa (`deviceId` / `markerKey`). El foco inicial es la primera unidad en misión (**ZM-14**).

### 8.1 Columna de flota

Panel izquierdo redimensionable (arrastre del separador, ~224–640 px; doble clic lo devuelve al ancho por defecto).

- Conteo de unidades.
- Cuadrícula de cámaras: **1 · 2 · 4 · 9**.
- Búsqueda por ID, nombre o tipo.
- Filtro por estatus operativo, con el chip de color del estado elegido.

Cada fila muestra miniatura, código y tipo, chip de estatus, porcentaje de batería (resalte si ≤ 20 %) y modo (**Autónomo** / **Manual**). El orden prioriza alerta, control manual, misión, patrulla, retorno, carga y sin conexión.

Estatus operativos:

| Estatus | Significado en la maqueta |
|---|---|
| Patrullando | Recorrido autónomo sin incidente asignado |
| En misión | Despacho a un incidente |
| Regresando a base | Retorno (orden del operador o fin de cobertura) |
| Cargando | En hangar; la batería sube en la simulación |
| Control manual | El operador tiene el mando |
| Alerta | Batería crítica, ráfaga u otra condición marcada |
| Sin conexión | Sin enlace; no hay stream ni control |

### 8.2 Vista de una cámara

Stream dominante de la unidad en foco (clips locales según el tipo). El badge indica **EN VIVO**, **REPLAY** (si se está revisando la línea de tiempo) u **OFFLINE** (sin señal, video vacío).

HUD sobre el video:

- Código, nombre, chip de estatus y badge de batería (ámbar ≤ 40 %, rojo ≤ 20 %).
- Misión y, si va en misión o de regreso, distancia ilustrativa al destino.
- Telemetría plegable: barra de batería, autonomía, señal, velocidad, rumbo y tiempo en operación.
- Aviso breve (toast) ante órdenes o eventos de la simulación (batería, obstáculo).

**Control.** En autónomo solo se ven los botones Autónomo / Manual. Al pasar a manual se despliega:

- Aviso «Operador en control manual» (o «Sin enlace» si la unidad está offline).
- **Regresar a base** — pasa a retorno autónomo y deja constancia en la bitácora.
- **Pose standby** — velocidad a cero.
- Dos joysticks de teatro: **Desplazamiento** (altera velocidad y rumbo en pantalla) y **Cámara / giro** (solo visual).
- **DETENER** — paro de emergencia: velocidad cero, modo manual y entrada de alerta en la bitácora.

Con el foco en manual, el teclado también mueve la unidad (flechas o WASD) y la barra espaciadora dispara el paro. Una unidad sin conexión no acepta modo, joysticks ni paro. Volver a autónomo registra «Control devuelto a VIGIA» y recupera el estatus previo (alerta, misión o patrulla).

**Últimas acciones.** Bitácora de la unidad, oculta al entrar; se abre con el botón de lista. Las entradas de alerta (batería crítica, enlace perdido, paro, etc.) van marcadas.

**Vista de ubicación.** Minimapa con la ruta de la unidad, destino y rumbo. Se redimensiona desde la esquina (doble clic restaura el tamaño). Doble clic en el mapa —o Enter / espacio con el foco en el marco— regresa al módulo Mapa y centra el marcador de esa unidad.

**Línea de tiempo de grabación.** Solo en la vista de 1 cámara; oculta al entrar. Es un mock visual de unas cuatro horas:

- Tira de fotogramas de escena (calle / incidente, no la foto del robot).
- Marcas de alerta tomadas de la bitácora; al pulsarlas se salta a ese momento.
- Playhead arrastrable, reproducción / pausa del replay y botón **En vivo**.
- Fuera del extremo en vivo el badge pasa a REPLAY y el video se pausa. Al llegar al final, o al cerrar la línea, vuelve a en vivo.

### 8.3 Muro de cámaras

En 2, 4 o 9 la vista de foco (HUD, bitácora y línea de tiempo) se sustituye por un muro. Entran las primeras unidades del filtro, con la enfocada primero. Cada mosaico lleva su clip, código, estatus y badge **En vivo** o **Sin señal**.

- Clic: selecciona la unidad (el resalte sigue en la lista y en el mosaico).
- Doble clic, o el botón **Vista 1**: vuelve a la cámara única de esa unidad.

### 8.4 Flota de la demo

| Código | Tipo | Estatus inicial | Notas |
|---|---|---|---|
| ZM-14 | Perro robot | En misión | Foco por defecto. Colisión Av. Américas (`4300090172`) |
| HU-07 | Humanoide | En misión | Apoyo médico del mismo incidente |
| DR-03 | Dron | En misión | Óptica sobre el punto |
| ZM-19 | Perro robot | Alerta | Batería baja (~18 %) |
| HU-21 | Humanoide | Patrullando | Sector 2 Norte |
| DR-07 | Dron | Cargando | Hangar norte |
| ZM-08 | Perro robot | Control manual | Alteración del orden, Salida Sur |
| HU-05 | Humanoide | Sin conexión | Sin stream ni mando |
| DR-11 | Dron | Regresando a base | Retorno al hangar sur; aviso de ráfaga |

---

## 9. Módulos reservados

Presentes en la barra, todavía sin flujo:

- **Administración de robots** — alta, configuración, asignación a sectores y políticas de autonomía.
- **Tableros de métricas** — indicadores operativos a mayor escala que la columna izquierda del mapa.

---

## 10. Streams y media

La maqueta usa video local (autoplay, loop, silenciado) como “en vivo”:

| Contexto | Contenido |
|---|---|
| Cámaras y arcos (pool general) | Clips de arco / vía |
| Perros robot y humanoides | Clips de unidad terrestre |
| Drones | Clips aéreos |
| Guion de accidente | Arco + perro + humanoide + dron específicos del caso demo |
| Monitoreo (vista 1 y muro) | El clip de cada unidad de la flota; si falta, se reutiliza uno del pool |
| Línea de tiempo | Fotograma fijo de escena (`monitor-streetview`), no el video grabado |

También hay imágenes estáticas de respaldo (dispositivos en hangar, miniaturas de la flota, identity, etc.).

---

## 11. Incidentes mock incluidos

Entre otros:

| Folio | Tipo | Notas |
|---|---|---|
| 4300090410 | Accidente automovilístico | Caso del guion demo (ARC-02) |
| 4300090172 | Colisión vehicular | Caso histórico Américas + unidades ZM-14 / HU-07 / DR-03 |
| 4300090214 | Alteración del orden | Prioridad media |
| 4300090188 | Accidente de motocicleta | Sin recursos aún |
| 4300090301 | Obstrucción de vía | Prioridad baja |
| 4300090333 | Vandalismo | Unidad en sitio |

---

## 12. Fuera de alcance en esta versión

- Backend, autenticación, persistencia o APIs reales.
- IA / despacho / ruteo reales (todo es teatro visual).
- Teleoperación real: joysticks, WASD, **DETENER**, retorno a base y pose standby solo alteran la maqueta en pantalla.
- Video en vivo o grabaciones reales. La línea de tiempo no reproduce un archivo histórico; mueve un playhead sobre fotogramas fijos.
- Capa satelital / basemap fotorealista.
- Cableado de *Pausar autonomía* y *Tomar control* en el modo Vigía del mapa (el control manual vive en Monitoreo).
- Flujos de **Administración** y **Tableros** (solo portada).
- Cambio de mapa o paneles derechos al cambiar dominio (Movilidad / Agua / Residuos).
- Responsive móvil (la maqueta privilegia escritorio 1080p).
- Auditoría, Urban Governance, estados vacíos/error de producto.

---

## 13. Cómo ejecutarlo

Requiere **servidor HTTP** y red (CDN MapLibre + teselas OpenFreeMap).

```bash
python3 -m http.server 8777
# Abrir http://localhost:8777
```

O Live Server sobre `index.html`.

---

## 14. Mapa de módulos (referencia técnica)

| Pieza | Archivo principal |
|---|---|
| Datos mock (incluye `MONITOR_FLEET`) | `js/data.js` |
| Barra de módulos | `js/shell.js` |
| Columna izquierda | `js/ui.js` |
| Mapa y rutas | `js/map.js` |
| Modos Saimon + fichas | `js/ai.js` |
| Dispositivos | `js/devices.js` |
| Rutas de patrulla | `js/routes.js` |
| Incidentes | `js/incidents.js` |
| Guion alerta demo | `js/demo-alert.js` |
| Monitoreo de robots | `js/monitor.js` |
| Design system | `design-system/MASTER.md` |

---

*Documento generado a partir de la maqueta actual de Saimon Nexus. Uso interno / alineación con stakeholders.*
