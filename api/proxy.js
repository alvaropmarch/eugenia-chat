// api/proxy.js (Versión Robusta con Mejor Manejo de Errores)

export default async function handler(req, res) {
  // Solo aceptamos peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url, body } = req.body;

  // Validamos que el frontend nos haya enviado una URL.
  if (!url) {
    console.error("[PROXY] Petición recibida sin una URL de destino.");
    return res.status(400).json({ error: 'La URL de destino es obligatoria.' });
  }

  console.log(`[PROXY] Reenviando petición a: ${url}`);

  try {
    const chatwootResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Si el frontend envió un cuerpo de datos, lo incluimos. Si no, no.
      body: body ? JSON.stringify(body) : null,
    });

    // Leemos la respuesta de Chatwoot
    const responseText = await chatwootResponse.text();
    
    console.log(`[PROXY] Respuesta recibida de Chatwoot con estado: ${chatwootResponse.status}`);

    // Si la respuesta no fue exitosa, registramos el error para poder verlo en Vercel.
    if (!chatwootResponse.ok) {
       console.error("[PROXY] La API de Chatwoot devolvió un error:", responseText);
    }
    
    // Devolvemos la respuesta exacta que nos dio Chatwoot al frontend.
    // Es importante establecer la cabecera Content-Type correcta.
    res.setHeader('Content-Type', 'application/json');
    res.status(chatwootResponse.status).send(responseText);

  } catch (error) {
    console.error('[PROXY] Ocurrió un error inesperado:', error);
    res.status(500).json({ error: 'La petición del proxy ha fallado.', details: error.message });
  }
}
