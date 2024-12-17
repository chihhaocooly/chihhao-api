import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { auth } from './middlewares/auth';
import 'express-async-errors'; // 讓非同步API也可以抓到throw的錯誤
import { errorHandler } from './middlewares/error-handler';
import { apiDemo } from './functions/api-demo';
import lineMessageRouter from './controller/lineMessage';
import { AppDataSource } from './mysql/data-source';
import webhookRouter from './controller/webhook';

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
app.use('/webhook', webhookRouter);

app.use(auth);

app.use('/lineMessage', lineMessageRouter);

//!!!!!!取用此template，請將demo相關內容移除!!!!!!!!
app.get('/demo', apiDemo);

//錯誤處理器，需擺在所有方法最後面
app.use(errorHandler);

const port = process.env.PORT || 8080;
app.listen(port, async () => {
  await AppDataSource.initialize();
  console.log('🚀 Server ready on port', port);
});
