import authController from '../controllers/authController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(authController);

export default router;
