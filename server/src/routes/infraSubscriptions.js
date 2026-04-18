import infraSubscriptionsController from '../controllers/infraSubscriptionsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(infraSubscriptionsController);

export default router;
