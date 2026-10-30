# friklang

**Free English grammar, reading and writing trainer.**

friklang is a free, browser-based library for independent English study. The current Stage 2.2 trainer includes 10 lessons and 150 exercises, concise and detailed grammar explanations, original short readings, guided writing, answer feedback, free lesson navigation, local progress, and optional browser speech. It uses Vite and vanilla JavaScript. There is no backend, registration, paid API, or cross-device progress sync.

Progress is stored in IndexedDB in the current browser profile. Local `localhost` progress and progress on GitHub Pages are separate. Opening the public site does not import local drafts or progress.

The curriculum is under development. Educational content has not yet received independent professional linguistic editing. The Codex self-audit and automated tests are not an independent human linguistic review.

**Hands and AI**

Project concept, requirements, testing and product decisions by frikxe. Development implemented with AI assistance.

No licence granting free reuse of the educational content is included.

## Use the published site

[Open friklang on GitHub Pages](https://coilraze.github.io/friklang/).

The site is static and free to use. Your progress remains in that browser profile and is not synchronized with other devices.

## Run locally

Requires Node.js 22.12+ (or 20.19+).

```sh
npm ci
npm run dev
```

Vite prints the local address. Create a production build with `npm run build`; preview it with `npm run preview`.

## Checks

```sh
npm test
npm run test:e2e
GITHUB_PAGES=true npm run build
npm run test:pages
```

The GitHub Actions workflow runs the unit/content checks, browser E2E scenarios, a Pages production build, and direct-route tests before deployment.

## Project notes

- [Curriculum map](docs/curriculum.md)
- [Content audit and open editorial questions](docs/content-audit.md)
- [Language and punctuation standard](docs/language-standard.md)
- [Writing feedback approach](docs/writing-feedback.md)
- [Free navigation and progress model](docs/progress-and-navigation.md)
- [Stage 2.2 report](docs/stage-2.2-report.md)
- [Verification results](docs/verification-results.md)
