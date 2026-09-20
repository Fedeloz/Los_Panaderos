<div align="center">
  <img src="simulator/static/favicon.png" width="64" alt="">
  <h1>Los Panaderos</h1>
  <p><strong>Del primer aviso de humo a una respuesta coordinada.</strong></p>
  <p>Agentes de IA, drones y comunicaciones para simular una emergencia forestal en Brunete.</p>
  <p><strong>HackSpain 2026 · Equipo 9 · HappyRobot</strong></p>
</div>

<p align="center">
  <a href="#cómo-funciona">Cómo funciona</a> ·
  <a href="#explorar-la-demo">Probar la demo</a> ·
  <a href="#próximos-pasos">Próximos pasos</a> ·
  <a href="#documentación">Documentación</a>
</p>

![Sala de crisis de Brunete: estado de la población, flota y mapas de la situación real simulada y de las observaciones disponibles.](docs/sala-de-crisis.png)

*Sala de crisis en `main`: incidente simulado, pausado en T+13. Captura local sin
conexión a HappyRobot ni órdenes de agentes.*

## Los primeros minutos importan

El humo llega antes que la confirmación. El viento cambia. Hay más frentes que
medios, y enviar un camión a un sector deja otro esperando.

**Los Panaderos conecta información, decisiones y acciones:** una centralita
multiagente recibe avisos y observaciones, prioriza distritos, coordina la flota
y comunica qué debe hacer la población. El operador sigue el incidente desde
CECOP, la central de operaciones.

| Observar | Decidir | Actuar |
|:---|:---|:---|
| Aviso de humo, sensores locales y satélite retardado. | Verificar el foco, priorizar personas y asignar recursos. | Explorar, contener, movilizar camiones y emitir avisos. |

**La información es incompleta por diseño.** El mapa de la izquierda muestra el
incendio simulado; el de la derecha, lo que el sistema conoce. Un foco nuevo
permanece oculto para los agentes hasta que sus sensores lo descubren.

## Cómo funciona

```mermaid
flowchart LR
    INFO["Recibir información"] --> PRIORIDAD["Priorizar"]
    PRIORIDAD --> ACTUAR["Dar órdenes y avisar"]
    ACTUAR --> OBSERVAR["Observar qué cambia"]
    OBSERVAR -->|"Volver a decidir"| INFO
```

**HappyRobot decide las prioridades y las órdenes.** El simulador valida y
ejecuta esas órdenes, recoge nuevas observaciones y devuelve la información
para revisar la respuesta.

| Quién | Responsabilidad |
|:---|:---|
| **Despacho Central** | Decide qué verificar, a quién avisar y qué misión encargar a la flota. |
| **Los Panaderos** | Coordina las órdenes de exploración, contención y camiones, con una orden por vehículo. |
| **Llamadas y Telegram** | Comunican instrucciones a contactos y distritos; informar y evacuar son acciones distintas. |
| **Marina** | Atiende consultas de residentes: pregunta nombre y barrio y consulta el estado público. |

### Un ejemplo

1. **Llega un aviso de humo** cerca de la granja, todavía sin confirmación local.
2. **Despacho decide qué hacer primero:** verificar, avisar preventivamente o
   movilizar recursos según la información disponible.
3. **La flota ejecuta:** el scout explora o avisa, el dron de extinción contiene
   desde posiciones seguras y el camión ataca el sector asignado.
4. **Aparece información nueva:** cambia el viento o el scout descubre otro foco.
   El simulador envía un nuevo evento para que Despacho reconsidere la respuesta.

## Qué encontrarás en CECOP

| Pantalla | Para qué sirve |
|:---|:---|
| **Situación** | Vista general del incidente y acceso a la sala de crisis. |
| **Sala de crisis** | Dos mapas, misión, población, órdenes, viento y controles de simulación. |
| **Medios** | Disponibilidad y estado de los recursos. |
| **Archivo** | Consulta del estado compartido, eventos y comunicaciones del incidente. |

La interfaz está disponible en **español e inglés**. Puedes configurar la flota,
pausar el reloj, cambiar el viento y añadir focos para observar cómo evoluciona
la información disponible.

## Explorar la demo

**Necesitas Python 3.** El servidor local usa la biblioteca estándar, sin
dependencias Python externas ni compilación del frontend.

```sh
git clone https://github.com/jucamohedano/Los_Panaderos.git
cd Los_Panaderos
python3 -m simulator.server
```

Abre **<http://127.0.0.1:8765>** y entra en **Sala de crisis**.
Configura flota y viento, pulsa **1 · Ignición** y después **2 · Aviso de humo**.

En un checkout limpio puedes explorar la interfaz y el fuego simulado sin
credenciales. **Las decisiones de agentes requieren conectar HappyRobot**;
el servidor local no las inventa.

<details>
<summary><strong>Conectar HappyRobot y las comunicaciones</strong></summary>

1. Copia [`.env.example`](.env.example) a `.env`.
2. Configura `STATE_API_URL` y `STATE_API_TOKEN` para el Worker y su KV
   ([código de la API](state-api/)). Configura la misma conexión en los
   workflows de HappyRobot.
3. Mantén `HAPPYROBOT_MODE=loop` y usa el mismo `DISPATCH_INCIDENT_ID`
   en simulador y Despacho; el valor por defecto es `brunete-demo`.
4. Configura los contactos `DEMO_*` con teléfonos y Telegram del equipo:
   **los canales conectados envían llamadas y mensajes reales**.
5. Reinicia el servidor y abre un run de **Despacho Central** en
   **development** antes de iniciar el incidente y enviar el aviso de humo.

En modo `loop`, el simulador escribe en el buzón compartido y recoge las
órdenes que deja Despacho. El simulador no inicia runs de HappyRobot.

**Reiniciar también solicita borrar el estado compartido** cuando la API está
conectada. Comprueba el estado de conexión si el borrado falla.

El modo alternativo `HAPPYROBOT_MODE=push` inicia un run por decisión y requiere
un proxy MCP local autenticado; sus variables están en `.env.example`.

[Despacho Central](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/zqtnabjy5loj/editor/wm9viy0rm87v)
· [Los Panaderos](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/mg9barxt86w3/editor/ol9kqyjzgq0m)
· [Marina](https://platform.eu.happyrobot.ai/hackspainteam9/workflows/8angdc9uc7nz/editor/m3cs7r55sfuv)

</details>

## Documentación

| Quiero entender… | Referencia |
|:---|:---|
| Los agentes y sus herramientas | [Workflow Los Panaderos](docs/los-panaderos-workflow.md) |
| La integración actual con HappyRobot | [Cambios de workflows](docs/happyrobot-workflow-changes.md) |
| Qué se ha probado con agentes reales | [Validación de escenarios](docs/demo-validation.md) |
| La procedencia de población, mapa y refugios | [Datos del escenario](docs/population-provenance.md) |

<details>
<summary><strong>Comprobaciones locales para desarrollo</strong></summary>

Python para el simulador; Node.js para los tests del dashboard y de la API.

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.cjs
node --test state-api/src/*.test.js
```

</details>

## Próximos pasos

Estas capacidades **todavía no están en `main`**. La ampliación de
[PR #1](https://github.com/jucamohedano/Los_Panaderos/pull/1) sirve como base para
los siguientes pasos de integración y validación:

| Paso | Objetivo |
|:---|:---|
| **Anticipar** | Integrar pronósticos de futuros posibles y pedir una nueva decisión cuando las observaciones contradigan el pronóstico. |
| **Recordar** | Recuperar casos y lecciones de SQLite para preparar un breve contexto antes de decidir. |
| **Revisar** | Conectar la evaluación de alternativas y Post-mortem para explicar resultados y guardar lecciones después de actuar. |
| **Seleccionar experiencia** | Integrar el workflow opcional **Obtener experiencia**, aún sin publicar, con un resumen determinista de respaldo. |
| **Comparar recomendaciones** | Incorporar **Jev** como observador opcional en sombra, sin capacidad para aplicar órdenes. |
| **Validar la mejora** | Evaluar con HappyRobot en vivo si la experiencia recuperada mejora las decisiones. |

El objetivo es aprender mediante **experiencia relevante en el contexto**,
sin reentrenar el modelo.

Diseño en desarrollo: [bucle y diagramas](https://github.com/jucamohedano/Los_Panaderos/blob/devin/1789865844-possible-worlds/docs/self-healing-loop.md)
· [evaluación y límites](https://github.com/jucamohedano/Los_Panaderos/blob/devin/1789865844-possible-worlds/docs/adaptation-evaluation.md).

---

**Alcance de la demo.** El fuego, sensores y movimientos son simulados; el mapa
es ilustrado y no está georreferenciado. Los **11.261 habitantes** corresponden
al total censal de Brunete de 2025; su reparto entre distritos y las **100 personas
de la granja** son supuestos del escenario. Los puntos de encuentro no son un
plan oficial de evacuación. Es un prototipo educativo, no una predicción
operativa de incendios.
