// /api/upload.js

import { IncomingForm } from 'formidable';
import fs from 'fs';
import { URL } from 'url';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const CHATWOOT_URL = process.env.CHATWOOT_URL;
    const CHATWOOT_API_ACCESS_TOKEN = process.env.CHATWOOT_API_ACCESS_TOKEN;
    const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;

    if (!CHATWOOT_URL || !CHATWOOT_API_ACCESS_TOKEN || !CHATWOOT_ACCOUNT_ID) {
        console.error("Error: Faltan variables de entorno del servidor.");
        return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
    }

    try {
        const form = new IncomingForm();
        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) return reject(err);
                resolve({ fields, files });
            });
        });

        const conversationId = Array.isArray(fields.conversationId) ? fields.conversationId[0] : fields.conversationId;
        const content = Array.isArray(fields.content) ? fields.content[0] : (fields.content || '');
        const attachment = files.attachment ? files.attachment[0] : null;

        if (!conversationId || !attachment) {
            return res.status(400).json({ error: 'Faltan datos (conversationId o archivo).' });
        }

        const chatwootFormData = new FormData();
        
        chatwootFormData.append('content', content);
        // ¡CORREGIDO! Ahora el mensaje se registrará como enviado por el usuario.
        chatwootFormData.append('message_type', 'incoming'); 
        
        const fileBuffer = fs.readFileSync(attachment.filepath);
        const fileBlob = new Blob([fileBuffer], { type: attachment.mimetype });
        
        chatwootFormData.append('attachments[]', fileBlob, attachment.originalFilename || 'archivo_subido');

        const endpoint = new URL(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, `https://${CHATWOOT_URL}`);
        
        const response = await fetch(endpoint.toString(), {
            method: 'POST',
            headers: {
                'api-access-token': CHATWOOT_API_ACCESS_TOKEN,
                'Authorization': `Bearer ${CHATWOOT_API_ACCESS_TOKEN}`,
            },
            body: chatwootFormData,
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.message || 'Error en la API de Chatwoot');
        }

        res.status(200).json({ success: true, data: responseData });

    } catch (error) {
        console.error('Error en el backend al subir archivo:', error.message);
        res.status(500).json({ error: error.message });
    }
}