import promotionsController from '../controllers/promotionsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(promotionsController);

export default router;
