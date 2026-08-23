import express from 'express';
import apiGetAllRichmenuList from './apiGetAllRichmenuList';
import apiSetDefaultRichmenu from './apiSetDefaultRichmenu';
import { requireRole } from '../../middlewares/requireRole';
import apiListRichmenus from './apiListRichmenus';
import apiGetRichmenu from './apiGetRichmenu';
import apiCreateRichmenu from './apiCreateRichmenu';
import apiUpdateRichmenu from './apiUpdateRichmenu';
import apiCopyRichmenu from './apiCopyRichmenu';
import apiDeleteRichmenu from './apiDeleteRichmenu';


const richmenuRouter = express.Router();

richmenuRouter.get('/',
    requireRole(['admin', 'manager', 'viewer']),
    apiListRichmenus
);

richmenuRouter.get('/allRichmenuList',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetAllRichmenuList
);

richmenuRouter.get('/:richmenuKey',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetRichmenu
);

richmenuRouter.post('/',
    requireRole(['admin', 'manager']),
    apiCreateRichmenu
);

richmenuRouter.post('/setDefaultRichmenu',
    requireRole(['admin', 'manager']),
    apiSetDefaultRichmenu
);

richmenuRouter.put('/:richmenuKey',
    requireRole(['admin', 'manager']),
    apiUpdateRichmenu
);

richmenuRouter.post('/:richmenuKey/copy',
    requireRole(['admin', 'manager']),
    apiCopyRichmenu
);

richmenuRouter.delete('/:richmenuKey',
    requireRole(['admin', 'manager']),
    apiDeleteRichmenu
);



export default richmenuRouter;
