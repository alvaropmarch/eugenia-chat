// api/proxy.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url, body } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'La URL de destino es obligatoria.' });
  }

  try {
    const chatwootResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : null,
    });

    const responseText = await chatwootResponse.text();
    
    res.setHeader('Content-Type', 'application/json');
    res.status(chatwootResponse.status).send(responseText);

  } catch (error) {
    res.status(500).json({ error: 'La petición del proxy ha fallado.', details: error.message });
  }
}
