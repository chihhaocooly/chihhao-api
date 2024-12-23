import { LineMessageRepository } from "@chihhaocooly/chihhao-package";

export const getAllLineMessages = async () => {

    const lineMessageRepository = new LineMessageRepository();

    const lineMessages = await lineMessageRepository.findAll();

    return lineMessages;
};