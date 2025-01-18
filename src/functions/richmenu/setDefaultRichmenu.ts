import { RichmenuRepository } from "@chihhaocooly/chihhao-package";
import { MyError } from "../../@types/my-error";
import { LineMessageApiService } from "../lineMessageApi/lineMessageApiService";

export const setDefaultRichmenu = async (richmenuKey: string) => {

    const richmenuRepository = new RichmenuRepository();
    const richmenuDto = await richmenuRepository.findByRichmenuKey(richmenuKey);

    // 如果找不到該richmenuKey，則回傳錯誤
    if (!richmenuDto) {
        throw new MyError(500, '找不到該richmenuKey');
    }

    // 設定為`預設richmenu
    const lineRichmenuId = richmenuDto.lineRchmenuId;

    const result = await LineMessageApiService.SetDefaultRichmenu(lineRichmenuId);
    console.log('result', result);
}