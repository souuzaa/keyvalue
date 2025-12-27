# Repository Guidelines

## Project Structure & Module Organization
This repository currently has no source files committed. When you add code, keep it organized with clear, top-level folders such as `src/` for application code, `tests/` for automated tests, and `assets/` for static files. If you introduce a build system or framework, keep its config at the repo root (for example, `package.json`, `pyproject.toml`, or `Makefile`) and update this document with the final layout.

## Build, Test, and Development Commands
No build or test commands are defined yet. Once tooling is added, document the exact commands here with brief explanations. Examples:
- `npm run dev`: start the local dev server.
- `npm test`: run the full test suite.
- `make build`: produce a production build artifact.

## Coding Style & Naming Conventions
No formatting or linting tools are configured yet. When you add them, document the standard here (for example, 2-space or 4-space indentation, file naming patterns like `kebab-case.ts`, and any enforced formatters such as `prettier` or `black`). Keep naming consistent and descriptive; avoid one-letter identifiers outside small scopes.

## Testing Guidelines
No testing framework is configured yet. When tests are added, state the framework, coverage expectations, and naming conventions (for example, `*.test.js` under `tests/`). Also include the exact command to run unit and integration tests.

## Commit & Pull Request Guidelines
No commit convention has been established yet. Until then, use clear, imperative commit subjects (for example, `Add user authentication flow`) and keep commits focused. For pull requests, include a concise description, link related issues, and attach screenshots for UI changes.

## Agent-Specific Instructions
If you add automation or AI agent workflows, document them here with any required environment variables, secrets handling, and local setup steps.
