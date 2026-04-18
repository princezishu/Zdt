import locationsController from '../controllers/locationsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(locationsController);

export default router;
