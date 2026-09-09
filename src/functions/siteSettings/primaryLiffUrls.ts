import { AppDataSource } from '@chihhaocooly/chihhao-package';

export interface PrimaryLiffUrls {
  member: string;
  survey: (surveyKey: string) => string;
}

export const getPrimaryLiffUrls = async (): Promise<PrimaryLiffUrls | null> => {
  const rows = (await AppDataSource.query(`
    SELECT app.liffId FROM site_line_setting setting
    INNER JOIN site_liff_app app ON app.id = setting.primaryLiffAppId
    WHERE setting.settingKey = 'default' LIMIT 1
  `)) as { liffId: string }[];
  const id = rows[0]?.liffId;
  if (!id) return null;
  const base = `https://liff.line.me/${encodeURIComponent(id)}`;
  return {
    member: `${base}/member`,
    survey: (key: string) => `${base}/survey?surveyId=${encodeURIComponent(key)}`,
  };
};
