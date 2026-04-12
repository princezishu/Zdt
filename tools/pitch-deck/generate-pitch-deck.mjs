import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import PptxGenJS from 'pptxgenjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const ASSETS_DIR = path.join(DOCS_DIR, 'pitch-assets');
const SCREENSHOT_DIR = path.join(ASSETS_DIR, 'screenshots');
const OUTPUT_FILE = path.join(DOCS_DIR, 'ZDT-Realty-Founding-Round-Pitch.pptx');
const COVER_LOGO_PATH = path.join(ROOT_DIR, 'app', 'public', 'images', 'logo-wordmark-light.png');
const DIST_DIR = path.join(ROOT_DIR, 'app', 'dist');
const SHAPE = new PptxGenJS().ShapeType;

const API_URL = process.env.API_URL || 'http://127.0.0.1:5000/api/v1';

const OWNER_EMAIL = process.env.OWNER_DEMO_EMAIL || 'owner.demo@zdtrealty.local';
const OWNER_PASSWORD = process.env.OWNER_DEMO_PASSWORD || 'Owner@12345';

const PUBLIC_PAGES = [
  {
    key: 'home',
    path: '/',
    waitFor: 'main',
    fileName: '01-home.png',
  },
  {
    key: 'buy',
    path: '/buy',
    waitFor: 'h1:has-text("Buy Verified Properties with Confidence")',
    fileName: '02-buy-marketplace.png',
  },
  {
    key: 'infrastructure',
    path: '/infrastructure',
    waitFor: 'h1:has-text("Infrastructure and Development Tracker")',
    fileName: '03-infrastructure-tracker.png',
  },
  {
    key: 'insights-market',
    path: '/insights/market',
    waitFor: 'h1:has-text("Market Price Tracker")',
    fileName: '04-insights-market.png',
  },
  {
    key: 'e-auction',
    path: '/e-auction',
    waitFor: 'h1:has-text("Government & Bank E-Auction Properties")',
    fileName: '05-eauction.png',
  },
  {
    key: 'group-deals',
    path: '/group-deals',
    waitFor: 'h1:has-text("Group Purchase Deals")',
    fileName: '06-group-deals.png',
  },
  {
    key: 'dealers-builders',
    path: '/dealers-builders',
    waitFor: 'h1',
    fileName: '07-dealers-builders.png',
  },
];

const COLORS = {
  navy: '0B1F44',
  navyDeep: '08172F',
  navySoft: '163766',
  blue: '2563EB',
  blueSoft: 'DBEAFE',
  cyan: '06B6D4',
  slate: '0F172A',
  slateSoft: '344054',
  text: '1D2939',
  muted: '667085',
  line: 'D0D5DD',
  paper: 'F4F7FB',
  white: 'FFFFFF',
  cloud: 'F8FAFC',
  mint: 'ECFDF3',
  amber: 'FFF7ED',
};

function addBaseSlide(slide, { dark = false } = {}) {
  slide.background = { color: dark ? COLORS.navyDeep : COLORS.paper };

  if (dark) {
    slide.addShape(SHAPE.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.18,
      fill: { color: COLORS.cyan },
      line: { color: COLORS.cyan, transparency: 100 },
    });
    slide.addShape(SHAPE.rect, {
      x: 9.9,
      y: 0,
      w: 3.433,
      h: 7.5,
      fill: { color: COLORS.blue, transparency: 86 },
      line: { color: COLORS.blue, transparency: 100 },
    });
  } else {
    slide.addShape(SHAPE.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.14,
      fill: { color: COLORS.blue },
      line: { color: COLORS.blue, transparency: 100 },
    });
  }
}

function addBrandBadge(slide, { x = 0.55, y = 0.32, dark = false, text = 'FOUNDING ROUND' } = {}) {
  const fillColor = dark ? COLORS.white : COLORS.blueSoft;
  const textColor = dark ? COLORS.navyDeep : COLORS.blue;
  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w: 1.85,
    h: 0.28,
    rectRadius: 0.04,
    fill: { color: fillColor, transparency: dark ? 88 : 0 },
    line: { color: fillColor, transparency: dark ? 100 : 0 },
  });
  slide.addText(text, {
    x: x + 0.08,
    y: y + 0.04,
    w: 1.68,
    h: 0.16,
    fontFace: 'Aptos',
    fontSize: 8.5,
    bold: true,
    align: 'center',
    color: textColor,
  });
}

function addDeckFooter(slide, { dark = false } = {}) {
  const footerColor = dark ? 'CBD5E1' : COLORS.muted;
  slide.addText('ZDT Realty', {
    x: 0.52,
    y: 7.12,
    w: 1.5,
    h: 0.18,
    fontFace: 'Aptos',
    fontSize: 8.5,
    bold: true,
    color: footerColor,
  });
  slide.addText('Founding-round deck | live product screenshots', {
    x: 9.4,
    y: 7.12,
    w: 3.45,
    h: 0.18,
    fontFace: 'Aptos',
    fontSize: 8.5,
    align: 'right',
    color: footerColor,
  });
}

function addTitleBlock(slide, { title, subtitle, x = 0.55, y = 0.72, w = 7.6, dark = false }) {
  slide.addText(title, {
    x,
    y,
    w,
    h: 0.55,
    fontFace: 'Aptos Display',
    bold: true,
    fontSize: 26,
    color: dark ? COLORS.white : COLORS.slate,
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x,
      y: y + 0.52,
      w: 11.7,
      h: 0.42,
      fontFace: 'Aptos',
      fontSize: 12,
      color: dark ? 'D0D5DD' : COLORS.slateSoft,
    });
  }
}

function addCard(slide, { x, y, w, h, fill = COLORS.white, line = COLORS.line, radius = 0.08 }) {
  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: radius,
    fill: { color: fill },
    line: { color: line },
  });
}

function addFeatureCard(
  slide,
  {
    x,
    y,
    w,
    h,
    title,
    body,
    accent = COLORS.blue,
    dark = false,
    titleFontSize = 16,
    bodyFontSize = 11.5,
  }
) {
  addCard(slide, {
    x,
    y,
    w,
    h,
    fill: dark ? COLORS.navy : COLORS.white,
    line: dark ? COLORS.navySoft : COLORS.line,
  });

  const isCompact = h <= 0.8;
  const isMedium = h > 0.8 && h <= 1.3;
  const accentTopInset = isCompact ? 0.12 : isMedium ? 0.14 : 0.18;
  const accentHeight = Math.max(0.24, h - accentTopInset * 2);
  const titleTop = y + (isCompact ? 0.14 : isMedium ? 0.18 : 0.22);
  const titleHeight = isCompact ? 0.16 : isMedium ? 0.2 : 0.4;
  const bodyTop = y + (isCompact ? 0.34 : isMedium ? 0.42 : 0.66);
  const bodyHeight = Math.max(0.16, h - (isCompact ? 0.42 : isMedium ? 0.56 : 0.86));
  const resolvedTitleFontSize = isCompact ? Math.min(titleFontSize, 12.5) : isMedium ? Math.min(titleFontSize, 15) : titleFontSize;
  const resolvedBodyFontSize = isCompact ? Math.min(bodyFontSize, 8.8) : isMedium ? Math.min(bodyFontSize, 10.2) : bodyFontSize;

  slide.addShape(SHAPE.roundRect, {
    x: x + 0.16,
    y: y + accentTopInset,
    w: 0.08,
    h: accentHeight,
    rectRadius: 0.02,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
  });

  slide.addText(title, {
    x: x + 0.36,
    y: titleTop,
    w: w - 0.54,
    h: titleHeight,
    fontFace: 'Aptos Display',
    bold: true,
    fontSize: resolvedTitleFontSize,
    color: dark ? COLORS.white : COLORS.slate,
    fit: 'shrink',
    margin: 0,
  });

  slide.addText(body, {
    x: x + 0.36,
    y: bodyTop,
    w: w - 0.54,
    h: bodyHeight,
    fontFace: 'Aptos',
    fontSize: resolvedBodyFontSize,
    color: dark ? 'D0D5DD' : COLORS.slateSoft,
    valign: 'top',
    margin: 0,
    fit: 'shrink',
  });
}

function addImagePanel(slide, {
  x,
  y,
  w,
  h,
  path: imagePath,
  tag,
  title,
  caption,
  dark = false,
  imageHeight = null,
}) {
  addCard(slide, {
    x,
    y,
    w,
    h,
    fill: dark ? COLORS.navy : COLORS.white,
    line: dark ? COLORS.navySoft : COLORS.line,
  });

  if (tag) {
    slide.addShape(SHAPE.roundRect, {
      x: x + 0.18,
      y: y + 0.16,
      w: 1.1,
      h: 0.24,
      rectRadius: 0.03,
      fill: { color: dark ? COLORS.blue : COLORS.blueSoft },
      line: { color: dark ? COLORS.blue : COLORS.blueSoft, transparency: 100 },
    });
    slide.addText(tag, {
      x: x + 0.24,
      y: y + 0.2,
      w: 0.98,
      h: 0.12,
      fontFace: 'Aptos',
      fontSize: 8.5,
      bold: true,
      align: 'center',
      color: dark ? COLORS.white : COLORS.blue,
    });
  }

  if (title) {
    slide.addText(title, {
      x: x + 0.2,
      y: y + 0.46,
      w: w - 0.4,
      h: 0.26,
      fontFace: 'Aptos Display',
      bold: true,
      fontSize: 13.5,
      color: dark ? COLORS.white : COLORS.slate,
    });
  }

  const actualImageHeight = imageHeight || (title ? h - 1.0 : h - 0.55);
  const imageY = title ? y + 0.82 : y + 0.18;
  slide.addImage({
    path: imagePath,
    x: x + 0.18,
    y: imageY,
    w: w - 0.36,
    h: actualImageHeight,
  });

  if (caption) {
    slide.addText(caption, {
      x: x + 0.2,
      y: y + h - 0.24,
      w: w - 0.4,
      h: 0.14,
      fontFace: 'Aptos',
      fontSize: 9.5,
      bold: true,
      color: dark ? 'CBD5E1' : COLORS.slateSoft,
    });
  }
}

function addBulletList(slide, items, options) {
  const { x, y, w, h, fontSize = 15, color = COLORS.text } = options;
  const runs = [];
  for (const item of items) {
    runs.push({
      text: item,
      options: {
        bullet: { indent: 14 },
        breakLine: true,
      },
    });
  }

  slide.addText(runs, {
    x,
    y,
    w,
    h,
    fontFace: 'Aptos',
    fontSize,
    color,
    paraSpaceAfterPt: 8,
    margin: 0,
    valign: 'top',
  });
}

function addTakeawayBand(slide, text, { dark = false, y = 6.58 } = {}) {
  slide.addShape(SHAPE.roundRect, {
    x: 0.55,
    y,
    w: 12.23,
    h: 0.45,
    rectRadius: 0.04,
    fill: { color: dark ? COLORS.navySoft : COLORS.blueSoft },
    line: { color: dark ? COLORS.navySoft : COLORS.blueSoft, transparency: 100 },
  });
  slide.addText(text, {
    x: 0.8,
    y: y + 0.11,
    w: 11.7,
    h: 0.18,
    fontFace: 'Aptos',
    fontSize: 11,
    bold: true,
    align: 'center',
    color: dark ? COLORS.white : COLORS.blue,
  });
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function contentTypeFor(extname) {
  if (extname === '.html') return 'text/html; charset=utf-8';
  if (extname === '.js') return 'text/javascript; charset=utf-8';
  if (extname === '.css') return 'text/css; charset=utf-8';
  if (extname === '.json') return 'application/json; charset=utf-8';
  if (extname === '.svg') return 'image/svg+xml';
  if (extname === '.png') return 'image/png';
  if (extname === '.jpg' || extname === '.jpeg') return 'image/jpeg';
  if (extname === '.webp') return 'image/webp';
  if (extname === '.ico') return 'image/x-icon';
  if (extname === '.xml') return 'application/xml; charset=utf-8';
  if (extname === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

async function startStaticPreviewServer() {
  if (!existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error(`Build output not found at ${DIST_DIR}. Run the frontend build first.`);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const sanitizedPath = decodeURIComponent(requestUrl.pathname);
      const relativePath = sanitizedPath === '/' ? 'index.html' : sanitizedPath.replace(/^[/\\]+/, '');
      const normalizedPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      let filePath = path.join(DIST_DIR, normalizedPath);

      if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let body;
      try {
        body = await fs.readFile(filePath);
      } catch {
        filePath = path.join(DIST_DIR, 'index.html');
        body = await fs.readFile(filePath);
      }

      res.writeHead(200, {
        'Content-Type': contentTypeFor(path.extname(filePath).toLowerCase()),
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.message : 'Internal server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine preview server address.');
  }

  return {
    server,
    appUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function waitForStablePage(page, selector) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch {
    // Some pages continue background requests; the explicit selector wait below is enough.
  }
  if (selector) {
    await page.waitForSelector(selector, { timeout: 20000 });
  }
  await page.waitForTimeout(1500);
}

async function capturePublicScreenshots(browser, appUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
  });
  const page = await context.newPage();
  const results = {};

  for (const entry of PUBLIC_PAGES) {
    const outputPath = path.join(SCREENSHOT_DIR, entry.fileName);
    await page.goto(`${appUrl}${entry.path}`, { waitUntil: 'domcontentloaded' });
    await waitForStablePage(page, entry.waitFor);
    await page.screenshot({ path: outputPath, fullPage: false });
    results[entry.key] = outputPath;
  }

  await context.close();
  return results;
}

async function loginViaApi({ email, password }) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': `pitch-deck-${Date.now()}`,
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload.error === 'string' ? payload.error : `Login failed (${response.status})`;
    throw new Error(message);
  }
  if (!payload.token || !payload.user) {
    throw new Error('Login succeeded but token or user payload is missing.');
  }
  return payload;
}

async function captureOwnerDashboard(browser, appUrl) {
  const session = await loginViaApi({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });

  const outputPath = path.join(SCREENSHOT_DIR, '08-owner-dashboard.png');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
  });

  await context.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem('authToken', token);
      window.localStorage.setItem('authUser', JSON.stringify(user));
    },
    {
      token: session.token,
      user: session.user,
    }
  );

  const page = await context.newPage();
  await page.goto(`${appUrl}/owner/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForStablePage(page, 'h1:has-text("Track, monetize, and scale your listings.")');
  await page.screenshot({ path: outputPath, fullPage: false });
  await context.close();
  return outputPath;
}

function buildDeck(images) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'OpenAI Codex';
  pptx.company = 'ZDT Realty';
  pptx.subject = 'Founding round pitch deck';
  pptx.title = 'ZDT Realty Founding Round Pitch';
  pptx.lang = 'en-IN';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'en-IN',
  };

  const cover = pptx.addSlide();
  addBaseSlide(cover, { dark: true });
  addBrandBadge(cover, { x: 0.58, y: 0.42, dark: true, text: 'FOUNDING ROUND' });
  try {
    cover.addImage({
      path: COVER_LOGO_PATH,
      x: 0.64,
      y: 0.72,
      w: 2.65,
      h: 1.78,
    });
  } catch {
    cover.addText('ZDT Realty', {
      x: 0.58,
      y: 0.92,
      w: 4.5,
      h: 0.55,
      fontFace: 'Aptos Display',
      bold: true,
      fontSize: 30,
      color: COLORS.white,
    });
  }
  cover.addText('Trusted Real Estate Intelligence + Operations Platform', {
    x: 0.58,
    y: 2.1,
    w: 5.9,
    h: 0.44,
    fontFace: 'Aptos',
    fontSize: 18,
    bold: true,
    color: 'D0D5DD',
  });
  cover.addText(
    'A multi-sided product for buyers, owners, builders, and operators. This deck uses live product screenshots so the pitch stays concrete and credible.',
    {
      x: 0.58,
      y: 2.62,
      w: 5.5,
      h: 0.82,
      fontFace: 'Aptos',
      fontSize: 13,
      color: 'E4E7EC',
      margin: 0,
    }
  );
  addFeatureCard(cover, {
    x: 0.62,
    y: 4.66,
    w: 2.02,
    h: 1.18,
    title: 'Marketplace',
    body: 'Search, compare, save, message, and convert buyer demand.',
    accent: COLORS.cyan,
    dark: true,
    titleFontSize: 15.5,
    bodyFontSize: 10.5,
  });
  addFeatureCard(cover, {
    x: 2.78,
    y: 4.66,
    w: 2.02,
    h: 1.18,
    title: 'Intelligence',
    body: 'Market pricing, infra signals, and decision-support context.',
    accent: COLORS.blue,
    dark: true,
    titleFontSize: 15.5,
    bodyFontSize: 10.5,
  });
  addFeatureCard(cover, {
    x: 4.94,
    y: 4.66,
    w: 2.02,
    h: 1.18,
    title: 'Operations',
    body: 'Owner tools, builder workflows, approvals, and platform control.',
    accent: COLORS.cyan,
    dark: true,
    titleFontSize: 15.5,
    bodyFontSize: 10.5,
  });
  addImagePanel(cover, {
    x: 7.08,
    y: 0.62,
    w: 5.68,
    h: 3.65,
    path: images.home,
    tag: 'LIVE',
    title: 'Product Surface',
    caption: 'Homepage and feature navigation',
    dark: false,
    imageHeight: 2.55,
  });
  addImagePanel(cover, {
    x: 7.08,
    y: 4.48,
    w: 2.72,
    h: 2.05,
    path: images.buy,
    tag: 'BUY',
    title: 'Consumer',
    caption: 'Marketplace flow',
    dark: false,
    imageHeight: 0.95,
  });
  addImagePanel(cover, {
    x: 10.04,
    y: 4.48,
    w: 2.72,
    h: 2.05,
    path: images['owner-dashboard'],
    tag: 'OWNER',
    title: 'Monetization',
    caption: 'Dashboard layer',
    dark: false,
    imageHeight: 0.95,
  });
  addDeckFooter(cover, { dark: true });

  const problem = pptx.addSlide();
  addBaseSlide(problem);
  addBrandBadge(problem, { text: 'MARKET THESIS' });
  addTitleBlock(problem, {
    title: 'Real estate discovery is fragmented. ZDT connects the whole workflow.',
    subtitle: 'The product thesis is simple: users do not only need listings. They need decision support, trust, and operating tools around the listing.',
  });
  addFeatureCard(problem, {
    x: 0.58,
    y: 1.72,
    w: 3.05,
    h: 3.98,
    title: 'Buyer problem',
    body: 'Users jump between property portals, infrastructure news, market trends, and trust checks before they feel confident enough to act.',
    accent: COLORS.blue,
  });
  addFeatureCard(problem, {
    x: 3.84,
    y: 1.72,
    w: 3.05,
    h: 3.98,
    title: 'Owner / builder problem',
    body: 'Supply-side users need lead flow, analytics, promotions, approvals, and workspace tools after a listing is live.',
    accent: COLORS.cyan,
  });
  addFeatureCard(problem, {
    x: 7.1,
    y: 1.72,
    w: 2.86,
    h: 3.98,
    title: 'What ZDT adds',
    body: 'Marketplace, intelligence, trust-led modules, owner monetization, builder tools, and admin governance in one platform.',
    accent: COLORS.blue,
  });
  addFeatureCard(problem, {
    x: 10.16,
    y: 1.72,
    w: 2.6,
    h: 3.98,
    title: 'Positioning',
    body: 'Not another listing portal. A real-estate operating layer for India.',
    accent: COLORS.cyan,
  });
  addTakeawayBand(problem, 'ZDT turns fragmented search, trust, and operations into one connected product stack.');
  addDeckFooter(problem);

  const overview = pptx.addSlide();
  addBaseSlide(overview);
  addBrandBadge(overview, { text: 'PLATFORM OVERVIEW' });
  addTitleBlock(overview, {
    title: 'A modular surface that already looks like a platform, not a single-feature app.',
    subtitle: 'The homepage acts as the product map across marketplace, intelligence, services, and operator workflows.',
  });
  addImagePanel(overview, {
    x: 0.58,
    y: 1.58,
    w: 7.42,
    h: 4.9,
    path: images.home,
    tag: 'HOME',
    title: 'Platform Entry Point',
    caption: 'Homepage: marketplace, intelligence, trust, and operator modules in one surface',
    imageHeight: 3.75,
  });
  addFeatureCard(overview, {
    x: 8.28,
    y: 1.72,
    w: 4.45,
    h: 1.28,
    title: 'Multi-entry navigation',
    body: 'Buy, rent, projects, insights, infrastructure, e-auctions, group deals, and operator modules are accessible from one product shell.',
    accent: COLORS.blue,
  });
  addFeatureCard(overview, {
    x: 8.28,
    y: 3.16,
    w: 4.45,
    h: 1.28,
    title: 'High-impact modules',
    body: 'The product already communicates clear strategic bets: intelligence, trust, B2B tooling, and monetization.',
    accent: COLORS.cyan,
  });
  addFeatureCard(overview, {
    x: 8.28,
    y: 4.6,
    w: 4.45,
    h: 1.28,
    title: 'Demo-ready structure',
    body: 'For interviews and pitches, this gives you a strong story: broad capability with visible product depth.',
    accent: COLORS.blue,
  });
  addDeckFooter(overview);

  const consumer = pptx.addSlide();
  addBaseSlide(consumer);
  addBrandBadge(consumer, { text: 'CONSUMER JOURNEY' });
  addTitleBlock(consumer, {
    title: 'The consumer side is built around conversion, not just browsing.',
    subtitle: 'Buy and rent are structured as full marketplace journeys with decision and action layers.',
  });
  addFeatureCard(consumer, {
    x: 0.6,
    y: 1.68,
    w: 3.45,
    h: 3.96,
    title: 'What the user can do',
    body: 'Search listings, filter inventory, save searches, compare properties, message directly, request callbacks, and schedule site visits.',
    accent: COLORS.blue,
  });
  addFeatureCard(consumer, {
    x: 0.6,
    y: 5.02,
    w: 3.45,
    h: 0.96,
    title: 'Why it matters',
    body: 'This gives ZDT a stronger demand-side engagement and lead-conversion story than a static listing catalog.',
    accent: COLORS.cyan,
  });
  addImagePanel(consumer, {
    x: 4.28,
    y: 1.58,
    w: 8.46,
    h: 4.9,
    path: images.buy,
    tag: 'BUY',
    title: 'Buy Marketplace',
    caption: 'Filters, listing cards, saved-search flow, and user conversion actions',
    imageHeight: 3.76,
  });
  addDeckFooter(consumer);

  const intelligence = pptx.addSlide();
  addBaseSlide(intelligence, { dark: true });
  addBrandBadge(intelligence, { text: 'INTELLIGENCE LAYER', dark: true });
  addTitleBlock(intelligence, {
    title: 'Decision support is one of the clearest product differentiators.',
    subtitle: 'ZDT combines real-estate market data with infrastructure visibility so users do not have to leave the platform to evaluate context.',
    dark: true,
  });
  addImagePanel(intelligence, {
    x: 0.58,
    y: 1.68,
    w: 6.0,
    h: 4.62,
    path: images.infrastructure,
    tag: 'INFRA',
    title: 'Infrastructure Tracker',
    caption: 'Geography, verification level, and alerting controls',
    dark: false,
    imageHeight: 3.42,
  });
  addImagePanel(intelligence, {
    x: 6.76,
    y: 1.68,
    w: 6.0,
    h: 4.62,
    path: images['insights-market'],
    tag: 'MARKET',
    title: 'Market Price Tracker',
    caption: 'Pricing movement, city comparison, and decision-support context',
    dark: false,
    imageHeight: 3.42,
  });
  addTakeawayBand(
    intelligence,
    'The moat is not only inventory. It is the intelligence layer around inventory.',
    { dark: true, y: 6.48 }
  );
  addDeckFooter(intelligence, { dark: true });

  const trust = pptx.addSlide();
  addBaseSlide(trust);
  addBrandBadge(trust, { text: 'TRUST MODULES' });
  addTitleBlock(trust, {
    title: 'ZDT stands out through trust-led discovery modules.',
    subtitle: 'These modules are strong pitch points because they show differentiated product thinking, not just listing replication.',
  });
  addImagePanel(trust, {
    x: 0.58,
    y: 1.62,
    w: 6.0,
    h: 4.42,
    path: images['e-auction'],
    tag: 'TRUST',
    title: 'Government & Bank E-Auctions',
    caption: 'Official-source discovery for high-trust opportunity flows',
    imageHeight: 3.26,
  });
  addImagePanel(trust, {
    x: 6.76,
    y: 1.62,
    w: 6.0,
    h: 4.42,
    path: images['group-deals'],
    tag: 'DEMAND',
    title: 'Group Purchase Deals',
    caption: 'Verified-builder filtering and demand aggregation',
    imageHeight: 3.26,
  });
  addFeatureCard(trust, {
    x: 0.58,
    y: 6.18,
    w: 5.8,
    h: 0.66,
    title: 'Compliance note',
    body: 'ZDT does not conduct auctions. It redirects users to official portals.',
    accent: COLORS.blue,
  });
  addFeatureCard(trust, {
    x: 6.96,
    y: 6.18,
    w: 5.8,
    h: 0.66,
    title: 'Compliance note',
    body: 'ZDT does not collect group booking money. It facilitates qualified buyer-builder connection.',
    accent: COLORS.cyan,
  });
  addDeckFooter(trust);

  const businessEngine = pptx.addSlide();
  addBaseSlide(businessEngine, { dark: true });
  addBrandBadge(businessEngine, { text: 'BUSINESS ENGINE', dark: true });
  addTitleBlock(businessEngine, {
    title: 'The business model works because the product serves both sides of the market.',
    subtitle: 'ZDT is not only a consumer experience. It also acts as software for builders, dealers, and owners.',
    dark: true,
  });
  addImagePanel(businessEngine, {
    x: 0.58,
    y: 1.66,
    w: 6.16,
    h: 4.5,
    path: images['dealers-builders'],
    tag: 'B2B',
    title: 'Builder / Dealer Operating Layer',
    caption: 'Project tools, lead tools, promotions, team access, and trust structure',
    imageHeight: 3.28,
  });
  addImagePanel(businessEngine, {
    x: 6.96,
    y: 1.66,
    w: 5.8,
    h: 4.5,
    path: images['owner-dashboard'],
    tag: 'OWNER',
    title: 'Owner Monetization Layer',
    caption: 'Listings, leads, views, conversion, subscriptions, and boosts',
    imageHeight: 3.28,
  });
  addFeatureCard(businessEngine, {
    x: 0.58,
    y: 6.28,
    w: 3.9,
    h: 0.64,
    title: 'Builder revenue',
    body: 'Company plans, promotions, and later enterprise tooling.',
    accent: COLORS.cyan,
    dark: false,
  });
  addFeatureCard(businessEngine, {
    x: 4.72,
    y: 6.28,
    w: 3.9,
    h: 0.64,
    title: 'Owner revenue',
    body: 'Subscriptions, boosts, and premium visibility.',
    accent: COLORS.blue,
    dark: false,
  });
  addFeatureCard(businessEngine, {
    x: 8.86,
    y: 6.28,
    w: 3.9,
    h: 0.64,
    title: 'Platform upside',
    body: 'Multi-sided monetization with stronger retention loops.',
    accent: COLORS.cyan,
    dark: false,
  });
  addDeckFooter(businessEngine, { dark: true });

  const business = pptx.addSlide();
  addBaseSlide(business);
  addBrandBadge(business, { text: 'CLOSING' });
  addTitleBlock(business, {
    title: 'A stronger way to say it in the interview',
    subtitle: 'The product story is most compelling when it is framed as a trusted operating system, not only as a property portal.',
  });
  addFeatureCard(business, {
    x: 0.58,
    y: 1.7,
    w: 3.95,
    h: 1.18,
    title: 'Revenue layer 1',
    body: 'Owner subscriptions, boosts, and visibility products.',
    accent: COLORS.blue,
  });
  addFeatureCard(business, {
    x: 0.58,
    y: 3.04,
    w: 3.95,
    h: 1.18,
    title: 'Revenue layer 2',
    body: 'Builder and dealer plans, promotional inventory, and B2B workspace tools.',
    accent: COLORS.cyan,
  });
  addFeatureCard(business, {
    x: 0.58,
    y: 4.38,
    w: 3.95,
    h: 1.18,
    title: 'Revenue layer 3',
    body: 'Later enterprise upside through analytics, integrations, and workflow extensions.',
    accent: COLORS.blue,
  });
  addCard(business, {
    x: 4.82,
    y: 1.7,
    w: 7.94,
    h: 3.85,
    fill: COLORS.navy,
    line: COLORS.navy,
  });
  business.addText('Closing line', {
    x: 5.2,
    y: 2.08,
    w: 1.8,
    h: 0.22,
    fontFace: 'Aptos',
    fontSize: 10,
    bold: true,
    color: 'CBD5E1',
  });
  business.addText('ZDT Realty is evolving from a listing portal into a trusted real estate operating system for India.', {
    x: 5.2,
    y: 2.42,
    w: 6.95,
    h: 1.5,
    fontFace: 'Aptos Display',
    bold: true,
    fontSize: 26,
    color: COLORS.white,
    valign: 'mid',
  });
  business.addText(
    'That phrasing is professional, credible, and strong for a founding-round or interview setting because it captures discovery, trust, intelligence, and operations in one sentence.',
    {
      x: 5.2,
      y: 4.25,
      w: 6.9,
      h: 0.8,
      fontFace: 'Aptos',
      fontSize: 13,
      color: 'D0D5DD',
      margin: 0,
    }
  );
  addTakeawayBand(business, 'Pitch angle: not another listing site. A multi-sided real-estate workflow platform.', {
    y: 6.28,
  });
  addDeckFooter(business);

  return pptx;
}

async function main() {
  await ensureDir(SCREENSHOT_DIR);

  const preview = await startStaticPreviewServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const images = await capturePublicScreenshots(browser, preview.appUrl);
    images['owner-dashboard'] = await captureOwnerDashboard(browser, preview.appUrl);

    const pptx = buildDeck(images);
    await pptx.writeFile({ fileName: OUTPUT_FILE });

    console.log(`Screenshots saved to ${SCREENSHOT_DIR}`);
    console.log(`PowerPoint generated at ${OUTPUT_FILE}`);
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      preview.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
