import workflowController from '../controllers/workflowController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(workflowController);

export default router;
