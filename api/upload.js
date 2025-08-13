// /api/upload.js (Versión Corregida)

import { IncomingForm } from 'formidable';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    const { CHATWOOT_API_ACCESS_TOKEN, CHATWOOT_ACCOUNT_ID } = process.env;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!CHATWOOT_API_ACCESS_TOKEN || !CHATWOOT_ACCOUNT_ID) {
        console.error("Variables de entorno del servidor no configuradas.");
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
        const content = Array.isArray(fields.content) ? fields.content[0] : fields.content || '';
        
        // **CORRECCIÓN CLAVE:** 'formidable' devuelve los archivos en un array. Accedemos al primer elemento.
        const attachment = files.attachment ? files.attachment[0] : null;

        if (!conversationId || !attachment) {
            return res.status(400).json({ error: 'Faltan datos (conversationId o archivo).' });
        }

        const chatwootFormData = new FormData();
        chatwootFormData.append('content', content);
        chatwootFormData.append('attachments[]', fs.createReadStream(attachment.filepath), attachment.originalFilename);

        const CHATWOOT_URL = 'https://app.chatwoot.com';
        const endpoint = `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`;

        const response = await axios.post(endpoint, chatwootFormData, {
            headers: {
                ...chatwootFormData.getHeaders(),
                'api_access_token': CHATWOOT_API_ACCESS_TOKEN,
            },
        });
        
        res.status(200).json({ success: true, data: response.data });

    } catch (error) {
        // Esto mostrará el error detallado en la consola de 'vercel dev'
        console.error('Error detallado en el backend:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'No se pudo subir el archivo.' });
    }
}