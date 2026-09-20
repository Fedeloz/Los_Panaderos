# Los Panaderos

Sistema multiagente para coordinación de incendios

<!--
  Short demo video: simulation (maps, fleet, wind) + HappyRobot in action
  (Despacho, drones, Telegram / llamada). Drop the file and uncomment:

  <video src="docs/demo.mp4" controls width="100%"></video>
-->




## El problema

En un incendio el humo llega antes que la confirmación. El viento cambia. Hay más frentes que medios.

Hay que decidir ya qué información cuenta, a quién se avisa y dónde va cada recurso. Mandar el camión a un sector es dejar el otro esperando.

El cuello de botella no es solo el fuego. Es la centralita: filtrar avisos, priorizar a la población y coordinar a la vez la flota y las comunicaciones. Un protocolo fijo se queda atrás en el primer cambio de frente.

## La solución

Usamos HappyRobot junto a un motor de simulación.

HappyRobot es el cerebro. Agentes que razonan, avisan y asignan misiones. El simulador es el mundo: incendio, viento, sensores, vehículos y población. HappyRobot no sustituye la física. El motor avanza el fuego, mueve la flota y comprueba cada orden.

La centralita, Despacho Central, decide con lo que llega: aviso de humo, telemetría y reportes del scout. Debajo, agentes heterogéneos ejecutan. Scout y dron de extinción (Los Panaderos). Camión de bomberos. Canales de aviso: llamada y Telegram.

Drones autónomos patrullan para detectar pronto. Reducen la incertidumbre y solo entonces se desvía la extinción o se alerta a un distrito.

Cada vehículo tiene autonomía táctica en el simulador: planificador de ruta, distancia de seguridad al fuego y sistema de extinción. HappyRobot no pilota cada celda.

El simulador escribe en el buzón. HappyRobot lee y decide. El motor aplica la orden o la rechaza a la vista. El reloj se para mientras los agentes deliberan.

## Cómo decide la centralita

El mapa no enseña el incendio entero. Hay dos capas: el terreno y lo que los sensores han visto. El satélite llega tarde. Un foco pintado sigue oculto hasta que un scout o un extinguisher lo observa.

El buzón recibe el aviso de humo (`farmer_call`) y, si el explorador confirma un foco distinto, el reporte del scout (`scout_fire_report`).

Despacho elige avisar, no avisar o verificar. Fija criticidad y destinatarios. La misión de flota la cierra Los Panaderos: primero Scout, luego Dron. Una orden por id (`scout-1`, `drone-1`, `engine-1`).

A quién se avisa y cuándo depende del riesgo: viento hacia un distrito sin aviso, tiempo de preaviso y si el fuego está confirmado. No se evacúa el municipio entero. Se avisa el distrito amenazado, o se informa sin mover a la población.

El simulador rechaza coordenadas fuera de mapa, distritos inventados o un `reason` vacío.

Si el viento gira o el scout confirma fuego, hay un evento nuevo y la centralita vuelve a decidir.

## Cómo actúa

| Medio | Papel |
|---|---|
| Dron scout | Patrulla, confirmación temprana, megafonía de aviso |
| Dron extinguisher | Reconocimiento cercano y contención. No vuela a una celda en llamas |
| Camión de bomberos | Ataque al sector (`attack_sector`). Medio principal de extinción |

Un camión en el sector A no está en el B.

Agentes de razonamiento abren el canal: alerta de zona (`evacuate` o `inform`), llamada a un contacto, Telegram personal. Un mensaje de calma no debe salir como evacuación.

La llamada del vecino no pasa por el buzón. Marina pregunta nombre y barrio y lee el estado público (`GET /lookup`).

El operador ve la sala CECOP. Puede pausar o cambiar el viento.

Más adelante: cruce con bases gubernamentales de residentes en zona, y cámaras térmicas en los drones. Hoy el aviso usa el directorio de demo y sensores simulados.

## Arrancar

Antes de ignición y aviso de humo, deja abierto el Run de **Despacho Central** en development. El ↺ Reiniciar no borra la KV (`brunete-demo`).

```sh
python3 -m simulator.server
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) → **Sala de crisis** → flota y viento → **1 · Ignición** → **2 · Aviso de humo**.

Flujos: [Despacho Central](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/wm9viy0rm87v) · [Los Panaderos](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/ol9kqyjzgq0m) · [Gestor / Marina](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/8angdc9uc7nz/editor/m3cs7r55sfuv)

El escenario de demo es Brunete. El padrón municipal es 11.261 (2025). El reparto por barrios y los 100 de la granja son escenario. El mapa no está georreferenciado. Detalle: `docs/`.
