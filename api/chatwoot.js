// api/chatwoot.js

// Este es el manejador principal de nuestra función serverless (el proxy).
export default async function handler(req, res) {
  // Solo aceptamos peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // El token secreto se lee de las variables de entorno de Vercel.
  // ¡Nunca lo escribas directamente en el código!
  const apiToken = process.env.CHATWOOT_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({ error: 'API token no está configurado en el servidor.' });
  }

  // Usamos un 'switch' para manejar diferentes acciones desde el frontend.
  const { action, payload } = req.body;
  let chatwootUrl = '';
  let body = {};

  const CHATWOOT_API_HOST = 'https://app.chatwoot.com/api/v1';

  switch (action) {
    // Caso para crear un nuevo contacto
    case 'create_contact':
      chatwootUrl = `${CHATWOOT_API_HOST}/inboxes/${payload.inboxIdentifier}/contacts`;
      // No se necesita cuerpo para esta petición POST
      break;

    // Caso para crear una nueva conversación
    case 'create_conversation':
      chatwootUrl = `${CHATWOOT_API_HOST}/inboxes/${payload.inboxIdentifier}/contacts/${payload.contactIdentifier}/conversations`;
      // No se necesita cuerpo para esta petición POST
      break;

    // Caso para enviar un mensaje
    case 'send_message':
      chatwootUrl = `${CHATWOOT_API_HOST}/inboxes/${payload.inboxIdentifier}/contacts/${payload.contactIdentifier}/conversations/${payload.conversationId}/messages`;
      body = JSON.stringify({ content: payload.content });
      break;

    default:
      return res.status(400).json({ error: 'Acción no válida' });
  }

  // Hacemos la llamada real a la API de Chatwoot desde nuestro servidor
  try {
    const chatwootResponse = await fetch(chatwootUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': apiToken, // Usamos el token de acceso para autenticarnos
      },
      body: Object.keys(body).length ? body : null,
    });

    const data = await chatwootResponse.json();

    // Devolvemos la respuesta de Chatwoot al frontend
    res.status(chatwootResponse.status).json(data);

  } catch (error) {
    res.status(500).json({ error: 'El servidor proxy ha fallado', details: error.message });
  }
}
