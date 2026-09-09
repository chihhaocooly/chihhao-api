import { MyError } from './my-error';

export class MemberSettingsError extends MyError {
  constructor(status: number, message: string, readonly fieldErrors: { path: string; message: string }[] = []) {
    super(status, message);
  }
}

export const atSettingsPath = async <T>(path: string, work: () => T | Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MemberSettingsError) throw error;
    if (error instanceof MyError)
      throw new MemberSettingsError(error.statusCode, error.message, [{ path, message: error.message }]);
    throw error;
  }
};
