// api/chatwoot.js (Versión Corregida)

// Este es el manejador principal de nuestra función serverless (el proxy).
export default async function handler(req, res) {
  // Solo aceptamos peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // El token secreto se lee de las variables de entorno de Vercel.
  const apiToken = process.env.CHATWOOT_API_TOKEN;
  if (!apiToken) {
    console.error("PROXY ERROR: CHATWOOT_API_TOKEN no está configurado.");
    return res.status(500).json({ error: 'API token no está configurado en el servidor.' });
  }

  const { action, payload } = req.body;
  
  // Validamos que la petición tenga una acción y datos
  if (!action || !payload) {
    return res.status(400).json({ error: 'La petición no es válida. Faltan "action" o "payload".' });
  }

  const CHATWOOT_API_HOST = 'https://app.chatwoot.com/api/v1';
  let chatwootUrl = '';
  let bodyContent = null; // Usaremos esta variable para el cuerpo de la petición

  try {
    switch (action) {
      case 'create_contact':
        chatwootUrl = `${CHATWOOT_API_HOST}/inboxes/${payload.inboxIdentifier}/contacts`;
        break;

      case 'create_conversation':
        chatwootUrl = `${CHATWOOT_API_HOST}/inboxes/${payload.inboxIdentifier}/contacts/${payload.contactIdentifier}/conversations`;
        break;

      case 'send_message':
        chatwootUrl = `${CHATWOOT_API_HOST}/inboxes/${payload.inboxIdentifier}/contacts/${payload.contactIdentifier}/conversations/${payload.conversationId}/messages`;
        // Para mensajes enviados vía API por un "bot" o sistema, usamos 'outgoing'
        bodyContent = JSON.stringify({ 
          content: payload.content,
          message_type: 'outgoing' 
        });
        break;

      default:
        return res.status(400).json({ error: `Acción no reconocida: ${action}` });
    }

    // Hacemos la llamada real a la API de Chatwoot
    const chatwootResponse = await fetch(chatwootUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': apiToken,
      },
      body: bodyContent, // Enviamos el cuerpo solo si es necesario
    });

    const data = await chatwootResponse.json();

    if (!chatwootResponse.ok) {
      console.error(`PROXY ERROR: Chatwoot devolvió un error para la acción '${action}'.`, data);
    }
    
    // Devolvemos la respuesta de Chatwoot al frontend
    res.status(chatwootResponse.status).json(data);

  } catch (error) {
    console.error(`PROXY CRASH: Fallo en la acción '${action}'.`, error);
    res.status(500).json({ error: 'El servidor proxy ha fallado', details: error.message });
  }
}
