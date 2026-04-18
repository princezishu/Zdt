import eauctionController from '../controllers/eauctionController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(eauctionController);

export default router;
