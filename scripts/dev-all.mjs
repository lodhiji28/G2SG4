#!/usr/bin/env node
/**
 * `npm run dev:all` — Vite (front-end, :3000) + the API/static server (:8787)
 * in one command. Vite proxies /api to :8787, so the browser only ever talks
 * to one origin (see vite.config.ts).
 */
import { spawn } from 'node:child_process';

const children = [];

function run(label, command, args, color) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    shell: false,
  });
  const prefix = `\x1b[${color}m[${label}]\x1b[0m `;
  const pipe = (stream, target) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) target.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(`${prefix}exited with code ${code}\n`);
  });
  children.push(child);
}

run('api', process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], 36);
run('web', 'npm', ['run', 'dev'], 35);

const shutdown = () => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
