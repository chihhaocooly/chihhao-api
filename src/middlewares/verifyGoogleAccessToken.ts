import axios from 'axios';

export const verifyGoogleAccessToken = async (accessToken: string): Promise<any> => {
  const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
  return response.data;
};
