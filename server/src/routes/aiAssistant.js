import aiAssistantController from '../controllers/aiAssistantController.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(aiAssistantController);

export default router;
