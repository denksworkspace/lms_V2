# Repository Guidelines

## Project Structure & Module Organization
- Django apps live under `apps/`; each domain keeps models, admin, serializers, API views, and `test_*.py`.
- Shared configuration and utilities sit in `lms/`, with environment-specific settings inside `lms/settings/`.
- Templates resolve from `apps/templates/` plus app-specific folders under `apps/**/templates/`; shared static assets live in `assets*`, `static/`, and the frontend build output `frontend/assets/v1/dist/`.
- The Node toolchain is contained in `frontend/`; webpack bundles reference Django via `django-webpack-loader`.

## Build, Test, and Development Commands
- `poetry install --with dev` — install Python 3.10 dependencies (manage virtualenv via Poetry).
- `cp lms/settings/.env.example .env` and set AWS/Domain keys, then export `ENV_FILE=.env` for Django commands.
- `docker run -d -p 127.0.0.1:5432:5432 --name lms-postgres … postgres` and analogous Redis command — start required services.
- `ENV_FILE=.env poetry run python manage.py migrate` and `manage.py collectstatic` — prepare database and static files.
- `npm install --prefix frontend` then `npm run local:1 --prefix frontend` (or `npm run build:css`) — build JS/CSS bundles.
- `ENV_FILE=.env poetry run python manage.py runserver localhost:8001` — launch the backend against local assets.

## Coding Style & Naming Conventions
- Python: four-space indent, type hints where practical, keep business logic in helpers/services. Follow import order stdlib → third-party → local.
- Django naming: `CamelCase` models, `snake_case` functions, constants in `UPPER_SNAKE`.
- Frontend React components live under `frontend/src` with `PascalCase` component names. Sass variables belong to `_variables.scss` and component-specific partials.
- Localize template strings via `{% trans %}` and update `locale/` when adding text.

## Testing Guidelines
- `pytest` is configured via `pytest.ini` to load `lms.settings.test`, discover `test_*.py`, and reuse the DB.
- Run `poetry run pytest` before pushing; scope modules with `poetry run pytest apps/core`.
- Capture coverage for risky flows using `poetry run pytest --cov=apps/courses --cov-report=term-missing`.
- Keep fixtures/factories near their app and name tests after behaviors (`test_enrollment_fails_without_slot`).

## Commit & Pull Request Guidelines
- Commits use short, imperative subjects (“Fix CI env”); mention related issues plus side effects (new env vars, migrations, feature flags).
- Pull requests should summarize the change, link tickets, note manual verification, and include screenshots or payloads for UI/API updates.
- Highlight schema/settings updates explicitly and confirm that `poetry run pytest` and relevant frontend builds completed before requesting review.

## Additional Tips
- Environment variables default to `.env`; override with `ENV_FILE` when needed. Historical Pipenv workflows are deprecated in favor of Poetry.
- Remember to rebuild frontend bundles when touching Sass/JS and rerun `collectstatic` to expose the new assets to Django.
