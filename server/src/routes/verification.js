import verificationModuleRoutes from '../modules/verification/routes.js';
import { createControllerRoute } from './createControllerRoute.js';

const router = createControllerRoute(verificationModuleRoutes);

export default router;
