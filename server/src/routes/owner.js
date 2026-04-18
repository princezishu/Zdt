import ownerController from '../controllers/ownerController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(ownerController);

export default router;
