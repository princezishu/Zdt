import materialsController from '../controllers/materialsController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(materialsController);

export default router;
