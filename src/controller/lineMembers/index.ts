import express from 'express';
import { requireRole } from '../../middlewares/requireRole';
import apiGetLineMember from './apiGetLineMember';
import apiListLineMembers from './apiListLineMembers';

const lineMembersRouter = express.Router();

lineMembersRouter.use(requireRole(['admin', 'manager', 'viewer']));
lineMembersRouter.get('/', apiListLineMembers);
lineMembersRouter.get('/:id', apiGetLineMember);

export default lineMembersRouter;
