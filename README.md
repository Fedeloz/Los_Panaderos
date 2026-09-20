# Los Panaderos

HackSpain 2026 · Team 9 · Crisis de incendio forestal en Brunete.

<!--
  Short demo video: simulation (maps, fleet, wind) + HappyRobot in action
  (Despacho, drones, Telegram / llamada). Drop the file and uncomment:

  <video src="docs/demo.mp4" controls width="100%"></video>
-->




## El problema

Un incendio rural no espera a tener el mapa completo. El humo llega antes que la confirmación térmica, el viento gira, y hay más frentes que medios. Quien coordina tiene que decidir *ya*: qué información cuenta, a quién se avisa, y dónde va cada recurso — sabiendo que mandar el camión a un sector es dejar el otro esperando.

El cuello de botella no es solo el fuego. Es la centralita humana: filtrar avisos, priorizar población, y coordinar a la vez flota y comunicaciones. Un protocolo fijo se queda atrás en el primer cambio de frente.

## La solución

Un **sistema multiagente** en HappyRobot. Una **centralita** (Despacho Central) toma las decisiones de incidente a partir de lo que le llega: aviso de humo, telemetría, reportes de scout. Debajo, **agentes heterogéneos** ejecutan: scout y dron de extinción (Los Panaderos), camión de bomberos, y canales de aviso (llamada, Telegram de zona o personal).

La **monitorización del entorno** la hacen drones autónomos, para detección temprana: patrullan, reducen la incertidumbre y solo entonces se desvía extinción o se alerta a un distrito. Cada vehículo lleva **autonomía táctica** en el simulador — planificador de ruta, distancia de seguridad al fuego, jets de extinción — para actuar sin que HappyRobot pilote cada celda.

## 1. Cómo decide la centralita

Brunete no enseña el incendio entero. Hay dos mapas: el terreno y lo que los sensores han visto. El satélite llega tarde. Un foco pintado sigue oculto hasta que un scout o un extinguisher lo observa.

El buzón recibe `farmer_call` (transcripción simulada, no una llamada) y, si el explorador confirma un foco distinto, `scout_fire_report`. Despacho elige **avisar, no avisar o verificar**, con criticidad y destinatarios. La misión de flota la cierra Los Panaderos: Scout, luego Dron, con una orden por id (`scout-1`, `drone-1`, `engine-1`).

**A quién se avisa y cuándo** depende del riesgo: viento hacia un distrito *unwarned*, tiempo de preaviso, y si el fuego está confirmado. No se evacúa Brunete entero; se avisa el distrito amenazado, o se informa sin mover a la población. El simulador rechaza coordenadas fuera de mapa, distritos inventados o un `reason` vacío.

Si el viento gira o el scout confirma fuego, hay un evento nuevo: la centralita vuelve a decidir. No se conserva el plan de hace veinte minutos.

## 2. Cómo actúa — recursos y población

**Dónde van los recursos**

| Medio | Papel |
|---|---|
| Dron scout | Patrulla, confirmación temprana, megafonía de aviso |
| Dron extinguisher | Reconocimiento cercano y contención; no vuela a una celda en llamas |
| Camión de bomberos | Ataque al sector (`attack_sector`); el medio de supresión principal |

Cada asignación es exclusiva: un camión en el sector A no está en el B.

**Comunicaciones.** Reasoning agents quitan el cuello de botella entre “hay que avisar” y el canal: alerta de zona (`evacuate` o `inform`), llamada a un contacto, Telegram personal. Un mensaje de calma no debe salir con criticidad de evacuación.

La llamada del vecino **no** pasa por el buzón. Marina pregunta nombre y barrio y lee el estado público (`GET /lookup`).

El operador ve la sala CECOP, puede pausar o cambiar el viento. El reloj se para mientras HappyRobot delibera.

**Más adelante:** cruce con bases gubernamentales de residentes en zona, y cámaras térmicas en los drones. Hoy el aviso usa el directorio de demo y sensores simulados.

## 3. Cómo se supervisa — y lo que aprende

La interfaz muestra misión, órdenes, estado de cada distrito y el registro de comunicaciones. Una orden inválida se rechaza a la vista; el sistema no la sustituye en silencio.

El bonus —aprender de incidentes anteriores— vive en un bucle local (SQLite): casos y lecciones entran en un brief *antes* de la siguiente decisión; el post-mortem escribe *después*. **Obtener experiencia** aún no está publicado. Jev puede puntuar en sombra; no manda flota.

## Arrancar

Run de **Despacho Central** abierto en development *antes* de ignición y aviso de humo. El ↺ Reiniciar no borra la KV (`brunete-demo`).

```sh
python3 -m simulator.server
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) → **Sala de crisis** → flota y viento → **1 · Ignición** → **2 · Aviso de humo**.

Flujos: [Despacho Central](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/wm9viy0rm87v) · [Los Panaderos](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/ol9kqyjzgq0m) · [Gestor / Marina](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/8angdc9uc7nz/editor/m3cs7r55sfuv)

Padrón municipal de Brunete 11.261 (2025); el reparto por barrios y los 100 de la granja son escenario. El mapa no está georreferenciado. Detalle: `docs/`.
