import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { MyError } from "../../@types/my-error";
import { SecretStore } from "./siteSettingsTypes";

export class SecretManagerStore implements SecretStore {
  private readonly client = new SecretManagerServiceClient();

  async writeSecret(secretId: string, value: string): Promise<string> {
    const projectId = await this.getProjectId();
    if (!projectId) {
      throw new MyError(500, "Secret Manager project is not configured");
    }

    const parent = `projects/${projectId}`;
    const secretName = `${parent}/secrets/${secretId}`;
    await this.ensureSecret(parent, secretId);
    await this.client.addSecretVersion({
      parent: secretName,
      payload: {
        data: Buffer.from(value, "utf8"),
      },
    });

    return secretName;
  }

  async readSecret(secretName: string): Promise<string> {
    const [version] = await this.client.accessSecretVersion({
      name: `${secretName}/versions/latest`,
    });

    const data = version.payload?.data?.toString();
    if (!data) {
      throw new MyError(500, "Secret value is empty");
    }

    return data;
  }

  private async ensureSecret(parent: string, secretId: string): Promise<void> {
    try {
      await this.client.getSecret({ name: `${parent}/secrets/${secretId}` });
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }

      await this.client.createSecret({
        parent,
        secretId,
        secret: {
          replication: {
            automatic: {},
          },
        },
      });
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: number }).code === 5;
  }

  private async getProjectId(): Promise<string | undefined> {
    return process.env.SITE_SETTINGS_SECRET_PROJECT_ID
      || process.env.GOOGLE_CLOUD_PROJECT
      || process.env.GCP_PROJECT
      || await this.client.getProjectId();
  }
}
