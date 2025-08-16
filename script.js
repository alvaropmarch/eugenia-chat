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
const initialHeader = document.querySelector('.initial-header');
const footDiv = document.querySelector('.foot-div');

// Configura marked.js para que respete los saltos de línea
marked.setOptions({
  breaks: true
});

// --- GESTIÓN DE ESTADO ---
const state = {
    messages: [],
    contactIdentifier: null,
    conversationId: null,
    pollingTimer: null,
    typingTimer: null,
    lastMessageSentat: 0,
    isWaitingForResponse: false,
    isChatActive: false,
};

// --- FUNCIONES ---

/**
 * Renderiza los mensajes que aún no están en el DOM.
 * MODIFICADO: Ahora también maneja estados de 'pending' y 'error' para la carga de archivos.
 */
function renderNewMessages() {
    state.messages.sort((a, b) => a.created_at - b.created_at);
    
    const typingIndicatorIsVisible = typingIndicator.style.display !== 'none';
    if (typingIndicatorIsVisible && typingIndicator.parentNode) {
        typingIndicator.parentNode.removeChild(typingIndicator);
    }
    
    // Limpiamos la lista para redibujar y evitar duplicados/problemas de actualización
    messagesList.innerHTML = ''; 

    state.messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const type = msg.sender && msg.sender.type === 'contact' ? 'outgoing' : 'incoming';
        
        messageDiv.classList.add('message', type);
        messageDiv.dataset.id = String(msg.id);

        // --- LÓGICA NUEVA: RENDERIZADO CONDICIONAL ---
        if (msg.status === 'pending') {
            messageDiv.classList.add('uploading-placeholder');
            messageDiv.innerHTML = `
                <div class="upload-spinner"></div>
                <div class="upload-file-info">
                    <span class="upload-file-name">${msg.fileName || 'Subiendo archivo...'}</span>
                    <span class="upload-status-text">Cargando...</span>
                </div>
            `;
        } else if (msg.status === 'error') {
            messageDiv.classList.add('uploading-placeholder', 'error');
            messageDiv.innerHTML = `
                <div class="upload-file-info">
                    <span class="upload-file-name">${msg.fileName || 'Archivo'}</span>
                    <span class="upload-status-text">Error al subir. Inténtalo de nuevo.</span>
                </div>
            `;
        } else if (msg.attachments && msg.attachments.length > 0) {
            // Lógica existente para adjuntos (imágenes y archivos)
            messageDiv.classList.remove('message'); // Quitamos padding/fondo por defecto
            const attachment = msg.attachments[0];
            
            if (attachment.file_type === 'image') {
                const attachmentLink = document.createElement('a');
                attachmentLink.href = attachment.data_url;
                attachmentLink.target = '_blank';
                attachmentLink.rel = 'noopener noreferrer';
                
                const img = document.createElement('img');
                img.src = attachment.data_url;
                img.alt = attachment.file_name || 'Imagen adjunta';
                img.classList.add('message-image');
                attachmentLink.appendChild(img);
                messageDiv.appendChild(attachmentLink);

                if (msg.content) {
                    const caption = document.createElement('span');
                    caption.classList.add('message-caption');
                    caption.textContent = msg.content;
                    messageDiv.appendChild(caption);
                }
            } else {
                const fileName = attachment.file_name || 'Archivo adjunto';
                const attachmentLink = document.createElement('a');
                attachmentLink.href = attachment.data_url;
                attachmentLink.target = '_blank';
                attachmentLink.rel = 'noopener noreferrer';
                attachmentLink.classList.add('file-attachment-link');

                const fileBox = document.createElement('div');
                fileBox.classList.add('file-attachment');

                const iconSpan = document.createElement('span');
                iconSpan.classList.add('file-icon');
                iconSpan.textContent = '📄';
                
                const nameSpan = document.createElement('span');
                nameSpan.classList.add('file-name');
                nameSpan.textContent = fileName;

                fileBox.appendChild(iconSpan);
                fileBox.appendChild(nameSpan);
                attachmentLink.appendChild(fileBox);
                messageDiv.appendChild(attachmentLink);
                
                if (msg.content) {
                    const caption = document.createElement('span');
                    caption.classList.add('message-caption');
                    caption.textContent = msg.content;
                    messageDiv.appendChild(caption);
                }
            }
        } else {
            // Lógica existente para mensajes de texto
            messageDiv.innerHTML = marked.parse(msg.content || '');
        }
        
        messagesList.appendChild(messageDiv);
    });
    
    if (typingIndicatorIsVisible) {
        messagesList.appendChild(typingIndicator);
    }
    
    scrollToBottom();
}

/**
 * Hace scroll suave hacia el final de la lista de mensajes.
 */
function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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

        if (data.length > state.messages.length) {
            state.messages = data;
            renderNewMessages();
        }

        const lastMsg = data[data.length - 1];
        if (lastMsg && lastMsg.message_type !== 0) {
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
    if (state.conversationId) return;
    
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
        renderNewMessages();
    }, 1000);
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
        renderNewMessages();
        messageInput.value = '';
    } catch (error) {
        console.error("Error al enviar mensaje:", error);
        setFormDisabled(false);
    }
}

/**
 * Gestiona la selección y subida de un archivo.
 * MODIFICADO: Ahora muestra un placeholder de carga y lo actualiza al terminar.
 */
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (state.isWaitingForResponse) {
        alert("Por favor, espera una respuesta antes de enviar otro archivo.");
        return;
    }

    setFormDisabled(true);
    // Ya no mostramos el indicador de "escribiendo", sino el placeholder
    // showTypingIndicatorWithDelay(); 

    // --- LÓGICA NUEVA: CREACIÓN DEL PLACEHOLDER ---
    const tempId = `temp_${Date.now()}`;
    const placeholderMessage = {
        id: tempId,
        status: 'pending',
        fileName: file.name,
        created_at: Date.now() / 1000,
        sender: { type: 'contact' } // Para que se alinee a la derecha
    };
    state.messages.push(placeholderMessage);
    renderNewMessages();
    await initializeChatIfNeeded();

    try {
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

        // --- LÓGICA DE ACTUALIZACIÓN DEL PLACEHOLDER ---
        const messageIndex = state.messages.findIndex(m => m.id === tempId);

        if (!response.ok) {
            const contentType = response.headers.get('content-type');
            let errorMessage = 'El archivo es demasiado grande o el servidor ha fallado.';
            if (contentType && contentType.indexOf('application/json') !== -1) {
                const errorResult = await response.json();
                errorMessage = errorResult.error || 'Ha ocurrido un error desconocido.';
            }
             if (messageIndex > -1) {
                state.messages[messageIndex].status = 'error';
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        // Reemplazamos el placeholder por el mensaje real del servidor
        if (messageIndex > -1) {
            state.messages[messageIndex] = result.data;
        } else {
            state.messages.push(result.data);
        }
        
        renderNewMessages();
        messageInput.value = '';
        setFormDisabled(false);

    } catch (error) {
        console.error("Error al subir archivo:", error.message);
        // El estado de error ya se ha establecido, solo renderizamos
        renderNewMessages();
        setFormDisabled(false);
    } finally {
        fileInput.value = '';
    }
}

/**
 * Cambia el layout de la página para mostrar el chat activo.
 */
function activateChatLayout() {
    if (state.isChatActive) return;
    
    initialHeader.style.display = 'none';
    quickActionsContainer.style.display = 'none';
    messagesList.style.display = 'flex';
    body.classList.add('chat-active');
    
    state.isChatActive = true;
}

/**
 * Ajusta el padding inferior del main-content según la altura del foot-div.
 */
function adjustMainContentPadding() {
    if (footDiv) {
        const footDivHeight = footDiv.offsetHeight;
        mainContent.style.paddingBottom = `${footDivHeight + 20}px`; // +20px para un poco de espacio extra
    }
}

// --- AÑADIDO: FUNCIÓN PARA MOSTRAR NOTIFICACIONES TOAST ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // 1. Crea el elemento del toast
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;

    // 2. Añádelo al contenedor
    container.appendChild(toast);

    // 3. Programa su desaparición
    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000); // El toast durará 3 segundos
}


// --- INICIO DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    function setVh() {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    }

    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('resize', adjustMainContentPadding);

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
            handleSendMessageForm(new Event('submit'));
        });
    });

    adjustMainContentPadding();

    // --- AÑADIDO: LÓGICA PARA EL BOTÓN DE INICIAR SESIÓN ---
    const loginButton = document.querySelector('.cta-button.secondary');
    if (loginButton) {
        loginButton.addEventListener('click', (event) => {
            event.preventDefault(); 
            showToast('Próximamente');
        });
    }
});