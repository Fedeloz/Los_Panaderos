# Los Panaderos

HackSpain 2026 · Team 9 · Un incendio en Brunete que cambia mientras corre.

HappyRobot decide. El simulador mueve el mundo, valida las órdenes y enseña al operador qué sabe el sistema — y qué no.

<!--
  Short demo video: simulation (maps, fleet, wind) + HappyRobot in action
  (Despacho, drones, Telegram / llamada). Drop the file and uncomment:

  <video src="docs/demo.mp4" controls width="100%"></video>
-->




## 1. Cómo decide

Brunete no le enseña el fuego entero. Hay dos mapas: lo que ocurre y lo que los sensores han visto. El satélite llega tarde. Un foco pintado en el mapa sigue oculto hasta que un scout o un dron lo pisa.

Llegan muchas señales; pocas cambian el plan. El buzón del **Despacho Central** recibe el aviso de humo de la granja (`farmer_call`, transcripción simulada) y, más tarde, un `scout_fire_report` si el explorador confirma un foco distinto. Despacho elige **avisar, no avisar o verificar**, con criticidad y destinatarios. La misión de flota la ejecuta el flujo **Los Panaderos**: Scout, luego Dron, con órdenes por vehículo (`scout-1`, `drone-1`, `engine-1`).

Qué va primero no es una lista fija. Con viento fuerte hacia un distrito sin aviso, la prioridad es avisar a esa gente, no apagar la celda más cercana. Mandar el camión al sector A es dejar el B esperando: cada orden nombra un recurso y un sitio. El simulador rechaza coordenadas fuera de mapa, distritos inventados o un `reason` vacío; no inventa un plan de recambio.

Cuando el viento gira o el scout confirma fuego, no se sigue el plan de hace veinte minutos: hay un evento nuevo y HappyRobot vuelve a decidir.

## 2. Cómo actúa

No basta con decir qué haría. El sistema mueve flota y avisa a personas.

- **Flota.** Drones exploran o contienen; el camión ataca un sector. La gente de un distrito solo se pone en marcha cuando llega un aviso de evacuación a *ese* distrito, no a Brunete entero.
- **Fuera del simulador.** Despacho dispara alerta de zona (Telegram), llamada a un contacto, o un mensaje personal. `action` en la alerta de zona debe ser `evacuate` o `inform`: un mensaje de calma con criticidad alta no debería sacar a 11.261 personas a la carretera.
- **La llamada del vecino** no pasa por el buzón. Marina (Gestor info incendios) pregunta nombre y barrio y consulta el estado público (`GET /lookup`). Identificado, vecino desconocido, o ambiguo.

El operador ve la sala CECOP (`/` situación nacional, `/incidente` Brunete), puede pausar, pedir otra decisión o cambiar el viento. El reloj se para mientras HappyRobot delibera, para que la latencia no mueva el fuego a escondidas.

## 3. Cómo se supervisa — y lo que aprende

La interfaz enseña la misión en curso, el ticket de órdenes, la gente por distrito y el registro de comunicaciones. Si una orden no es válida, se ve el rechazo; no se aplica en silencio.

El bonus del reto —aprender de ejecuciones anteriores— está en el bucle de adaptación (SQLite local, no Twin): casos parecidos y lecciones entran en un brief corto *antes* de la siguiente decisión; un post-mortem (oráculo + flujo **Post-mortem Los Panaderos**) escribe *después*. **Obtener experiencia** cura precedentes y sigue sin publicar. Jev puede puntuar en sombra; no aplica órdenes. Falta aún demostrar, en un run en vivo, que esa memoria mejora la decisión de HappyRobot.

## Arrancar

Hace falta un **Run de Despacho Central** abierto en development *antes* de ignición y aviso de humo. El ↺ Reiniciar no borra la KV (`brunete-demo`).

```sh
python3 -m simulator.server
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) → **Sala de crisis** → flota y viento → **1 · Ignición** → **2 · Aviso de humo**.

Flujos: [Despacho Central](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/wm9viy0rm87v) · [Los Panaderos](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/ol9kqyjzgq0m) · [Gestor / Marina](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/8angdc9uc7nz/editor/m3cs7r55sfuv)

Padrón municipal de Brunete 11.261 (2025); el reparto por barrios y los 100 de la granja son escenario, no censo oficial. El mapa no está georreferenciado. Detalle de física, prompts y casos grabados: `docs/`.
