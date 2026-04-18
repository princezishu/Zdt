import infraIngestController from '../controllers/infraIngestController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(infraIngestController);

export default router;
