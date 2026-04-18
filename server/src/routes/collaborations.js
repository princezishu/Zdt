import collaborationsController from '../controllers/collaborationsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(collaborationsController);

export default router;
