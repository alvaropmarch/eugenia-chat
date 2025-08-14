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

// --- GESTIÓN DE ESTADO ---
const state = {
    messages: [],
    contactIdentifier: null,
    conversationId: null,
    pollingTimer: null,
    typingTimer: null,
    lastMessageSentAt: 0,
    isWaitingForResponse: false,
    isChatActive: false,
};

// --- FUNCIONES ---

/**
 * Renderiza todos los mensajes en la lista, ordenados por fecha.
 */
function renderAllMessages() {
    state.messages.sort((a, b) => a.created_at - b.created_at);
    
    // Guardamos una referencia al indicador de escritura si existe
    const typingIndicatorIsVisible = typingIndicator.style.display !== 'none';
    messagesList.innerHTML = ''; 

    state.messages.forEach(msg => {
        const type = msg.sender && msg.sender.type === 'contact' ? 'outgoing' : 'incoming';
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', type);
        messageDiv.dataset.id = String(msg.id);

        // Si el mensaje tiene adjuntos, crea un enlace
        if (msg.attachments && msg.attachments.length > 0) {
            const attachment = msg.attachments[0];
            const attachmentLink = document.createElement('a');
            attachmentLink.href = attachment.data_url;
            attachmentLink.target = '_blank';
            attachmentLink.rel = 'noopener noreferrer';

            // Comprueba si es una imagen para mostrar una miniatura
            if (attachment.file_type === 'image') {
                const img = document.createElement('img');
                img.src = attachment.data_url;
                img.alt = attachment.file_name || 'Imagen adjunta';
                img.classList.add('message-image');
                attachmentLink.appendChild(img);
                if (msg.content) {
                    const caption = document.createElement('span');
                    caption.textContent = msg.content;
                    attachmentLink.appendChild(caption);
                }
            } else {
                // Para otros archivos, muestra el texto o el nombre del archivo
                attachmentLink.textContent = msg.content || `Archivo: ${attachment.file_name}`;
            }
            messageDiv.appendChild(attachmentLink);
        } else {
            // Si no hay adjuntos, solo muestra el texto
            messageDiv.textContent = msg.content;
        }
        
        // Usamos prepend para que con CSS (column-reverse) aparezcan abajo
        messagesList.prepend(messageDiv);
    });
    
    // Volvemos a añadir el indicador si estaba visible
    if (typingIndicatorIsVisible) {
        messagesList.prepend(typingIndicator);
    }
    
    scrollToBottom();
}

/**
 * Hace scroll suave hacia el final de la lista de mensajes.
 */
function scrollToBottom() {
    if (messagesList) {
        messagesList.scrollTo({ top: messagesList.scrollHeight, behavior: 'smooth' });
    }
}

/**
 * Busca nuevos mensajes del agente a intervalos regulares.
 */
async function fetchAllMessages() {
    if (!state.conversationId || !state.contactIdentifier) return;
    try {
        const response = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${state.contactIdentifier}/conversations/${state.conversationId}/messages`);
        if (!response.ok) throw new Error('No se pudieron obtener los mensajes.');
        const data = await response.json();

        // Evita re-renderizar si no hay mensajes nuevos
        if (data.length > state.messages.length) {
            state.messages = data;
            renderAllMessages();
        }

        // Si el último mensaje es del agente, para el indicador de "escribiendo"
        const lastMsg = data[data.length - 1];
        if (lastMsg && lastMsg.message_type !== 0) { // 0 es 'outgoing'
            typingIndicator.style.display = 'none';
            if (state.typingTimer) clearTimeout(state.typingTimer);
            setFormDisabled(false);
            state.isWaitingForResponse = false;
        }
    } catch (error) {
        console.error("Error durante el sondeo de mensajes:", error);
    }
}

/**
 * Se asegura de que exista una conversación activa.
 */
async function ensureConversation() {
    if (state.conversationId) return; // Si ya tenemos una, no hace nada
    
    const convResponse = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${state.contactIdentifier}/conversations`, {
        method: 'POST',
    });
    if (!convResponse.ok) throw new Error('Error al crear la conversación.');
    const conversation = await convResponse.json();
    state.conversationId = conversation.id;
    
    if (state.pollingTimer) clearInterval(state.pollingTimer);
    state.pollingTimer = setInterval(fetchAllMessages, POLLING_INTERVAL);
}

/**
 * Crea el contacto si no existe, y activa el layout del chat.
 */
async function initializeChatIfNeeded() {
    if (state.isChatActive) {
        await ensureConversation();
        return;
    }

    if (!state.contactIdentifier) {
        const contactResponse = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `Visitante ${Math.floor(Math.random() * 1000)}` }),
        });
        if (!contactResponse.ok) throw new Error('Error al crear el contacto.');
        const contact = await contactResponse.json();
        state.contactIdentifier = contact.source_id;
    }
    
    activateChatLayout();
    await ensureConversation();
}

/**
 * Activa o desactiva los controles del formulario.
 */
function setFormDisabled(isDisabled) {
    messageInput.disabled = isDisabled;
    messageForm.querySelector('button[type="submit"]').disabled = isDisabled;
    attachFileButton.disabled = isDisabled;
    state.isWaitingForResponse = isDisabled;
}

/**
 * Muestra el indicador de "escribiendo" con un pequeño retardo.
 */
function showTypingIndicatorWithDelay() {
    if (state.typingTimer) clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
        typingIndicator.style.display = 'flex';
        renderAllMessages(); // Re-renderizar para añadir el indicador
    }, 1000); // Un retardo simple de 1 segundo
}

/**
 * Gestiona el envío de un mensaje de texto.
 */
async function handleSendMessageForm(event) {
    event.preventDefault();
    const content = messageInput.value.trim();
    if (!content || state.isWaitingForResponse) return;

    setFormDisabled(true);
    showTypingIndicatorWithDelay();

    try {
        await initializeChatIfNeeded();
        const response = await fetch(`https://${CHATWOOT_URL}/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/${state.contactIdentifier}/conversations/${state.conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        if (!response.ok) throw new Error('Error en la API al enviar mensaje.');
        const newMessage = await response.json();
        
        state.messages.push(newMessage);
        renderAllMessages();
        messageInput.value = ''; // Limpiar el input después de enviar
    } catch (error) {
        console.error("Error al enviar mensaje:", error);
        setFormDisabled(false); // Reactivar formulario en caso de error
    }
}

/**
 * Gestiona la selección y subida de un archivo.
 */
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (state.isWaitingForResponse) {
        alert("Por favor, espera una respuesta antes de enviar otro archivo.");
        return;
    }

    setFormDisabled(true);
    showTypingIndicatorWithDelay();

    try {
        await initializeChatIfNeeded();
        
        const formData = new FormData();
        formData.append('attachment', file);
        formData.append('conversationId', state.conversationId);
        
        const textContent = messageInput.value.trim();
        if (textContent) {
            formData.append('content', textContent);
        }

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Error desconocido al subir el archivo.');
        }

        state.messages.push(result.data);
        renderAllMessages();
        messageInput.value = '';

    } catch (error) {
        console.error("Error al subir archivo:", error.message);
        alert(`No se pudo subir el archivo: ${error.message}`);
        
        // Si hay un error, ocultamos el indicador de "escribiendo" y reactivamos el form
        typingIndicator.style.display = 'none';
        setFormDisabled(false);
    } finally {
        // Limpiamos el valor del input para poder seleccionar el mismo archivo otra vez
        fileInput.value = '';
    }
}

/**
 * Cambia el layout de la página para mostrar el chat activo.
 */
function activateChatLayout() {
    if (state.isChatActive) return;
    
    body.classList.add('chat-active');
    messagesList.style.display = 'flex';
    if (quickActionsContainer) {
        quickActionsContainer.style.display = 'none';
    }
    state.isChatActive = true;
}

// --- INICIO DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    function setVh() {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    }

    setVh();
    window.addEventListener('resize', setVh);

    const defaultMessage = "Hola! Quiero ahorrar en mi factura de la luz";
    messageInput.value = defaultMessage;
    
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
            messageInput.focus();
        });
    });
});