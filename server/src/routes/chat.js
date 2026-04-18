import chatController from '../controllers/chatController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(chatController);

export default router;
