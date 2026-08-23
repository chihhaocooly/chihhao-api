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
                queryListKeywords: richmenu.queryListKeywords ?? [],
                width: richmenu.width,
                height: richmenu.height,
                imageUrl: richmenu.imageUrl,
                assetKey: richmenu.assetKey ?? null,
                lineRchmenuId: richmenu.lineRchmenuId,
                isDefault: richmenu.isDefault,
                enable: richmenu.enable ?? true,
                type: richmenu.type ?? 'general',
                status: richmenu.status ?? 'published',
                startDateTime: richmenu.startDateTime?.toISOString() ?? null,
                endDateTime: richmenu.endDateTime?.toISOString() ?? null,
                createdAt: richmenu.createdAt!.toISOString(),
                updatedAt: richmenu.updatedAt!.toISOString(),
            };
        })
    }

    return getAllRichmenuListResponse;
}
