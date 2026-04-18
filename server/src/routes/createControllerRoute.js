import { Router } from 'express';

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === 'function');
}

export function createControllerRoute(controllerRouter) {
  if (!controllerRouter || typeof controllerRouter !== 'function') {
    throw new TypeError('createControllerRoute expected an Express router instance.');
  }

  const router = Router();
  router.use((req, res, next) => {
    try {
      const result = controllerRouter(req, res, next);
      if (isPromiseLike(result)) {
        return Promise.resolve(result).catch(next);
      }
      return result;
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
