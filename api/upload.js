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

    // --- Variables de Entorno ---
    const { CHATWOOT_URL, CHATWOOT_API_ACCESS_TOKEN, CHATWOOT_ACCOUNT_ID } = process.env;

    if (!CHATWOOT_URL || !CHATWOOT_API_ACCESS_TOKEN || !CHATWOOT_ACCOUNT_ID) {
        console.error("Error: Faltan variables de entorno del servidor.");
        return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
    }

    // --- Procesamiento del formulario ---
    const form = new IncomingForm({
        maxFileSize: 10 * 1024 * 1024, // 10 MB
        keepExtensions: true,
    });

    try {
        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                // ✅ ESTE ES EL CAMBIO CLAVE
                // Si 'formidable' detecta un error (ej: archivo muy grande), lo capturamos aquí.
                if (err) {
                    console.error('Error al procesar el formulario con formidable:', err.message);
                    // Rechazamos la promesa para que el 'catch' principal lo maneje.
                    return reject(new Error('El archivo es demasiado grande (límite 10MB) o está corrupto.'));
                }
                resolve({ fields, files });
            });
        });

        const conversationId = fields.conversationId?.[0] ?? fields.conversationId;
        const content = fields.content?.[0] ?? fields.content ?? '';
        const attachment = files.attachment?.[0];

        if (!conversationId || !attachment) {
            return res.status(400).json({ error: 'Faltan datos (conversationId o archivo).' });
        }

        // --- Petición a Chatwoot ---
        const chatwootFormData = new FormData();
        chatwootFormData.append('content', content);
        chatwootFormData.append('message_type', 'incoming');

        const fileBuffer = fs.readFileSync(attachment.filepath);
        const fileBlob = new Blob([fileBuffer], { type: attachment.mimetype });
        chatwootFormData.append('attachments[]', fileBlob, attachment.originalFilename || 'archivo_subido');

        const endpoint = new URL(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, `https://${CHATWOOT_URL}`);
        
        const chatwootResponse = await fetch(endpoint.toString(), {
            method: 'POST',
            headers: { 'api-access-token': CHATWOOT_API_ACCESS_TOKEN },
            body: chatwootFormData,
        });

        fs.unlinkSync(attachment.filepath); // Limpiar archivo temporal

        const responseData = await chatwootResponse.json();
        if (!chatwootResponse.ok) {
            throw new Error(responseData.message || 'Error en la API de Chatwoot');
        }

        res.status(200).json({ success: true, data: responseData });

    } catch (error) {
        console.error('Error final en el backend al subir archivo:', error.message);
        // Este bloque ahora enviará un error JSON claro al frontend.
        res.status(500).json({ error: error.message });
    }
}