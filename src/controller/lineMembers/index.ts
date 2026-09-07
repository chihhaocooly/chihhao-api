import express from 'express';
import { requireRole } from '../../middlewares/requireRole';
import apiGetLineMember from './apiGetLineMember';
import apiListLineMembers from './apiListLineMembers';
import apiPushMemberMessage from './apiPushMemberMessage';

const lineMembersRouter = express.Router();

lineMembersRouter.use(requireRole(['admin', 'manager', 'viewer']));
lineMembersRouter.get('/', apiListLineMembers);
lineMembersRouter.get('/:id', apiGetLineMember);
lineMembersRouter.post('/:id/push-message', requireRole(['admin', 'manager']), apiPushMemberMessage);

export default lineMembersRouter;
