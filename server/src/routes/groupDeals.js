import groupDealsController from '../controllers/groupDealsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(groupDealsController);

export default router;
