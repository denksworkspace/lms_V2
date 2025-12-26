# Repository Guidelines

## Project Structure & Module Organization
The Django backend lives under `apps/`, where each domain keeps its models, admin, APIs, and `test_*.py`. Shared settings and utilities sit in `lms/` with per-environment configs in `lms/settings/`. Templates live in `apps/templates`, and shared static bits live in `assets*` and `static`. The Node toolchain in `frontend/` emits bundles to `frontend/assets/v1/dist` for `django-webpack-loader`.

## Build, Test, and Development Commands
- `poetry install --with dev` — install Python 3.10 dependencies and dev extras into the managed virtualenv.
- `cp lms/settings/.env.example .env` then edit AWS_* and domain keys; pass it as `ENV_FILE=.env`.
- `docker run -d -p 127.0.0.1:5432:5432 --name lms-postgres -e POSTGRES_USER=csc -e POSTGRES_DB=cscdb -e POSTGRES_PASSWORD=FooBar postgres` — start PostgreSQL; launch Redis similarly with `docker run -d -p 127.0.0.1:6379:6379 --name lms-redis redis:6-alpine redis-server --appendonly yes`.
- `ENV_FILE=.env poetry run python manage.py migrate` — prepare the database, and run `collectstatic` before serving static files.
- `npm install --prefix frontend` then `npm run local:1 --prefix frontend` (or `npm run build:css`) — build JS/CSS artifacts.
- `ENV_FILE=.env poetry run python manage.py runserver localhost:8001` — launch the backend aligned with local frontend assets.

## Coding Style & Naming Conventions
Use four-space indentation, add type hints when practical, and keep heavy logic inside app-level helpers rather than views. Follow Django conventions: `CamelCase` models, `snake_case` functions, `UPPER_SNAKE` constants, and `PascalCase` React components in `frontend/`. Localize template blocks with `{% trans %}`, update `locale/` when strings change, and enforce deterministic imports (stdlib, third-party, local) before committing.

## Testing Guidelines
`pytest` is the canonical runner, configured via `pytest.ini` to load `lms.settings.test`, discover `test_*.py`, and reuse the database. Run `poetry run pytest` before pushing; scope to a module with `poetry run pytest apps/core`. Capture coverage on risky flows with `poetry run pytest --cov=apps/courses --cov-report=term-missing`. Keep fixtures and factories next to their app, name tests after behaviors (`test_enrollment_fails_without_slot`), and extend suites whenever migrations or async tasks change.

## Commit & Pull Request Guidelines
Commits follow short, imperative subjects (“Fix CI env”), so keep titles concise, single-purpose, and in present tense. Reference issues in the body and call out side effects (new env vars, migrations, feature flags). Pull requests should summarize the change, link tickets, note manual verification, and attach screenshots or sample payloads for UI/API work. Highlight schema or settings updates explicitly and confirm that `poetry run pytest` plus the relevant frontend build completed before requesting review.
