import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { auth } from './middlewares/auth';
import 'express-async-errors'; // 讓非同步API也可以抓到throw的錯誤
import { errorHandler } from './middlewares/error-handler';
import { apiDemo } from './functions/api-demo';
import lineMessageRouter from './controller/lineMessage';
import webhookRouter from './controller/webhook';
import { AppDataSource } from '@chihhaocooly/chihhao-package';
import richMenuRouter from './controller/richMenu';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true
  })
);


app.use(helmet());

app.get('/', (__, res) => {
  res.send('OK');
});

// TODO 請將以下的demoRouter改成所需的路由名稱
//!!!!!!取用此template，請將demo相關內容移除，並建立自己所需的基礎Router!!!!!!!!


//以下接口會開始對API KEY進行檢查，以下此行請針對各自專案的需求，自行修改router與擺放位置

const port = process.env.PORT || 8080;

(async () => {
  try {
    // 確保資料庫初始化完成
    await AppDataSource.initialize();
    console.log('🚀 Database initialized');
    app.use('/webhook', webhookRouter);
    app.use(auth);
    app.use('/lineMessage', lineMessageRouter);

    app.use('/richMenu', richMenuRouter);
    app.get('/demo', apiDemo);
    app.use(errorHandler);

    app.listen(port, () => {
      console.log(`🚀 Server ready on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1); // 無法初始化時退出程序
  }
})();