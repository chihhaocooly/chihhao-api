import express from 'express';
import { MemberProfileService } from '../../functions/membership/memberProfileService';
import { requireRole } from '../../middlewares/requireRole';
import apiGetLineMember from './apiGetLineMember';
import apiListLineMembers from './apiListLineMembers';
import apiPushMemberMessage from './apiPushMemberMessage';

const lineMembersRouter = express.Router();

lineMembersRouter.use(requireRole(['admin', 'manager', 'viewer']));
lineMembersRouter.get('/', apiListLineMembers);
lineMembersRouter.get('/:id', apiGetLineMember);
lineMembersRouter.post('/:id/push-message', requireRole(['admin', 'manager']), apiPushMemberMessage);

const membership = new MemberProfileService();
lineMembersRouter.get('/:id/membership', async (req, res) => { res.json(await membership.detail(req.params.id)); });
lineMembersRouter.post('/:id/identity-transitions', requireRole(['admin', 'manager']), async (req, res) => {
  res.json(await membership.transition(req.params.id, req.body, req.authContext!.uid));
});
lineMembersRouter.patch('/:id/profile', requireRole(['admin', 'manager']), async (req, res) => {
  res.json(await membership.updateProfile(req.params.id, req.body, req.authContext!.uid));
});
for (const kind of ['changes', 'survey-reports'] as const) {
  lineMembersRouter.get(`/:id/${kind}`, async (req, res) => {
    res.json(await membership.history(req.params.id, kind, Number(req.query.page ?? 1), Number(req.query.pageSize ?? 20)));
  });
}
lineMembersRouter.post('/:id/rich-menu-sync/retry', requireRole(['admin', 'manager']), async (req, res) => {
  res.json(await membership.retry(req.params.id));
});
export default lineMembersRouter;
