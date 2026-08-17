// Container health probe (`node dist/healthcheck.js`): kept as a script in the
// image so unit files never need shell-quoted inline JavaScript.
const res = await fetch(
  `http://127.0.0.1:${process.env['PORT'] ?? 3000}/healthz`,
).catch(() => null);
process.exit(res?.ok === true ? 0 : 1);
