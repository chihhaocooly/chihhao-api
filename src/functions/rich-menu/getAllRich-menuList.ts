import { GetAllRichmenuResponse, RichmenuRepository } from "@chihhaocooly/chihhao-package";

export const getAllRichmenuList = async () => {

    let getAllRichmenuListResponse: GetAllRichmenuResponse | undefined = undefined;

    const richmenuRipository = new RichmenuRepository();
    const richmenuList = await richmenuRipository.findAll();

    getAllRichmenuListResponse = {
        richmenuDtoList: richmenuList.map((richmenu) => {
            return {
                richmenuKey: richmenu.richmenuKey,
                name: richmenu.name,
                chatBarText: richmenu.chatBarText,
                selected: richmenu.selected,
                areas: richmenu.areas,
                width: richmenu.width,
                height: richmenu.height,
                imageUrl: richmenu.imageUrl,
                lineRchmenuId: richmenu.lineRchmenuId,
                isDefault: richmenu.isDefault,
                createdAt: richmenu.createdAt!.toISOString(),
                updatedAt: richmenu.updatedAt!.toISOString(),
            };
        })
    }

    return getAllRichmenuListResponse;
}