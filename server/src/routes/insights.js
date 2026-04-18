import insightsController from '../controllers/insightsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(insightsController);

export default router;
