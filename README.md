# Los Panaderos

HackSpain 2026. Team 9. Incendio forestal en Brunete.

<!--
  Short demo video: simulation (maps, fleet, wind) + HappyRobot in action
  (Despacho, drones, Telegram / llamada). Drop the file and uncomment:

  <video src="docs/demo.mp4" controls width="100%"></video>
-->




## El problema

En un incendio rural el humo llega antes que la confirmación. El viento cambia. Hay más frentes que medios. Hay que decidir ya qué información cuenta, a quién se avisa y dónde va cada recurso. Mandar el camión a un sector es dejar el otro esperando.

El cuello de botella no es solo el fuego. Es la centralita: filtrar avisos, priorizar población y coordinar a la vez la flota y las comunicaciones. Un protocolo fijo se queda atrás en el primer cambio de frente.

## La solución

Un sistema multiagente en HappyRobot. Una centralita, Despacho Central, decide a partir de lo que recibe: aviso de humo, telemetría y reportes del scout. Debajo, agentes heterogéneos ejecutan: scout y dron de extinción (Los Panaderos), camión de bomberos, y canales de aviso (llamada y Telegram).

Drones autónomos vigilan el entorno para detectar pronto. Patrullan, reducen la incertidumbre y solo entonces se desvía la extinción o se alerta a un distrito. En el simulador cada vehículo tiene autonomía táctica: planificador de ruta, distancia de seguridad al fuego y sistema de extinción. HappyRobot no pilota cada celda.

## 1. Cómo decide la centralita

Brunete no enseña el incendio entero. Hay dos mapas: el terreno y lo que los sensores han visto. El satélite llega tarde. Un foco pintado sigue oculto hasta que un scout o un extinguisher lo observa.

El buzón recibe `farmer_call` (transcripción simulada) y, si el explorador confirma un foco distinto, `scout_fire_report`. Despacho elige avisar, no avisar o verificar, con criticidad y destinatarios. La misión de flota la cierra Los Panaderos: Scout, luego Dron, con una orden por id (`scout-1`, `drone-1`, `engine-1`).

A quién se avisa y cuándo depende del riesgo: viento hacia un distrito sin aviso, tiempo de preaviso y si el fuego está confirmado. No se evacúa Brunete entero. Se avisa el distrito amenazado, o se informa sin mover a la población. El simulador rechaza coordenadas fuera de mapa, distritos inventados o un `reason` vacío.

Si el viento gira o el scout confirma fuego, hay un evento nuevo y la centralita vuelve a decidir.

## 2. Cómo actúa

**Recursos**

| Medio | Papel |
|---|---|
| Dron scout | Patrulla, confirmación temprana, megafonía de aviso |
| Dron extinguisher | Reconocimiento cercano y contención. No vuela a una celda en llamas |
| Camión de bomberos | Ataque al sector (`attack_sector`). Medio principal de extinción |

Un camión en el sector A no está en el B.

**Población y comunicaciones.** Agentes de razonamiento abren el canal: alerta de zona (`evacuate` o `inform`), llamada a un contacto, Telegram personal. Un mensaje de calma no debe salir como evacuación.

La llamada del vecino no pasa por el buzón. Marina pregunta nombre y barrio y lee el estado público (`GET /lookup`).

El operador ve la sala CECOP, puede pausar o cambiar el viento. El reloj se para mientras HappyRobot delibera.

Más adelante: cruce con bases gubernamentales de residentes en zona, y cámaras térmicas en los drones. Hoy el aviso usa el directorio de demo y sensores simulados.

## 3. Cómo se supervisa

La interfaz muestra misión, órdenes, estado de cada distrito y el registro de comunicaciones. Una orden inválida se rechaza a la vista. El sistema no la sustituye en silencio.

De ejecuciones anteriores, un bucle local (SQLite) mete casos y lecciones en un brief antes de la siguiente decisión. El post-mortem escribe después. **Obtener experiencia** aún no está publicado. Jev puede puntuar en sombra. No manda flota.

## Arrancar

Run de **Despacho Central** abierto en development antes de ignición y aviso de humo. El ↺ Reiniciar no borra la KV (`brunete-demo`).

```sh
python3 -m simulator.server
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) → **Sala de crisis** → flota y viento → **1 · Ignición** → **2 · Aviso de humo**.

Flujos: [Despacho Central](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/wm9viy0rm87v) · [Los Panaderos](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/ol9kqyjzgq0m) · [Gestor / Marina](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/8angdc9uc7nz/editor/m3cs7r55sfuv)

Padrón municipal de Brunete 11.261 (2025). El reparto por barrios y los 100 de la granja son escenario. El mapa no está georreferenciado. Detalle: `docs/`.
