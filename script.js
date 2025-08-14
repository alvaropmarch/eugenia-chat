// --- CONFIGURACIÓN ---
const CHATWOOT_URL = 'support.v2charge.com';
const INBOX_IDENTIFIER = '4uYj27uPSc8DmYuYcZ4tL1LT';
const POLLING_INTERVAL = 3000;

// --- ELEMENTOS DEL DOM ---
const messagesList = document.getElementById('messages-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const attachFileButton = document.getElementById('attach-file-button');
const fileInput = document.getElementById('file-input');
const quickActionButtons = document.querySelectorAll('.quick-action-button');
const quickActionsContainer = document.querySelector('.quick-actions');
const body = document.body;
const mainContent = document.getElementById('main-content');
const fixedHeader = document.querySelector('.fixed-header');
const initialHeader = document.querySelector('.initial-header');
const fadeOverlay = document.querySelector('.fade-overlay');
const cookieNotice = document.querySelector('.cookie-notice');

// --- GESTIÓN DE ESTADO ---
let messagesState = [];
let contactIdentifier = null;
let conversationId = null;
let pollingTimer = null;
let typingTimer = null;
let lastMessageSentAt = 0;
let isWaitingForResponse = false;
let isFirstMessageSent = false;

// --- FUNCIONES ---

/**
 * Renderiza de forma incremental solo los mensajes nuevos.
 */
function renderAllMessages() {
    messagesState.sort((a, b) => (a.created_at || a.created_at_utc) - (b.created_at || b.created_at_utc));
    const renderedIds = new Set(Array.from(messagesList.querySelectorAll('.message')).map(div => div.dataset.id));

    messagesState.forEach(msg => {
        const msgId = msg.id;
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
        // Cambio para que los nuevos mensajes se añadan al principio de la lista.
        // Esto, junto con el CSS flex-direction: column-reverse, hará que se muestren en la parte inferior.
        messagesList.prepend(messageDiv);
    });

    if (typingIndicator.style.display !== 'none') {
        // También usamos prepend para que el indicador de escritura aparezca en la parte inferior.
        messagesList.prepend(typingIndicator);
    }
    
    // Llamada a la función de scroll para que el foco esté en los mensajes nuevos.
    scrollToBottom();
}

/**
 * Hace scroll hacia la parte inferior de la lista de mensajes.
 */
function scrollToBottom() {
    if (messagesList) {
        // Usa `scrollHeight` para asegurar que el scroll vaya hasta el final.
        messagesList.scrollTo({ top: messagesList.scrollHeight, behavior: 'smooth' });
    }
}

async function fetchAllMessages() {
    if (!conversationId) return;
    try {
        const response = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${conversationId}/messages`);
        if (!response.ok) throw new Error('No se pudieron obtener los mensajes.');
        const data = await response.json();

        messagesState = data;
        renderAllMessages();

        const lastMsg = messagesState[messagesState.length - 1];
        if (lastMsg && (!lastMsg.sender || lastMsg.sender.type !== 'contact')) {
            typingIndicator.style.display = 'none';
            if (typingTimer) clearTimeout(typingTimer);
            messageInput.disabled = false;
            messageForm.querySelector('button').disabled = false;
            isWaitingForResponse = false;
        }
    } catch (error) {
        console.error("Error durante el sondeo de mensajes:", error);
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
    if (!content || isWaitingForResponse) return;

    if (!contactIdentifier) {
        console.log("Iniciando conversación...");
        try {
            const contactResponse = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `Visitante ${Math.floor(Math.random() * 1000)}` }),
            });
            if (!contactResponse.ok) throw new Error('Error al crear el contacto.');
            const contact = await contactResponse.json();
            contactIdentifier = contact.source_id;
        } catch (error) {
            console.error(`Error al iniciar: ${error.message}`);
            return;
        }
    }

    activateChatLayout();

    if (quickActionsContainer) {
        quickActionsContainer.style.display = 'none';
    }

    messageInput.disabled = true;
    messageForm.querySelector('button').disabled = true;
    isWaitingForResponse = true;

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
        await fetchAllMessages();
    } catch (error) {
        console.error("Error al enviar mensaje:", error);
        messageInput.disabled = false;
        messageForm.querySelector('button').disabled = false;
        isWaitingForResponse = false;
    }
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file || isWaitingForResponse) return;

    if (!contactIdentifier) {
        console.log("Iniciando conversación...");
        try {
            const contactResponse = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `Visitante ${Math.floor(Math.random() * 1000)}` }),
            });
            if (!contactResponse.ok) throw new Error('Error al crear el contacto.');
            const contact = await contactResponse.json();
            contactIdentifier = contact.source_id;
        } catch (error) {
            console.error(`Error al iniciar: ${error.message}`);
            return;
        }
    }

    try {
        activateChatLayout();

        if (quickActionsContainer) {
            quickActionsContainer.style.display = 'none';
        }

        messageInput.disabled = true;
        messageForm.querySelector('button').disabled = true;
        isWaitingForResponse = true;
        
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
        
        await fetchAllMessages();
    } catch (error) {
        console.error("Error al subir archivo:", error);
        alert('No se pudo subir el archivo.');
    } finally {
        fileInput.value = '';
    }
}

// Función para activar el layout del chat después del primer mensaje
function activateChatLayout() {
    if (!isFirstMessageSent) {
        body.classList.add('chat-active');
        messagesList.style.display = 'flex'; // Muestra la lista de mensajes
        isFirstMessageSent = true;
    }
}

// --- INICIO DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // Código para gestionar la altura del viewport en iOS
    function setVh() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    setVh();
    window.addEventListener('resize', setVh);

    const defaultMessage = "Hola! Quiero ahorrar en mi factura de la luz";
    messageInput.value = defaultMessage;
    
    // Asignar el botón activo por defecto al cargar la página
    const defaultButton = document.querySelector('.quick-action-button');
    if (defaultButton) {
        defaultButton.classList.add('is-active');
    }
    
    messageForm.addEventListener('submit', handleSendMessageForm);
    attachFileButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    quickActionButtons.forEach(button => {
        button.addEventListener('click', () => {
            quickActionButtons.forEach(btn => btn.classList.remove('is-active'));
            button.classList.add('is-active');
            
            messageInput.value = button.dataset.message;
        });
    });
});