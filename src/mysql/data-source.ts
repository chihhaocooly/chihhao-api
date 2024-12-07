import { DataSource } from "typeorm";
import { Test } from "./entities/Test";
import { LineMessage } from "./entities/LineMessage";

export const AppDataSource = new DataSource({
    type: 'mysql', //根據你自己的資料庫進行設定
    host: process.env.DB_HOST,
    port: 3306, //每個資料庫預設的port不一樣，請根據自己資料庫進行設定
    username: 'huang',
    password: process.env.DB_PASSWORD,
    database: 'huang',
    synchronize: false, //當資料庫一連線時，是否會將資料庫的 model檔案，同步於資料庫
    logging: false, //寫log的套件
    entities: [Test, LineMessage], //於程式中，要載入的資料庫model
    migrations: []
});