# Saimon Nexus — Descriptivo de funcionalidades

**Producto:** tablero de comando operativo (smart city / C5)  
**Versión documentada:** maqueta actual en `main` (octubre 2026)  
**Naturaleza:** maqueta conceptual de alta fidelidad. Los datos, rutas, streams y decisiones de IA son ilustrativos; no hay backend ni integraciones en vivo.

---

## 1. Propósito

Saimon Nexus concentra en una sola pantalla la lectura operativa de la ciudad:

| Zona | Pregunta que responde |
|---|---|
| Columna izquierda | **Cuánto** — volumen, tendencias e indicadores |
| Mapa central | **Dónde** — incidentes, recursos y cobertura espacial |
| Columna derecha | **Qué se está haciendo** — IA autónoma, inventario, rutas o cola de incidentes |

Está pensado para operadores de centro de mando (sala C5), calibrado a monitor **1920×1080**, tema oscuro.

---

## 2. Arquitectura de pantalla

### 2.1 Encabezado / marca en mapa

- Wordmark **Saimon Nexus** en el HUD superior izquierdo.
- Contexto de ciudad (Guadalajara, Jal.), clima ilustrativo y avatar de operador.
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
- Alternar **vista día / vista noche**
- Capas base satelital: reservado (no disponible en esta maqueta)

### 3.3 Interacción espacial

- Marcadores de incidente con color por prioridad.
- Al seleccionar un incidente: **popcard** con stream en vivo, radar y enfoque de cámara.
- Al seleccionar unidades asignadas: **ruta** hacia el punto + distancia en callout.
- Ficha flotante (**devcard**) con línea de tiempo de misión, stream en vivo y resumen (código, destino, estado, ETA).
- Rutas de patrullaje dibujadas sobre el mapa al abrir una ruta del panel.

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

## 8. Streams y media

La maqueta usa video local (autoplay, loop, silenciado) como “en vivo”:

| Contexto | Contenido |
|---|---|
| Cámaras y arcos (pool general) | Clips de arco / vía |
| Perros robot y humanoides | Clips de unidad terrestre |
| Drones | Clips aéreos |
| Guion de accidente | Arco + perro + humanoide + dron específicos del caso demo |

También hay imágenes estáticas de respaldo (dispositivos en hangar, identity, etc.).

---

## 9. Incidentes mock incluidos

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

## 10. Fuera de alcance en esta versión

- Backend, autenticación, persistencia o APIs reales.
- IA / despacho / ruteo reales (todo es teatro visual).
- Capa satelital / basemap fotorealista.
- Cableado de *Pausar autonomía* y *Tomar control*.
- Cambio de mapa o paneles derechos al cambiar dominio (Movilidad / Agua / Residuos).
- Responsive móvil (la maqueta privilegia escritorio 1080p).
- Auditoría, Urban Governance, estados vacíos/error de producto.

---

## 11. Cómo ejecutarlo

Requiere **servidor HTTP** y red (CDN MapLibre + teselas OpenFreeMap).

```bash
python3 -m http.server 8777
# Abrir http://localhost:8777
```

O Live Server sobre `index.html`.

---

## 12. Mapa de módulos (referencia técnica)

| Pieza | Archivo principal |
|---|---|
| Datos mock | `js/data.js` |
| Columna izquierda | `js/ui.js` |
| Mapa y rutas | `js/map.js` |
| Modos Saimon + fichas | `js/ai.js` |
| Dispositivos | `js/devices.js` |
| Rutas de patrulla | `js/routes.js` |
| Incidentes | `js/incidents.js` |
| Guion alerta demo | `js/demo-alert.js` |
| Design system | `design-system/MASTER.md` |

---

*Documento generado a partir de la maqueta actual de Saimon Nexus. Uso interno / alineación con stakeholders.*
