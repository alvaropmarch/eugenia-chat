// --- CONFIGURACIÓN ---
const CHATWOOT_URL = 'app.chatwoot.com';
const INBOX_IDENTIFIER = '7ACPGX9a461tb9fuKWWh5ij2';
const POLLING_INTERVAL = 3000;

// --- ELEMENTOS DEL DOM ---
const messagesList = document.getElementById('messages-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const loadingIndicator = document.getElementById('loading-indicator');
const typingIndicator = document.getElementById('typing-indicator');
const attachFileButton = document.getElementById('attach-file-button');
const fileInput = document.getElementById('file-input');

// --- GESTIÓN DE ESTADO ---
let messagesState = [];
let contactIdentifier = null;
let conversationId = null;
let pollingTimer = null;
let typingTimer = null;
let lastMessageSentAt = 0;

// --- FUNCIONES ---

/**
 * Renderiza de forma incremental solo los mensajes nuevos.
 */
function renderAllMessages() {
    // Ordena los mensajes por fecha antes de renderizar
    messagesState.sort((a, b) => (a.created_at || a.created_at_utc) - (b.created_at || b.created_at_utc));

    // Obtén los IDs de los mensajes ya renderizados
    const renderedIds = new Set(Array.from(messagesList.querySelectorAll('.message')).map(div => div.dataset.id));

    messagesState.forEach(msg => {
        const msgId = msg.id;
        
        // Si el mensaje ya está renderizado, lo omitimos
        if (renderedIds.has(String(msgId))) return;

        const type = msg.sender && msg.sender.type === 'contact' ? 'outgoing' : 'incoming';
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', type);
        messageDiv.dataset.id = msgId;

        if (msg.attachments && msg.attachments.length > 0) {
            const attachmentLink = document.createElement('a');
            attachmentLink.href = msg.attachments[0].data_url;
            attachmentLink.textContent = msg.content || `Archivo: ${msg.attachments[0].file_name}`;
            attachmentLink.target = '_blank';
            messageDiv.appendChild(attachmentLink);
        } else {
            messageDiv.textContent = msg.content;
        }
        messagesList.appendChild(messageDiv);
    });

    // Gestiona el indicador de typing, asegurando que esté al final
    if (typingIndicator.style.display !== 'none') {
        messagesList.appendChild(typingIndicator);
    }
    
    scrollToBottom();
}


function scrollToBottom() {
    if (messagesList) {
        messagesList.scrollTo({ top: messagesList.scrollHeight, behavior: 'smooth' });
    }
}

async function fetchAllMessages() {
    if (!conversationId) return;
    try {
        const response = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${conversationId}/messages`);
        if (!response.ok) throw new Error('No se pudieron obtener los mensajes.');
        const data = await response.json();

        // Actualizamos el estado de mensajes directamente con la respuesta del servidor
        messagesState = data;

        renderAllMessages();

        // Oculta el indicador de typing si el último mensaje es del bot
        const lastMsg = messagesState[messagesState.length - 1];
        if (lastMsg && (!lastMsg.sender || lastMsg.sender.type !== 'contact')) {
            typingIndicator.style.display = 'none';
            if (typingTimer) clearTimeout(typingTimer);
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

async function ensureConversation() {
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
}

async function handleSendMessageForm(event) {
    event.preventDefault();
    const content = messageInput.value.trim();
    if (!content || !contactIdentifier) return;

    messageInput.value = '';

    const now = Date.now();
    let delay = 3000;
    if (now - lastMessageSentAt < 2000) {
        typingIndicator.style.display = 'none';
        if (typingTimer) clearTimeout(typingTimer);
        delay = 2000;
    }
    lastMessageSentAt = now;

    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        typingIndicator.style.display = 'flex';
        renderAllMessages();
        scrollToBottom();
    }, delay);

    try {
        await ensureConversation();
        await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        // Tras enviar, forzamos un ciclo de polling para que el mensaje aparezca.
        await fetchAllMessages();
    } catch (error) {
        console.error("Error al enviar mensaje:", error);
    }
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        await ensureConversation();
        
        const formData = new FormData();
        formData.append('attachment', file);
        formData.append('conversationId', conversationId);
        if (messageInput.value.trim()) {
            formData.append('content', messageInput.value.trim());
            messageInput.value = '';
        }

        typingIndicator.style.display = 'flex';
        scrollToBottom();

        await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });
        
        // Tras subir el archivo, forzamos un ciclo de polling para que el mensaje aparezca.
        await fetchAllMessages();
    } catch (error) {
        console.error("Error al subir archivo:", error);
        alert('No se pudo subir el archivo.');
    } finally {
        fileInput.value = '';
    }
}

// --- INICIO DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initializeChat();
    messageForm.addEventListener('submit', handleSendMessageForm);
    attachFileButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
});