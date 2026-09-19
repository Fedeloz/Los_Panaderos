.PHONY: db data load scenario api console test

PY ?= python

db:
	docker compose up -d db
	docker compose exec db psql -U wildfire -d wildfire -f /docker-entrypoint-initdb.d/01-schema.sql || true

data:
	$(PY) -m geo.fetch_data

load:
	$(PY) -m geo.load_catastro
	$(PY) -m geo.synth_padron

scenario:
	$(PY) -m engine.run_scenario --name sierra_de_gata_2026

api:
	$(PY) -m uvicorn api.main:app --host 127.0.0.1 --port 8000

console:
	cd console && npm install && npm run dev

test:
	$(PY) -m unittest discover -s tests -v
