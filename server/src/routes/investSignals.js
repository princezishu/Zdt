import investSignalsController from '../controllers/investSignalsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(investSignalsController);

export default router;
