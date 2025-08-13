// api/proxy.js

// Este es nuestro nuevo y simple proxy.
// Su única función es reenviar peticiones para evitar errores de CORS.
export default async function handler(req, res) {
  // Solo aceptamos peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // El frontend nos dirá a qué URL de Chatwoot llamar y qué datos enviar.
  const { url, body } = req.body;

  // Validamos que el frontend nos haya enviado una URL.
  if (!url) {
    return res.status(400).json({ error: 'La URL de destino es obligatoria.' });
  }

  try {
    // Hacemos la llamada a Chatwoot tal y como nos la pide el frontend.
    // No añadimos ninguna cabecera de autenticación aquí.
    const chatwootResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Si el frontend envió un cuerpo de datos, lo incluimos. Si no, no.
      body: body ? JSON.stringify(body) : null,
    });

    // Devolvemos la respuesta exacta que nos dio Chatwoot.
    const data = await chatwootResponse.json();
    res.status(chatwootResponse.status).json(data);

  } catch (error) {
    console.error('PROXY CRASH:', error);
    res.status(500).json({ error: 'La petición del proxy ha fallado.' });
  }
}
