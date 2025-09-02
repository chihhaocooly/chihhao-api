import type { Request, Response } from 'express';
import { BaseResponse } from '../@types/base-response';
import { Client } from '@line/bot-sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';

/*
  @description 取得新北市停車場資訊，並且推播給使用者
 */
export const apiGetPartInfo = async (req: Request, resp: Response) => {
  let base: BaseResponse = {
    statusCode: 200,
    statusMsg: '',
  };

  try {
    // 1. 透過爬蟲取得爬取此網站的停車場資訊
    const url = 'https://www.traffic.ntpc.gov.tw/home.jsp?id=f7cfc34cf174cacc';
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 10000, // 10秒超時
    });

    console.log('Response status:', response.status);
    console.log('Content length:', response.data.length);

    const $ = cheerio.load(response.data);

    // 2. 解析表格資料
    const parkInfo: { parkName: string; registrationPeriod: string }[] = [];
    const allParkData: { parkName: string; registrationPeriod: string; isWithinPeriod: boolean }[] = [];

    // 尋找包含停車場資訊的表格
    $('table').each((tableIndex, table) => {
      const $table = $(table);
      const rows = $table.find('tr');

      console.log(`Table ${tableIndex + 1}: 共 ${rows.length} 行`);

      if (rows.length > 1) {
        // 檢查表頭是否包含停車場相關欄位
        const headerText = rows.first().text();
        console.log(`表頭內容: ${headerText}`);

        if (headerText.includes('停車場') || headerText.includes('登記期間')) {
          // 處理所有行（包括 thead 和 tbody 中的資料）
          rows.each((rowIndex, row) => {
            const $row = $(row);
            // 同時查找 td 和 th 元素，因為有些資料在 th 中
            const cells = $row.find('td, th');

            if (cells.length >= 2 && rowIndex > 0) {
              // 跳過表頭行
              const parkNameCell = $(cells[0]);
              const registrationPeriodCell = $(cells[1]);

              // 提取文字內容，處理巢狀的 a 和 span 標籤
              const parkName = parkNameCell.text().trim();
              const registrationPeriod = registrationPeriodCell.text().trim();

              console.log(`Row ${rowIndex}: 停車場="${parkName}", 登記期間="${registrationPeriod}"`);

              // 3. 取得停車場的名稱與登記期間
              if (
                parkName &&
                registrationPeriod &&
                parkName !== '停車場' &&
                parkName !== '登記期間' &&
                parkName !== '登記及抽籤辦法' &&
                parkName !== '抽籤結果' &&
                !parkName.includes('停車場登記期間登記及抽籤辦法抽籤結果')
              ) {
                const isWithinPeriod = isWithinRegistrationPeriod(registrationPeriod);

                // 記錄所有找到的停車場資料
                allParkData.push({
                  parkName,
                  registrationPeriod,
                  isWithinPeriod,
                });

                // 4. 檢查當前時間是否位於登記期間內
                if (isWithinPeriod) {
                  parkInfo.push({
                    parkName,
                    registrationPeriod,
                  });
                }
              }
            }
          });
        }
      }
    });

    console.log('所有找到的停車場資料:', allParkData);
    console.log('符合登記期間的停車場:', parkInfo);

    // 5. 透過 LINE API 推播資料
    if (parkInfo.length > 0) {
      const client = new Client({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN as string,
        channelSecret: process.env.LINE_CHANNEL_SECRET,
      });

      const messageText =
        parkInfo.length > 0
          ? `🅿️ 目前可登記的停車場資訊：\n\n${parkInfo
              .map((info) => `停車場：${info.parkName}\n登記期間：${info.registrationPeriod}`)
              .join('\n\n')}`
          : '目前沒有可登記的停車場';

      await client.pushMessage(process.env.LINE_USER_ID as string, {
        type: 'text',
        text: messageText,
      });

      base.statusMsg = `成功推播 ${parkInfo.length} 筆停車場資訊`;
    } else {
      base.statusMsg = '目前沒有可登記的停車場';
    }
  } catch (error) {
    console.error('Error fetching park info:', error);
    base.statusCode = 500;
    base.statusMsg = '取得停車場資訊失敗';
  }

  resp.status(base.statusCode).json(base);
};

/**
 * 檢查當前時間是否在登記期間內
 * @param registrationPeriod 登記期間字串，格式如：114.09.02(二)-114.09.23(二)
 * @returns boolean
 */
function isWithinRegistrationPeriod(registrationPeriod: string): boolean {
  try {
    console.log(`檢查登記期間: "${registrationPeriod}"`);

    // 解析登記期間字串 - 支援多種格式
    let periodMatch = registrationPeriod.match(/(\d{3})\.(\d{2})\.(\d{2})\([^)]+\)-(\d{3})\.(\d{2})\.(\d{2})\([^)]+\)/);

    // 如果第一個格式不符合，嘗試更寬鬆的格式
    if (!periodMatch) {
      periodMatch = registrationPeriod.match(
        /(\d{3})\.(\d{1,2})\.(\d{1,2})\([^)]*\)-(\d{3})\.(\d{1,2})\.(\d{1,2})\([^)]*\)/
      );
    }

    // 再嘗試沒有括號的格式
    if (!periodMatch) {
      periodMatch = registrationPeriod.match(/(\d{3})\.(\d{1,2})\.(\d{1,2})-(\d{3})\.(\d{1,2})\.(\d{1,2})/);
    }

    if (!periodMatch) {
      console.log(`無法解析登記期間格式: "${registrationPeriod}"`);
      return false; // 如果無法解析，就先納入結果讓使用者看到
    }

    // 民國年轉西元年（民國年 + 1911）
    const startYear = parseInt(periodMatch[1]) + 1911;
    const startMonth = parseInt(periodMatch[2]) - 1; // JavaScript 月份從 0 開始
    const startDay = parseInt(periodMatch[3]);

    const endYear = parseInt(periodMatch[4]) + 1911;
    const endMonth = parseInt(periodMatch[5]) - 1;
    const endDay = parseInt(periodMatch[6]);

    const startDate = new Date(startYear, startMonth, startDay);
    const endDate = new Date(endYear, endMonth, endDay, 23, 59, 59); // 設定為當天結束時間
    const currentDate = new Date();

    console.log(`登記期間: ${startDate.toLocaleDateString()} 到 ${endDate.toLocaleDateString()}`);
    console.log(`目前時間: ${currentDate.toLocaleDateString()}`);

    const isWithin = currentDate >= startDate && currentDate <= endDate;
    console.log(`是否在期間內: ${isWithin}`);

    return isWithin;
  } catch (error) {
    console.error('Error parsing registration period:', error);
    return false; // 解析錯誤時也先納入結果
  }
}
