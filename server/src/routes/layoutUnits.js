import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  bulkCreateUnits,
  createFloor,
  createUnit,
  getLatestLayout,
  listBuildings,
  listFloors,
  listLayoutMarkers,
  listUnits,
  updateUnit,
  uploadLayout,
  upsertLayoutMarkers,
} from '../controllers/layoutUnitsController.js';

const router = Router();

router.use(['/buildings', '/floors', '/layout', '/units'], requireAuth, requirePermission('edit_units'));

router.get('/buildings', listBuildings);
router.get('/floors', listFloors);
router.post('/floors', createFloor);

router.post('/layout/upload', uploadLayout);
router.get('/layout/:floorId/latest', getLatestLayout);
router.get('/layout/:floorId/markers', listLayoutMarkers);
router.post('/layout/:floorId/markers', upsertLayoutMarkers);

router.post('/units/bulk', bulkCreateUnits);
router.post('/units', createUnit);
router.get('/units', listUnits);
router.put('/units/:id', updateUnit);

export default router;
