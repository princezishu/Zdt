const ROUTER_HARDENED = Symbol('zdt.router.hardened');
const HANDLER_HARDENED = Symbol('zdt.router.handler.hardened');

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === 'function');
}

function attachRouteLabel(error, label) {
  if (!error || typeof error !== 'object' || !label) {
    return;
  }

  if (!error.routeHandlerLabel) {
    error.routeHandlerLabel = label;
  }
}

function buildRouteLabel(baseLabel, layer) {
  const parts = [String(baseLabel || 'router').trim()];
  const route = layer?.route;

  if (!route) {
    return parts.filter(Boolean).join(' ');
  }

  const methods = Object.keys(route.methods || {})
    .filter((method) => route.methods?.[method])
    .map((method) => method.toUpperCase())
    .join(',');
  const path = Array.isArray(route.path)
    ? route.path.join('|')
    : String(route.path || '').trim();

  if (methods) {
    parts.push(methods);
  }

  if (path) {
    parts.push(path);
  }

  return parts.filter(Boolean).join(' ');
}

function wrapHandler(handler, label) {
  if (
    typeof handler !== 'function'
    || handler.length === 4
    || handler[HANDLER_HARDENED]
  ) {
    return handler;
  }

  const wrappedHandler = function hardenedRouteHandler(req, res, next) {
    try {
      const result = handler.call(this, req, res, next);
      if (isPromiseLike(result)) {
        return Promise.resolve(result).catch((error) => {
          attachRouteLabel(error, label);
          return next(error);
        });
      }
      return result;
    } catch (error) {
      attachRouteLabel(error, label);
      return next(error);
    }
  };

  Object.defineProperty(wrappedHandler, HANDLER_HARDENED, {
    value: true,
  });

  return wrappedHandler;
}

function hardenLayer(layer, baseLabel) {
  if (!layer || typeof layer !== 'object') {
    return;
  }

  const nestedRouter =
    typeof layer.handle === 'function' && Array.isArray(layer.handle.stack)
      ? layer.handle
      : null;

  if (nestedRouter) {
    hardenRouter(nestedRouter, baseLabel);
    return;
  }

  if (layer.route && Array.isArray(layer.route.stack)) {
    const routeLabel = buildRouteLabel(baseLabel, layer);
    for (const routeLayer of layer.route.stack) {
      routeLayer.handle = wrapHandler(routeLayer.handle, routeLabel);
    }
    return;
  }

  if (typeof layer.handle === 'function') {
    layer.handle = wrapHandler(layer.handle, baseLabel);
  }
}

export function hardenRouter(router, baseLabel = 'router') {
  if (
    !router
    || typeof router !== 'function'
    || !Array.isArray(router.stack)
    || router[ROUTER_HARDENED]
  ) {
    return router;
  }

  Object.defineProperty(router, ROUTER_HARDENED, {
    value: true,
  });

  for (const layer of router.stack) {
    hardenLayer(layer, baseLabel);
  }

  return router;
}
