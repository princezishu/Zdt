import realtyController from '../controllers/realtyController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(realtyController);

export default router;
