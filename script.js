// --- CONFIGURACIÓN ---
const CHATWOOT_URL = 'app.chatwoot.com';
const INBOX_IDENTIFIER = '7ACPGX9a461tb9fuKWWh5ij2';
const POLLING_INTERVAL = 3000; // Preguntar cada 3 segundos

// --- ELEMENTOS DEL DOM ---
const messagesList = document.getElementById('messages-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const loadingIndicator = document.getElementById('loading-indicator');

// --- GESTIÓN DE ESTADO ---
let messagesState = [];
let contactIdentifier = null;
let conversationId = null;
let pollingTimer = null;

// --- FUNCIONES ---

function renderAllMessages() {
    messagesState.sort((a, b) => a.created_at - b.created_at);

    // Solo redibujamos si hay un cambio real en el número de mensajes
    if (messagesList.children.length === messagesState.length) {
        return; 
    }

    messagesList.innerHTML = '';
    messagesState.forEach(msg => {
        const type = msg.sender && msg.sender.type === 'contact' ? 'outgoing' : 'incoming';
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', type);
        messageDiv.textContent = msg.content;
        messagesList.appendChild(messageDiv);
    });
    scrollToBottom();
}

function scrollToBottom() {
    if (messagesList) {
        messagesList.scrollTo({
            top: messagesList.scrollHeight,
            behavior: 'smooth'
        });
    }
}

async function fetchAllMessages() {
    if (!conversationId) return;
    try {
        const response = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${conversationId}/messages`);
        if (!response.ok) throw new Error('No se pudieron obtener los mensajes.');
        
        const data = await response.json();
        
        // Solo actualizamos el estado y volvemos a renderizar si hay mensajes nuevos
        if (data.length > messagesState.length) {
            messagesState = data;
            renderAllMessages();
        }
    } catch (error) {
        console.error("Error durante el sondeo de mensajes:", error);
    }
}

async function initializeChat() {
    try {
        const contactResponse = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `Visitante ${Math.floor(Math.random() * 1000)}` }),
        });
        if (!contactResponse.ok) throw new Error('Error al crear el contacto.');
        const contact = await contactResponse.json();
        contactIdentifier = contact.source_id;
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    } catch (error) {
        if (loadingIndicator) loadingIndicator.textContent = `Error al iniciar: ${error.message}`;
        console.error(error);
    }
}

async function handleSendMessage(event) {
    event.preventDefault();
    const content = messageInput.value.trim();
    if (!content || !contactIdentifier) return;
    
    const messageContent = content;
    messageInput.value = '';

    // 1. Creamos y mostramos el mensaje optimista UNA SOLA VEZ
    const optimisticMessage = {
        id: `optimistic-${Date.now()}`, // ID temporal único
        content: messageContent,
        sender: { type: 'contact' },
        created_at: Date.now() / 1000,
    };
    messagesState.push(optimisticMessage);
    renderAllMessages();

    try {
        // 2. Si no hay conversación, la creamos e iniciamos el sondeo
        if (!conversationId) {
            const convResponse = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations`, {
                method: 'POST',
            });
            if (!convResponse.ok) throw new Error('Error al crear la conversación.');
            const conversation = await convResponse.json();
            conversationId = conversation.id;
            if (pollingTimer) clearInterval(pollingTimer);
            pollingTimer = setInterval(fetchAllMessages, POLLING_INTERVAL);
        }

        // 3. Enviamos el mensaje real al servidor
        const response = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: messageContent }),
        });
        
        const sentMessage = await response.json();
        
        // 4. Buscamos nuestro mensaje optimista y lo reemplazamos por el real del servidor
        // Esto actualiza el ID sin necesidad de volver a renderizar toda la lista.
        const index = messagesState.findIndex(m => m.id === optimisticMessage.id);
        if (index !== -1) {
            messagesState[index] = sentMessage;
        }
        
    } catch (error) {
        console.error("Error al enviar mensaje:", error);
        // Opcional: eliminar el mensaje optimista si falla el envío
        messagesState = messagesState.filter(m => m.id !== optimisticMessage.id);
        renderAllMessages();
    }
}

// --- INICIO DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initializeChat();
    messageForm.addEventListener('submit', handleSendMessage);
});