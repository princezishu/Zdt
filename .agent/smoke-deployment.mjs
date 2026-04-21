import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const ROOT = process.cwd();
const SERVER_DIR = path.join(ROOT, 'server');
const APP_DIR = path.join(ROOT, 'app');
const LOG_DIR = path.join(ROOT, '.agent', 'logs');
const REPORT_PATH = path.join(LOG_DIR, 'deployment-smoke-report.json');

await fs.mkdir(LOG_DIR, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function safeString(value) {
  return String(value ?? '');
}

function truncate(value, max = 4000) {
  const text = safeString(value);
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function appendLog(filePath, chunk) {
  await fs.appendFile(filePath, chunk);
}

function createLongRunningProcess(label, command, args, cwd) {
  const stdoutPath = path.join(LOG_DIR, `${label}.out.log`);
  const stderrPath = path.join(LOG_DIR, `${label}.err.log`);
  const stdoutChunks = [];
  const stderrChunks = [];
  const { spawnCommand, spawnArgs } = normalizeWindowsCommand(command, args);
  const proc = spawn(spawnCommand, spawnArgs, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutChunks.push(text);
    void appendLog(stdoutPath, text);
  });
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrChunks.push(text);
    void appendLog(stderrPath, text);
  });

  const exited = new Promise((resolve) => {
    proc.once('exit', (code, signal) => resolve({ code, signal }));
  });

  return {
    label,
    proc,
    stdoutPath,
    stderrPath,
    exited,
    getStdout: () => stdoutChunks.join(''),
    getStderr: () => stderrChunks.join(''),
  };
}

function runCommand(label, command, args, cwd, timeoutMs = 240_000) {
  return new Promise((resolve, reject) => {
    const stdoutPath = path.join(LOG_DIR, `${label}.out.log`);
    const stderrPath = path.join(LOG_DIR, `${label}.err.log`);
    const { spawnCommand, spawnArgs } = normalizeWindowsCommand(command, args);
    const proc = spawn(spawnCommand, spawnArgs, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timer = null;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout.push(text);
      void appendLog(stdoutPath, text);
    });
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr.push(text);
      void appendLog(stderrPath, text);
    });

    proc.once('error', (error) => {
      finish(error);
    });

    proc.once('exit', (code, signal) => {
      const result = {
        code,
        signal,
        stdout: stdout.join(''),
        stderr: stderr.join(''),
        stdoutPath,
        stderrPath,
      };
      if (code === 0) {
        finish(null, result);
        return;
      }
      finish(
        new Error(
          `${label} failed with exit code ${code ?? 'null'} signal ${signal ?? 'null'}.\n` +
            `stdout:\n${truncate(result.stdout)}\n\nstderr:\n${truncate(result.stderr)}`
        )
      );
    });

    timer = setTimeout(() => {
      try {
        proc.kill('SIGTERM');
      } catch {}
      finish(
        new Error(
          `${label} timed out after ${timeoutMs}ms.\nstdout:\n${truncate(stdout.join(''))}\n\nstderr:\n${truncate(stderr.join(''))}`
        )
      );
    }, timeoutMs);
  });
}

async function stopProcess(handle) {
  if (!handle?.proc || handle.proc.exitCode !== null) {
    return;
  }

  const taskKill = spawn('taskkill', ['/PID', String(handle.proc.pid), '/T', '/F'], {
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
    shell: false,
  });

  await new Promise((resolve) => {
    taskKill.once('exit', resolve);
    taskKill.once('error', resolve);
    setTimeout(resolve, 5000);
  });
}

function normalizeWindowsCommand(command, args) {
  const normalizedCommand = safeString(command).trim();
  if (process.platform === 'win32' && normalizedCommand.toLowerCase().endsWith('.cmd')) {
    return {
      spawnCommand: 'cmd.exe',
      spawnArgs: ['/d', '/s', '/c', normalizedCommand, ...args],
    };
  }
  return {
    spawnCommand: normalizedCommand,
    spawnArgs: args,
  };
}

async function fetchWithText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    response,
    text,
    json: parseJsonSafe(text),
  };
}

async function waitFor(checkFn, timeoutMs, intervalMs, description) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await checkFn();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(
    `${description} did not become ready within ${timeoutMs}ms.${
      lastError ? ` Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ''
    }`
  );
}

async function waitForHttpJson(url, timeoutMs, description, predicate = (json) => Boolean(json)) {
  return waitFor(async () => {
    const { response, json } = await fetchWithText(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (predicate(json)) {
      return json;
    }
    return null;
  }, timeoutMs, 1000, description);
}

async function waitForHttpOk(url, timeoutMs, description) {
  return waitFor(async () => {
    const response = await fetch(url);
    return response.ok ? response : null;
  }, timeoutMs, 1000, description);
}

async function waitForServerHealth(timeoutMs) {
  const candidates = [
    'http://localhost:5000/health',
    'http://127.0.0.1:5000/health',
    'http://[::1]:5000/health',
  ];

  return waitFor(async () => {
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const { response, json } = await fetchWithText(candidate);
        if (response.ok && json?.ok === true) {
          return { url: candidate, body: json };
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) {
      throw lastError;
    }
    return null;
  }, timeoutMs, 1000, 'backend health endpoint');
}

async function apiRequest(baseUrl, pathName, { method = 'GET', headers = {}, body, token } = {}) {
  const nextHeaders = new Headers(headers);
  if (token) {
    nextHeaders.set('Authorization', `Bearer ${token}`);
  }
  let payload = body;
  if (body && !(body instanceof FormData)) {
    if (!nextHeaders.has('Content-Type')) {
      nextHeaders.set('Content-Type', 'application/json');
    }
    if (typeof body !== 'string') {
      payload = JSON.stringify(body);
    }
  }

  const { response, text, json } = await fetchWithText(`${baseUrl}${pathName}`, {
    method,
    headers: nextHeaders,
    body: payload,
  });

  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    data: json ?? text,
    rawText: text,
  };
}

function getChromeExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => safeString(candidate));
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id) {
        const pending = this.pending.get(payload.id);
        if (!pending) return;
        this.pending.delete(payload.id);
        if (payload.error) {
          pending.reject(new Error(payload.error.message || 'CDP command failed'));
          return;
        }
        pending.resolve(payload.result);
        return;
      }
      if (payload.method) {
        const handlers = this.listeners.get(payload.method) || [];
        for (const handler of handlers) {
          try {
            handler(payload.params || {});
          } catch {}
        }
      }
    });
    ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('CDP websocket closed'));
      }
      this.pending.clear();
    });
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) || [];
    handlers.push(handler);
    this.listeners.set(method, handlers);
    return () => {
      const current = this.listeners.get(method) || [];
      this.listeners.set(
        method,
        current.filter((item) => item !== handler)
      );
    };
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
    }
    return result.result?.value;
  }
}

async function launchBrowser(frontendBaseUrl) {
  const browserPort = 9333 + Math.floor(Math.random() * 200);
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zdt-smoke-browser-'));
  const browserOut = path.join(LOG_DIR, 'browser.out.log');
  const browserErr = path.join(LOG_DIR, 'browser.err.log');
  const chromePath =
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-running-insecure-content',
      '--disable-background-networking',
      `--remote-debugging-port=${browserPort}`,
      `--user-data-dir=${userDataDir}`,
      `${frontendBaseUrl}/`,
    ],
    {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    }
  );

  proc.stdout.on('data', (chunk) => {
    void appendLog(browserOut, chunk.toString());
  });
  proc.stderr.on('data', (chunk) => {
    void appendLog(browserErr, chunk.toString());
  });

  const targetList = await waitForHttpJson(
    `http://127.0.0.1:${browserPort}/json/list`,
    20_000,
    'browser debug target'
  );
  const pageTarget = Array.isArray(targetList)
    ? targetList.find((item) => item?.type === 'page' && item.webSocketDebuggerUrl)
    : null;

  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('Unable to find a browser page target for CDP.');
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const client = new CdpClient(ws);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Network.enable');

  return {
    browserPort,
    userDataDir,
    proc,
    ws,
    client,
  };
}

function waitForCdpEvent(client, method, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const off = client.on(method, (params) => {
      clearTimeout(timer);
      off();
      resolve(params);
    });
  });
}

async function navigateAndInspect(client, frontendBaseUrl, pathName, waitMs = 3000) {
  const events = {
    consoleErrors: [],
    exceptions: [],
    logErrors: [],
    httpErrors: [],
    networkFailures: [],
  };

  const offConsole = client.on('Runtime.consoleAPICalled', (params) => {
    const type = safeString(params.type);
    const text = (params.args || [])
      .map((arg) => arg.value ?? arg.description ?? '')
      .map((item) => safeString(item))
      .join(' ')
      .trim();
    if (type === 'error' || type === 'assert') {
      events.consoleErrors.push(text);
    }
  });
  const offException = client.on('Runtime.exceptionThrown', (params) => {
    events.exceptions.push(safeString(params.exceptionDetails?.text || 'Unhandled exception'));
  });
  const offLog = client.on('Log.entryAdded', (params) => {
    const level = safeString(params.entry?.level).toLowerCase();
    if (level === 'error') {
      events.logErrors.push(safeString(params.entry?.text || ''));
    }
  });
  const offHttpError = client.on('Network.responseReceived', (params) => {
    const status = Number(params.response?.status || 0);
    if (status >= 400) {
      events.httpErrors.push({
        status,
        url: safeString(params.response?.url || ''),
      });
    }
  });
  const offNetwork = client.on('Network.loadingFailed', (params) => {
    events.networkFailures.push(
      `${safeString(params.type)} ${safeString(params.errorText)} ${safeString(params.canceled)}`
    );
  });

  try {
    const loadEventPromise = waitForCdpEvent(client, 'Page.loadEventFired');
    await client.send('Page.navigate', { url: `${frontendBaseUrl}${pathName}` });
    await loadEventPromise;
    await delay(waitMs);
    const info = await client.evaluate(`(() => ({
      title: document.title,
      path: location.pathname,
      bodySnippet: document.body?.innerText?.replace(/\\s+/g, ' ').trim().slice(0, 600) || '',
      propertyLinkCount: document.querySelectorAll('a[href^="/buy/"], a[href^="/buy-details/"]').length,
      alertText: document.querySelector('[role="alert"]')?.textContent?.trim() || '',
      statusText: document.querySelector('[role="status"]')?.textContent?.trim() || ''
    }))()`);
    return { info, events };
  } finally {
    offConsole();
    offException();
    offLog();
    offHttpError();
    offNetwork();
  }
}

function isBenignHttpError(entry) {
  const status = Number(entry?.status || 0);
  const url = safeString(entry?.url || '');
  return (
    status === 401 &&
    (url.includes('/api/v1/auth/me') || url.endsWith('/auth/me'))
  );
}

function isBenignNetworkFailure(entry) {
  const text = safeString(entry);
  return text.includes('Document net::ERR_ABORTED true');
}

async function setSession(client, token, user) {
  await client.evaluate(`(() => {
    sessionStorage.setItem('authToken', ${JSON.stringify(token)});
    sessionStorage.setItem('authUser', ${JSON.stringify(JSON.stringify(user))});
    if (!localStorage.getItem('deviceId')) {
      localStorage.setItem('deviceId', 'web-smoke-session');
    }
    return true;
  })()`);
}

async function clearSession(client) {
  await client.evaluate(`(() => {
    sessionStorage.clear();
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    return true;
  })()`);
}

async function waitForCondition(client, expression, timeoutMs = 15_000, intervalMs = 300) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await client.evaluate(expression);
    if (result) return result;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for condition: ${expression}`);
}

async function fillInput(client, selector, value) {
  const result = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, reason: 'not_found' };
    const setter = Object.getOwnPropertyDescriptor(
      element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    if (!setter) return { ok: false, reason: 'no_setter' };
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  if (!result?.ok) {
    throw new Error(`Unable to fill selector ${selector}: ${result?.reason || 'unknown'}`);
  }
}

async function clickTextButton(client, text) {
  const result = await client.evaluate(`(() => {
    const target = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)}
    );
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!result) {
    throw new Error(`Button not found: ${text}`);
  }
}

async function runOwnerUiCreate(client, frontendBaseUrl, token, user, imageUrl, listingTitle) {
  await navigateAndInspect(client, frontendBaseUrl, '/', 1000);
  await setSession(client, token, user);

  const pageState = {
    addPage: null,
    result: null,
    errors: [],
  };

  try {
    pageState.addPage = await navigateAndInspect(client, frontendBaseUrl, '/owner/add-property', 4000);

    await waitForCondition(
      client,
      `document.body?.innerText?.includes('Add a new listing') || document.body?.innerText?.includes('Owner Listing Studio')`
    );

    await fillInput(client, 'input[placeholder="Spacious 3BHK with skyline view"]', listingTitle);
    await fillInput(
      client,
      'textarea[placeholder="Highlight amenities, layout, and special selling points."]',
      'Automated UI smoke test listing created after deployment.'
    );
    await fillInput(client, 'input[placeholder="3"]', '2');
    await fillInput(client, 'input[placeholder="1450"]', '950');
    await fillInput(client, 'input[placeholder="1050"]', '820');
    await fillInput(client, 'input[placeholder="East"]', 'East');
    await fillInput(client, 'input[placeholder="12"]', '5');
    await fillInput(client, 'input[placeholder="24"]', '12');
    await clickTextButton(client, 'Continue');

    await waitForCondition(client, `document.body?.innerText?.includes('Location')`);
    await fillInput(client, 'input[placeholder="Maharashtra"]', 'Maharashtra');
    await fillInput(client, 'input[placeholder="Mumbai"]', 'Mumbai');
    await fillInput(client, 'input[placeholder="Bandra West"]', 'Bandra West');
    await fillInput(client, 'input[placeholder="400050"]', '400050');
    await fillInput(client, 'textarea[placeholder="Street, building, landmark"]', 'Smoke Test Address, Bandra West, Mumbai');
    await fillInput(client, 'input[placeholder="19.0760"]', '19.0596');
    await fillInput(client, 'input[placeholder="72.8777"]', '72.8295');
    await clickTextButton(client, 'Continue');

    await waitForCondition(client, `document.body?.innerText?.includes('Pricing')`);
    await fillInput(client, 'input[placeholder="1,25,00,000"]', '18500000');
    await fillInput(client, 'input[placeholder="8500"]', '19474');
    await fillInput(client, 'input[placeholder="RERA-12345"]', `SMOKE-${Date.now()}`);
    await clickTextButton(client, 'Continue');

    await waitForCondition(client, `document.body?.innerText?.includes('Amenities')`);
    await clickTextButton(client, 'Continue');

    await waitForCondition(client, `document.body?.innerText?.includes('Media')`);
    await fillInput(client, 'textarea[placeholder="https://.../image1.jpg, https://.../image2.jpg"]', imageUrl);
    await clickTextButton(client, 'Continue');

    await waitForCondition(client, `document.body?.innerText?.includes('Preview')`);
    await clickTextButton(client, 'Publish Listing');

    await waitForCondition(client, `location.pathname === '/owner/listings'`, 20_000, 400);
    await delay(3000);

    pageState.result = await client.evaluate(`(() => ({
      path: location.pathname,
      bodySnippet: document.body?.innerText?.replace(/\\s+/g, ' ').trim().slice(0, 1000) || '',
      containsListing: document.body?.innerText?.includes(${JSON.stringify(listingTitle)}) || false,
      alertText: document.querySelector('[role="alert"]')?.textContent?.trim() || '',
      statusText: document.querySelector('[role="status"]')?.textContent?.trim() || ''
    }))()`);
  } catch (error) {
    pageState.errors.push(error instanceof Error ? error.message : String(error));
  }

  return pageState;
}

async function closeBrowser(handle) {
  if (!handle) return;
  try {
    handle.ws?.close();
  } catch {}
  try {
    handle.proc?.kill('SIGTERM');
  } catch {}
}

const report = {
  startedAt: nowIso(),
  root: ROOT,
  steps: {},
  browser: {},
  auth: {},
  backend: {},
  cleanup: {},
  failures: [],
};

let serverHandle = null;
let previewHandle = null;
let browserHandle = null;

try {
  report.steps.frontendBuild = { startedAt: nowIso() };
  const buildResult = await runCommand('app-build', 'npm.cmd', ['run', 'build'], APP_DIR, 300_000);
  report.steps.frontendBuild = {
    ok: true,
    startedAt: report.steps.frontendBuild.startedAt,
    finishedAt: nowIso(),
    stdoutTail: truncate(buildResult.stdout, 3500),
    stderrTail: truncate(buildResult.stderr, 2000),
  };

  report.steps.serverStart = { startedAt: nowIso() };
  serverHandle = createLongRunningProcess('server', 'npm.cmd', ['start'], SERVER_DIR);
  const health = await waitForServerHealth(180_000);
  report.steps.serverStart = {
    ok: true,
    startedAt: report.steps.serverStart.startedAt,
    finishedAt: nowIso(),
    health,
  };

  report.steps.seedOwnerPanel = { startedAt: nowIso() };
  const seedOwnerPanel = await runCommand(
    'seed-owner-panel',
    'npm.cmd',
    ['run', 'seed:owner-panel'],
    SERVER_DIR,
    180_000
  );
  report.steps.seedOwnerPanel = {
    ok: true,
    startedAt: report.steps.seedOwnerPanel.startedAt,
    finishedAt: nowIso(),
    stdoutTail: truncate(seedOwnerPanel.stdout, 3000),
    stderrTail: truncate(seedOwnerPanel.stderr, 2000),
  };

  report.steps.previewStart = { startedAt: nowIso() };
  previewHandle = createLongRunningProcess('app-preview', 'npm.cmd', ['run', 'preview'], APP_DIR);
  await waitForHttpOk('http://localhost:4173', 60_000, 'frontend preview');
  report.steps.previewStart = {
    ok: true,
    startedAt: report.steps.previewStart.startedAt,
    finishedAt: nowIso(),
    url: 'http://localhost:4173',
  };

  const apiBase = 'http://localhost:5000/api/v1';
  const frontendBase = 'http://localhost:4173';
  const uniqueId = Date.now();
  const legacyUserEmail = `smoke_${uniqueId}@example.com`;
  const legacyPassword = 'SmokeTest@1234';

  report.auth.legacyRegister = await apiRequest(apiBase, '/auth/register', {
    method: 'POST',
    body: {
      name: 'Smoke Test User',
      email: legacyUserEmail,
      phone: '9876543210',
      password: legacyPassword,
      deviceId: `smoke-device-${uniqueId}`,
    },
  });

  report.auth.legacyLogin = await apiRequest(apiBase, '/auth/login', {
    method: 'POST',
    body: {
      email: legacyUserEmail,
      password: legacyPassword,
    },
  });
  const legacyToken = report.auth.legacyLogin.data?.token || '';
  report.auth.legacyMe = legacyToken
    ? await apiRequest(apiBase, '/auth/me', { token: legacyToken })
    : null;
  report.auth.seededUserLogin = await apiRequest(apiBase, '/auth/login', {
    method: 'POST',
    body: {
      email: 'renter.demo@zdtrealty.local',
      password: 'User@12345',
    },
  });
  const seededUserToken = report.auth.seededUserLogin.data?.token || '';
  report.auth.seededUserMe = seededUserToken
    ? await apiRequest(apiBase, '/auth/me', { token: seededUserToken })
    : null;

  report.backend.ownerLogin = await apiRequest(apiBase, '/auth/login', {
    method: 'POST',
    body: {
      email: 'owner.demo@zdtrealty.local',
      password: 'Owner@12345',
    },
  });
  const ownerToken = report.backend.ownerLogin.data?.token || '';
  report.backend.ownerMe = ownerToken
    ? await apiRequest(apiBase, '/auth/me', { token: ownerToken })
    : null;
  report.backend.publicProperties = await apiRequest(apiBase, '/properties?listingType=sale');
  report.backend.ownerPropertiesBefore = ownerToken
    ? await apiRequest(apiBase, '/owner/properties', { token: ownerToken })
    : null;

  if (ownerToken) {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yF9sAAAAASUVORK5CYII=';
    const bytes = Buffer.from(pngBase64, 'base64');
    const blob = new Blob([bytes], { type: 'image/png' });
    const form = new FormData();
    form.append('purpose', 'realty_property');
    form.append('file', blob, 'smoke-test.png');
    report.backend.imageUpload = await apiRequest(apiBase, '/auth/media/upload-image', {
      method: 'POST',
      body: form,
      token: ownerToken,
    });
  }

  const ownerUser = report.backend.ownerMe?.data?.user || null;
  const uploadedImageUrl = report.backend.imageUpload?.data?.imageUrl || '';
  const uiListingTitle = `UI Smoke Listing ${uniqueId}`;

  if (ownerToken && ownerUser && uploadedImageUrl) {
    browserHandle = await launchBrowser(frontendBase);
    report.browser.ownerCreateFlow = await runOwnerUiCreate(
      browserHandle.client,
      frontendBase,
      ownerToken,
      ownerUser,
      uploadedImageUrl,
      uiListingTitle
    );
    await closeBrowser(browserHandle);
    browserHandle = null;
  } else {
    report.browser.ownerCreateFlow = {
      skipped: true,
      reason: 'Missing owner token, owner user, or uploaded image URL.',
    };
  }

  browserHandle = await launchBrowser(frontendBase);
  report.browser.home = await navigateAndInspect(browserHandle.client, frontendBase, '/', 4000);
  report.browser.buy = await navigateAndInspect(browserHandle.client, frontendBase, '/buy', 5000);
  report.browser.login = await navigateAndInspect(browserHandle.client, frontendBase, '/login', 3000);
  report.browser.register = await navigateAndInspect(browserHandle.client, frontendBase, '/register', 3000);

  report.backend.ownerPropertiesAfter = ownerToken
    ? await apiRequest(apiBase, '/owner/properties', { token: ownerToken })
    : null;

  const ownerPropertiesAfter = report.backend.ownerPropertiesAfter?.data?.properties || [];
  const createdProperty = Array.isArray(ownerPropertiesAfter)
    ? ownerPropertiesAfter.find((property) => property?.title === uiListingTitle)
    : null;
  report.backend.uiCreatedProperty = createdProperty || null;

  if (createdProperty?.id && ownerToken) {
    report.cleanup.deleteCreatedProperty = await apiRequest(
      apiBase,
      `/owner/properties/${createdProperty.id}`,
      {
        method: 'DELETE',
        token: ownerToken,
      }
    );
  }

  const browserErrors = [];
  for (const [pageName, pageResult] of Object.entries(report.browser)) {
    const events = pageResult?.events;
    if (!events) continue;
    const pageIssues = [
      ...(events.consoleErrors || []),
      ...(events.exceptions || []),
      ...((events.httpErrors || []).filter((entry) => !isBenignHttpError(entry)).map((entry) => `${entry.status} ${entry.url}`)),
      ...((events.networkFailures || []).filter((entry) => !isBenignNetworkFailure(entry))),
    ].filter(Boolean);
    if (pageIssues.length > 0) {
      browserErrors.push({ pageName, issues: pageIssues });
    }
  }

  if (!report.auth.legacyRegister?.ok) {
    report.failures.push('Legacy signup API failed.');
  }
  if (
    (!report.auth.legacyLogin?.ok || !legacyToken) &&
    (!report.auth.seededUserLogin?.ok || !seededUserToken)
  ) {
    report.failures.push('User login API failed.');
  }
  if (!report.backend.publicProperties?.ok) {
    report.failures.push('Public properties API fetch failed.');
  }
  if (!report.backend.imageUpload?.ok) {
    report.failures.push('Image upload failed.');
  }
  if (!createdProperty?.id) {
    report.failures.push('Owner UI property creation did not produce a visible listing.');
  }
  if (browserErrors.length > 0) {
    report.failures.push('Browser console/runtime issues were detected.');
  }

  report.summary = {
    frontendLoads:
      report.browser.home?.info?.path === '/' &&
      report.browser.login?.info?.path === '/login' &&
      report.browser.register?.info?.path === '/register',
    signupWorks: Boolean(report.auth.legacyRegister?.ok),
    loginWorks: Boolean(
      (report.auth.legacyLogin?.ok && legacyToken) ||
        (report.auth.seededUserLogin?.ok && seededUserToken)
    ),
    propertiesFetched: Boolean(
      report.backend.publicProperties?.ok &&
        Array.isArray(report.backend.publicProperties?.data?.properties) &&
        report.backend.publicProperties.data.properties.length > 0
    ),
    propertyCreationWorks: Boolean(createdProperty?.id),
    imageUploadWorks: Boolean(report.backend.imageUpload?.ok),
    consoleClean: report.failures.every((item) => item !== 'Browser console/runtime issues were detected.'),
    browserErrors,
  };
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : String(error));
} finally {
  report.finishedAt = nowIso();
  try {
    if (browserHandle?.ws) {
      try {
        browserHandle.ws.close();
      } catch {}
    }
    if (browserHandle?.proc) {
      try {
        browserHandle.proc.kill('SIGTERM');
      } catch {}
    }
  } catch {}
  await stopProcess(previewHandle);
  await stopProcess(serverHandle);
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
