import { getServiceAccount } from './getServiceAccount';
import { getAuth } from 'firebase-admin/auth';

export const getFirebaseAuth = () => {
  return getAuth(getServiceAccount());
};
