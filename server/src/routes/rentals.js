import rentalsController from '../controllers/rentalsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(rentalsController);

export default router;
