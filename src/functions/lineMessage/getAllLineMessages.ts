import { LineMessageRepository } from "../../mysql/repositories/lineMessageRepository";

export const getAllLineMessages = async () => {

    const lineMessageRepository = new LineMessageRepository();

    const lineMessages = await lineMessageRepository.findAll();

    return lineMessages;
};