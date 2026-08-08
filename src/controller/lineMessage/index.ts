import express from 'express';
import multer from 'multer';
import apiGetAllLineMessages from './apiGetAllLineMessages';
import { requireRole } from '../../middlewares/requireRole';
import apiCopyLineMessage from './apiCopyLineMessage';
import apiCreateLineMessage from './apiCreateLineMessage';
import apiDeleteLineMessage from './apiDeleteLineMessage';
import apiDeleteLineMessageImageAsset from './apiDeleteLineMessageImageAsset';
import apiGetLineMessage from './apiGetLineMessage';
import apiGetLineMessageImageAssetReferences from './apiGetLineMessageImageAssetReferences';
import apiGetLineMessageReferences from './apiGetLineMessageReferences';
import apiGetReplySettings from './apiGetReplySettings';
import apiListLineMessages from './apiListLineMessages';
import apiListLineMessageImageAssets from './apiListLineMessageImageAssets';
import apiUpdateLineMessage from './apiUpdateLineMessage';
import apiUpdateReplySettings from './apiUpdateReplySettings';
import apiUploadLineMessageImageAsset from './apiUploadLineMessageImageAsset';
import apiValidateLineMessage from './apiValidateLineMessage';
import { maxLineMessageImageBytes } from '../../functions/lineMessage/lineMessageImageAssetService';


const lineMessageRouter = express.Router();
const uploadLineMessageImage = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: maxLineMessageImageBytes,
        files: 1,
    },
});

lineMessageRouter.get('/allLineMessages',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetAllLineMessages
);

lineMessageRouter.get('/',
    requireRole(['admin', 'manager', 'viewer']),
    apiListLineMessages
);

lineMessageRouter.post('/validate',
    requireRole(['admin', 'manager', 'viewer']),
    apiValidateLineMessage
);

lineMessageRouter.get('/settings/replies',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetReplySettings
);

lineMessageRouter.put('/settings/replies',
    requireRole(['admin', 'manager']),
    apiUpdateReplySettings
);

lineMessageRouter.get('/assets/images',
    requireRole(['admin', 'manager', 'viewer']),
    apiListLineMessageImageAssets
);

lineMessageRouter.post('/assets/images',
    requireRole(['admin', 'manager']),
    uploadLineMessageImage.single('image'),
    apiUploadLineMessageImageAsset
);

lineMessageRouter.get('/assets/images/:imageAssetKey/references',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetLineMessageImageAssetReferences
);

lineMessageRouter.delete('/assets/images/:imageAssetKey',
    requireRole(['admin', 'manager']),
    apiDeleteLineMessageImageAsset
);

lineMessageRouter.post('/',
    requireRole(['admin', 'manager']),
    apiCreateLineMessage
);

lineMessageRouter.get('/:lineMessageKey/references',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetLineMessageReferences
);

lineMessageRouter.post('/:lineMessageKey/copy',
    requireRole(['admin', 'manager']),
    apiCopyLineMessage
);

lineMessageRouter.get('/:lineMessageKey',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetLineMessage
);

lineMessageRouter.put('/:lineMessageKey',
    requireRole(['admin', 'manager']),
    apiUpdateLineMessage
);

lineMessageRouter.delete('/:lineMessageKey',
    requireRole(['admin', 'manager']),
    apiDeleteLineMessage
);


export default lineMessageRouter;
