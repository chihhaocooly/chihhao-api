import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { LineMessage } from "../entities/LineMessage";

export class LineMessageRepository {

    private repository: Repository<LineMessage>;
    constructor() {
        this.repository = AppDataSource.getRepository(LineMessage);
    }
    async create(lineMessage: LineMessage) {
        return await this.repository.save(lineMessage);
    }
    async update(lineMessage: LineMessage) {
        return await this.repository.save(lineMessage);
    }
    async delete(lineMessage: LineMessage) {
        return await this.repository.remove(lineMessage);
    }
    async findByLineMessageKey(lineMessageKey: string) {
        return await this.repository.findOneBy({ lineMessageKey });
    }

    async findAll() {
        return await this.repository.find();
    }

}