import aiServicesController from '../controllers/aiServicesController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(aiServicesController);

export default router;
