.PHONY: up down logs test test-unit clean

init:
	npm run init:app

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f app

test:
	docker compose run --rm --build app npm test

test-unit:
	npm test

clean: down
	docker compose down -v
