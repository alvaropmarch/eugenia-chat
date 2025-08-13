document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURACIÓN ---
    // ¡IMPORTANTE! Estos valores los configurarás en Vercel como variables de entorno.
    // Para pruebas locales, puedes ponerlos aquí directamente.
    const CHATWOOT_URL = 'https://app.chatwoot.com'; // O tu URL si es auto-alojado
    const WEBSITE_TOKEN = 'TU_WEBSITE_TOKEN';      // El token de tu canal "Website"

    // --- ELEMENTOS DEL DOM ---
    const sendButton = document.getElementById('send-button');
    const chatInput = document.getElementById('chat-input');
    const messagesContainer = document.getElementById('chat-messages');

    // --- LÓGICA DEL CHAT ---
    const api = {
        contact: null,
        conversation: null,
    };

    // Carga la conversación existente desde localStorage si existe
    const loadConversation = () => {
        const storedContact = localStorage.getItem('chatwoot_contact');
        if (storedContact) {
            api.contact = JSON.parse(storedContact);
        }
    };

    // Función para crear un nuevo contacto (y su primera conversación)
    const createNewContact = async (message) => {
        try {
            const response = await fetch(`${CHATWOOT_URL}/api/v1/widget/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'website-token': WEBSITE_TOKEN },
                body: JSON.stringify({
                    // Puedes añadir más info si la tienes (email, nombre)
                    // source_id: `alguna-id-unica-de-tu-app`,
                    message: { content: message }
                }),
            });
            if (!response.ok) throw new Error('Error al crear el contacto');

            const data = await response.json();
            api.contact = data;
            // Guardamos el contacto en localStorage para no perderlo
            localStorage.setItem('chatwoot_contact', JSON.stringify(data));
        } catch (error) {
            console.error('Chatwoot API Error:', error);
            // Aquí podrías mostrar un mensaje de error en la UI
        }
    };

    // Función para enviar un mensaje a una conversación existente
    const postMessageToConversation = async (message) => {
        try {
            const contactPubsubToken = api.contact.pubsub_token;
            const conversationId = api.contact.conversations[0].id;

            await fetch(`${CHATWOOT_URL}/api/v1/widget/contacts/${contactPubsubToken}/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message }),
            });
        } catch (error) {
            console.error('Chatwoot API Error:', error);
        }
    };

    // Añade el mensaje a la interfaz gráfica
    const addMessageToUI = (message) => {
        const messageElement = document.createElement('div');
        messageElement.className = 'user-message';
        messageElement.textContent = message;
        messagesContainer.appendChild(messageElement);
        // Mueve el scroll hacia abajo
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };


    const handleSendMessage = async () => {
        const messageText = chatInput.value.trim();
        if (messageText === '') return;

        addMessageToUI(messageText);
        chatInput.value = '';

        if (!api.contact) {
            // Si es el primer mensaje, crea el contacto
            await createNewContact(messageText);
        } else {
            // Si ya existe, solo envía el mensaje
            await postMessageToConversation(messageText);
        }
    };

    // --- EVENT LISTENERS ---
    sendButton.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });

    // Inicia cargando la conversación al cargar la página
    loadConversation();
});