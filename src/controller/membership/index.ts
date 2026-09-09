import { Router } from 'express';
import { requireRole } from '../../middlewares/requireRole';
import { MemberConfigurationService } from '../../functions/membership/memberConfigurationService';
import { taiwanRegions } from '../../functions/membership/memberRegions';

const router = Router();
const service = new MemberConfigurationService();
const write = requireRole(['admin', 'manager']);
router.use(requireRole(['admin', 'manager', 'viewer']));
router.get('/member-identities', async (_req, res) => {
  res.json(await service.identities());
});
router.post('/member-identities', write, async (req, res) => {
  res.status(201).json(await service.saveIdentity(null, req.body));
});
router.patch('/member-identities/sub-identities/:id', write, async (req, res) => {
  res.json(await service.saveSubIdentity(null, req.params.id, req.body));
});
router.delete('/member-identities/sub-identities/:id', write, async (req, res) => {
  await service.deleteIdentity(req.params.id, true);
  res.sendStatus(204);
});
router.patch('/member-identities/:id', write, async (req, res) => {
  res.json(await service.saveIdentity(req.params.id, req.body));
});
router.delete('/member-identities/:id', write, async (req, res) => {
  await service.deleteIdentity(req.params.id, false);
  res.sendStatus(204);
});
router.post('/member-identities/:id/sub-identities', write, async (req, res) => {
  res.status(201).json(await service.saveSubIdentity(req.params.id, null, req.body));
});
router.get('/member-fields', async (_req, res) => {
  res.json(await service.fields());
});
router.get('/member-regions', (_req, res) => {
  res.json(taiwanRegions);
});
router.post('/member-fields', write, async (req, res) => {
  res.status(201).json(await service.saveField(null, req.body));
});
router.patch('/member-fields/:id', write, async (req, res) => {
  res.json(await service.saveField(req.params.id, req.body));
});
router.delete('/member-fields/:id', write, async (req, res) => {
  await service.deleteField(req.params.id);
  res.sendStatus(204);
});
router.get('/member-forms', async (_req, res) => {
  res.json(await service.forms());
});
router.put('/member-forms/default', write, async (req, res) => {
  res.json(await service.setDefault(req.body));
});
router.put('/member-forms/:surveyKey', write, async (req, res) => {
  res.json(await service.saveForm(req.params.surveyKey, req.body));
});
router.delete('/member-forms/:surveyKey', write, async (req, res) => {
  await service.deleteForm(req.params.surveyKey);
  res.sendStatus(204);
});
export default router;
