# iSign Attendance Backend

Node.js, Express, TypeScript, and PostgreSQL backend supporting attendance management, authentication, mobile attendance verification, roster access, attendance history, and integration with a Python biometric verification service.

> This repository is a sanitized portfolio snapshot of backend work from the team-developed iSign Attendance Management System. The original system was developed collaboratively under the i3cubes organization. This repository is presented with authorization and does not imply sole ownership of the complete backend.

## My Contribution

My backend contribution focused primarily on the mobile attendance-verification workflow and its integration with the biometric verification service.

Verified work includes:

- Implemented mobile duty-verification backend functionality
- Enforced selfie/biometric verification for attendance workflows
- Implemented fail-closed biometric verification behavior
- Added meaningful biometric-service failure responses
- Removed GPS from required verification steps when the verification policy changed
- Added face-enrollment persistence verification
- Prevented invalid or duplicate attendance-verification attempts
- Added mobile device roster functionality
- Added mobile attendance-history functionality
- Tested failure handling between the Node.js backend and Python verification service

This repository also contains functionality developed by other contributors. Features outside the contribution scope above should not be interpreted as solely authored by me.

## Architecture

```text
Android application
        |
        | REST API
        v
Node.js / Express / TypeScript backend
        |
        +---- PostgreSQL
        |
        +---- Internal HTTP integration
                  |
                  v
          Python / FastAPI
          biometric verification service

```

Important integration boundary:

- Android communicates with the Node/Express backend.
- Android does not call the Python verification service directly.
- The backend controls verification sessions and invokes the Python service internally.
- PostgreSQL stores application and attendance data.

## Backend Areas

The codebase includes functionality for:

- Attendance
- Authentication
- Biometric operations
- Devices
- Employees
- Locations
- Regions
- Reports
- Roles and permissions
- Rosters
- Users
- Verification sessions

## Technology Stack

- Node.js
- Express
- TypeScript
- PostgreSQL
- Vitest
- Supertest
- Axios
- JSON Web Tokens
- OpenAPI 3.0.3

## Testing

The sanitized portfolio snapshot was rebuilt and tested independently.

Verified result:

```text
Test files: 8/8 passed
Tests:      52/52 passed
Failures:   0
```

Test areas include:

- Attendance biometric security
- Attendance verification policy
- Authentication security
- Device attendance history
- Device roster access
- Python biometric-service integration
- Biometric-service failure handling
- Verification-session security

Run tests:

```bash
npm test
```

Run coverage:

```bash
npm run test:coverage
```

Current coverage baseline:

| Metric     | Coverage |
| ---------- | -------: |
| Statements |   40.00% |
| Branches   |   42.97% |
| Functions  |   46.55% |
| Lines      |   40.04% |

The overall coverage figure is a baseline rather than a project-quality claim. Some security-critical modules have substantially higher coverage.

## Project Structure

```text
src/
  config/
  controllers/
  jobs/
  middlewares/
  routes/
  services/
  utils/

tests/
migrations/
seeds/
docs/
```

## Local Setup

### Prerequisites

- Node.js
- npm
- PostgreSQL

### Install dependencies

```bash
npm ci
```

### Environment configuration

Copy `.env.example` to `.env` and configure local development values.

Do not commit `.env`.

### Build

```bash
npm run build
```

### Run development server

```bash
npm run dev
```

### Run tests

```bash
npm test
```

## API Documentation

A sanitized OpenAPI 3.0.3 specification is available at:

```text
docs/openapi.yaml
```

The OpenAPI file in this repository documents a subset of the backend API.

Broader cross-service architecture and API-contract documentation:

https://github.com/amilawedikkara/isign-attendance-platform-docs

## Security and Privacy

This portfolio version was prepared specifically for public presentation.

The published snapshot excludes:

- Local environment files
- Uploaded biometric or signature files
- Generated coverage output
- Local API response artifacts
- Company-specific deployment workflow
- Deployment host information
- Inherited Git history containing previously tracked uploaded files

Server addresses and API examples have been replaced with non-production values.

## Team Project Attribution

iSign is a multi-contributor team project.

My verified contribution spans backend development, Android attendance-verification functionality, FastAPI verification safeguards, cross-service API contracts, and frontend integration coordination.

This repository is intended to demonstrate my backend contribution while preserving the distinction between my work and contributions made by other team members.

## Related iSign Repositories

- Architecture and API contracts:
  https://github.com/amilawedikkara/isign-attendance-platform-docs

- Python verification service:
  https://github.com/amilawedikkara/isign-attendance-verification-engine

## Verification Status

Verified on this sanitized snapshot:

- TypeScript build successful
- 52/52 backend automated tests passed
- 8/8 test files passed
- Vitest coverage reporting reproducible
