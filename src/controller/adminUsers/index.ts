import express from 'express';
import { requireRole } from '../../middlewares/requireRole';
import apiCreateAdminUser from './apiCreateAdminUser';
import apiGetAdminUsers from './apiGetAdminUsers';
import apiUpdateAdminUserRole from './apiUpdateAdminUserRole';
import apiUpdateAdminUserStatus from './apiUpdateAdminUserStatus';

const adminUsersRouter = express.Router();

adminUsersRouter.use(requireRole(['admin']));
adminUsersRouter.get('/users', apiGetAdminUsers);
adminUsersRouter.post('/users', apiCreateAdminUser);
adminUsersRouter.patch('/users/:id/role', apiUpdateAdminUserRole);
adminUsersRouter.patch('/users/:id/status', apiUpdateAdminUserStatus);

export default adminUsersRouter;
