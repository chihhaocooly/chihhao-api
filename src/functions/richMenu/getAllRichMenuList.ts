import { GetAllRichMenuResponse, RichMenuRepository } from "@chihhaocooly/chihhao-package";

export const getAllRichMenuList = async () => {

    let getAllRichMenuListResponse: GetAllRichMenuResponse | undefined = undefined;

    const richMenuRipository = new RichMenuRepository();
    const richMenuList = await richMenuRipository.findAll();

    getAllRichMenuListResponse = {
        richMenuDtoList: richMenuList.map((richMenu) => {
            return {
                richMenuKey: richMenu.richMenuKey,
                name: richMenu.name,
                chatBarText: richMenu.chatBarText,
                selected: richMenu.selected,
                areas: richMenu.areas,
                width: richMenu.width,
                height: richMenu.height,
                imageUrl: richMenu.imageUrl,
                lineRchMenuId: richMenu.lineRchMenuId,
                isDefault: richMenu.isDefault,
                createdAt: richMenu.createdAt!.toISOString(),
                updatedAt: richMenu.updatedAt!.toISOString(),
            };
        })
    }

    return getAllRichMenuListResponse;
}