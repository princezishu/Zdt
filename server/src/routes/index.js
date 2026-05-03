import apartmentComplexRoutes from './apartmentComplex.js';
import authRoutes from './auth.js';
import aiAssistantRoutes from './aiAssistant.js';
import aiServicesRoutes from './aiServices.js';
import builderRoutes from './builder.js';
import chatRoutes from './chat.js';
import collaborationsRoutes from './collaborations.js';
import dalalCoinRoutes from './dalalCoin.js';
import eauctionRoutes from './eauction.js';
import groupDealsRoutes from './groupDeals.js';
import healthRoutes from './health.js';
import infraIngestRoutes from './infraIngest.js';
import infraSubscriptionsRoutes from './infraSubscriptions.js';
import infraUpdatesRoutes from './infraUpdates.js';
import insightsRoutes from './insights.js';
import investSignalsRoutes from './investSignals.js';
import layoutUnitsRoutes from './layoutUnits.js';
import locationsRoutes from './locations.js';
import materialsRoutes from './materials.js';
import ownerRoutes from './owner.js';
import promotionsRoutes from './promotions.js';
import realtyRoutes from './realty.js';
import rentalsRoutes from './rentals.js';
import supportRoutes from './support.js';
import tenderIntelligenceRoutes from './tenderIntelligence.js';
import verificationRoutes from './verification.js';
import workflowRoutes from './workflow.js';
import { hardenRouter } from '../utils/hardenRouter.js';

const API_V1_PREFIX_TOKEN = '{apiV1Prefix}';

const routeModules = [
  ['health', healthRoutes],
  ['auth', authRoutes],
  ['workflow', workflowRoutes],
  ['chat', chatRoutes],
  ['eauction', eauctionRoutes],
  ['layoutUnits', layoutUnitsRoutes],
  ['apartmentComplex', apartmentComplexRoutes],
  ['materials', materialsRoutes],
  ['promotions', promotionsRoutes],
  ['aiAssistant', aiAssistantRoutes],
  ['aiServices', aiServicesRoutes],
  ['support', supportRoutes],
  ['insights', insightsRoutes],
  ['realty', realtyRoutes],
  ['rentals', rentalsRoutes],
  ['owner', ownerRoutes],
  ['dalalCoin', dalalCoinRoutes],
  ['locations', locationsRoutes],
  ['infraUpdates', infraUpdatesRoutes],
  ['infraSubscriptions', infraSubscriptionsRoutes],
  ['infraIngest', infraIngestRoutes],
  ['tenderIntelligence', tenderIntelligenceRoutes],
  ['groupDeals', groupDealsRoutes],
  ['investSignals', investSignalsRoutes],
  ['verification', verificationRoutes],
  ['collaborations', collaborationsRoutes],
  ['builder', builderRoutes],
];

const routeMounts = [
  { path: null, limiter: 'none', router: healthRoutes },
  { path: '/auth', limiter: 'authLogin', router: authRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/auth`, limiter: 'authLogin', router: authRoutes },
  { path: '/workflow', limiter: 'globalApi', router: workflowRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/workflow`, limiter: 'globalApi', router: workflowRoutes },
  { path: '/chat', limiter: 'globalApi', router: chatRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/chat`, limiter: 'globalApi', router: chatRoutes },
  { path: '/api/eauction', limiter: 'globalApi', router: eauctionRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/eauction`, limiter: 'globalApi', router: eauctionRoutes },
  { path: '/api', limiter: 'globalApi', router: layoutUnitsRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: layoutUnitsRoutes },
  { path: '/api/apartment-complex', limiter: 'globalApi', router: apartmentComplexRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/apartment-complex`, limiter: 'globalApi', router: apartmentComplexRoutes },
  { path: '/api/materials', limiter: 'globalApi', router: materialsRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/materials`, limiter: 'globalApi', router: materialsRoutes },
  { path: '/api/promotions', limiter: 'globalApi', router: promotionsRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/promotions`, limiter: 'globalApi', router: promotionsRoutes },
  { path: '/api/ai', limiter: 'globalApi', router: aiAssistantRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/ai`, limiter: 'globalApi', router: aiAssistantRoutes },
  { path: '/api/ai-services', limiter: 'globalApi', router: aiServicesRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/ai-services`, limiter: 'globalApi', router: aiServicesRoutes },
  { path: '/api/support', limiter: 'globalApi', router: supportRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/support`, limiter: 'globalApi', router: supportRoutes },
  { path: '/api', limiter: 'globalApi', router: insightsRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: insightsRoutes },
  { path: '/api', limiter: 'globalApi', router: realtyRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: realtyRoutes },
  { path: '/api/rentals', limiter: 'globalApi', router: rentalsRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/rentals`, limiter: 'globalApi', router: rentalsRoutes },
  { path: '/api/owner', limiter: 'globalApi', router: ownerRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/owner`, limiter: 'globalApi', router: ownerRoutes },
  { path: '/api/dalal-coin', limiter: 'globalApi', router: dalalCoinRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/dalal-coin`, limiter: 'globalApi', router: dalalCoinRoutes },
  { path: '/api/dalal-coins', limiter: 'globalApi', router: dalalCoinRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/dalal-coins`, limiter: 'globalApi', router: dalalCoinRoutes },
  { path: '/api', limiter: 'globalApi', router: locationsRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: locationsRoutes },
  { path: '/api', limiter: 'globalApi', router: infraUpdatesRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: infraUpdatesRoutes },
  { path: '/api', limiter: 'globalApi', router: infraSubscriptionsRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: infraSubscriptionsRoutes },
  { path: '/api', limiter: 'globalApi', router: infraIngestRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: infraIngestRoutes },
  { path: '/api', limiter: 'globalApi', router: tenderIntelligenceRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: tenderIntelligenceRoutes },
  { path: '/api', limiter: 'globalApi', router: groupDealsRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: groupDealsRoutes },
  { path: '/api', limiter: 'globalApi', router: investSignalsRoutes },
  { path: API_V1_PREFIX_TOKEN, limiter: 'globalApi', router: investSignalsRoutes },
  { path: '/api/verification', limiter: 'globalApi', router: verificationRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/verification`, limiter: 'globalApi', router: verificationRoutes },
  { path: '/api/collaborations', limiter: 'globalApi', router: collaborationsRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/collaborations`, limiter: 'globalApi', router: collaborationsRoutes },
  { path: '/builder', limiter: 'globalApi', router: builderRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/builder`, limiter: 'globalApi', router: builderRoutes },
  { path: '/realty', limiter: 'globalApi', router: realtyRoutes },
  { path: `${API_V1_PREFIX_TOKEN}/realty`, limiter: 'globalApi', router: realtyRoutes },
];

let routeHandlersHardened = false;

function ensureRouteHandlersHardened() {
  if (routeHandlersHardened) {
    return;
  }

  for (const [label, router] of routeModules) {
    hardenRouter(router, label);
  }

  routeHandlersHardened = true;
}

function resolveRouteMiddlewares(limiter, { authLoginRateLimiter, globalApiRateLimiter }) {
  if (limiter === 'authLogin') {
    return [authLoginRateLimiter];
  }

  if (limiter === 'globalApi') {
    return [globalApiRateLimiter];
  }

  return [];
}

function resolveMountPath(path, apiV1Prefix) {
  if (path === null) {
    return null;
  }

  return path.replaceAll(API_V1_PREFIX_TOKEN, apiV1Prefix);
}

export function registerRoutes(
  app,
  {
    apiV1Prefix,
    authLoginRateLimiter,
    globalApiRateLimiter,
  }
) {
  ensureRouteHandlersHardened();

  for (const routeMount of routeMounts) {
    const mountPath = resolveMountPath(routeMount.path, apiV1Prefix);
    const middlewares = resolveRouteMiddlewares(routeMount.limiter, {
      authLoginRateLimiter,
      globalApiRateLimiter,
    });

    if (mountPath === null) {
      app.use(...middlewares, routeMount.router);
      continue;
    }

    app.use(mountPath, ...middlewares, routeMount.router);
  }
}
