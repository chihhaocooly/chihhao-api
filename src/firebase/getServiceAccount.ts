import { apps, credential } from 'firebase-admin';
import { initializeApp, App } from 'firebase-admin/app';

export const getServiceAccount = (): App => {
  let app: App | null = apps.length ? apps[0] : null; // 確保初始化一次
  if (!app) {
    app = initializeApp({
      credential: credential.applicationDefault(), // 使用 Application Default Credentials
    });
  }
  return app;
};
