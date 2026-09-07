import express from 'express';
import apiGetAllLineMessages from './apiGetAllLineMessages';
import { requireRole } from '../../middlewares/requireRole';
import apiCopyLineMessage from './apiCopyLineMessage';
import apiCreateLineMessage from './apiCreateLineMessage';
import apiDeleteLineMessage from './apiDeleteLineMessage';
import apiGetLineMessage from './apiGetLineMessage';
import apiGetLineMessageReferences from './apiGetLineMessageReferences';
import apiGetReplySettings from './apiGetReplySettings';
import apiListLineMessages from './apiListLineMessages';
import apiUpdateLineMessage from './apiUpdateLineMessage';
import apiUpdateReplySettings from './apiUpdateReplySettings';
import apiValidateLineMessage from './apiValidateLineMessage';
import apiValidateSavedLineMessage from './apiValidateSavedLineMessage';


const lineMessageRouter = express.Router();

lineMessageRouter.post('/:lineMessageKey/validate',
    requireRole(['admin', 'manager']),
    apiValidateSavedLineMessage
);

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
