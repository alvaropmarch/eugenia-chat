$(function () {
  "use strict";

  // La URL de la API ya no se necesita aquí, todas las llamadas pasarán por el proxy.
  window.chatwoot = {
    inboxIdentifier: "7ACPGX9a461tb9fuKWWh5ij2",
  };

  var content = $('#content');
  var input = $('#input');
  var status = $('#status');

  // La conexión WebSocket apunta directamente al servidor de Chatwoot. ¡Esto es correcto!
  var connection = new WebSocket('wss://app.chatwoot.com/cable');

  connection.onopen = async function () {
    try {
      // Estas funciones ahora hablarán con nuestro proxy
      await setUpContact();
      await setUpConversation();
      
      // Una vez tenemos el token del contacto, nos suscribimos a los mensajes
      connection.send(JSON.stringify({
        command: "subscribe",
        identifier: JSON.stringify({
          channel: "RoomChannel",
          pubsub_token: chatwoot.contactPubsubToken
        })
      }));
      input.removeAttr('disabled');
      status.text('Conectado. Envía un mensaje:');
    } catch (error) {
      console.error("La configuración inicial falló:", error);
      status.text('Error de configuración.');
    }
  };

  connection.onerror = function (error) {
    console.error("Error de WebSocket:", error);
    content.html($('<p>', { text: 'Lo sentimos, hay un problema con la conexión o el servidor está caído.' }));
  };

  connection.onmessage = function (message) {
    try {
      var json = JSON.parse(message.data);
      // Ignoramos los mensajes de control del WebSocket
      if (json.type === 'welcome' || json.type === 'ping' || json.type === 'confirm_subscription') return;

      // Procesamos un nuevo mensaje entrante
      if (json.message.event === 'message.created') {
        // Solo mostramos los mensajes entrantes (de un agente), no los nuestros
        if (json.message.data.message_type === 1) { 
          addMessage(json.message.data.sender.name, json.message.data.content);
        }
      }
    } catch (e) {
      console.log('JSON inválido recibido:', message.data);
    }
  };

  // Evento para enviar mensaje al pulsar Enter
  input.keydown(function (e) {
    if (e.keyCode === 13) {
      var msg = $(this).val();
      if (!msg) return;

      sendMessage(msg);
      addMessage("Tú", msg); // Mostramos nuestro propio mensaje inmediatamente
      $(this).val('');
    }
  });

  // Comprobación periódica de la conexión
  setInterval(function () {
    if (connection.readyState !== 1) {
      status.text('Error de conexión');
      input.attr('disabled', 'disabled').val('No se puede comunicar con el servidor WebSocket.');
    }
  }, 3000);

  // Función para añadir un mensaje al chat
  function addMessage(author, message) {
    content.append(`<p><span>${author}</span>: ${message}</p>`);
    content.scrollTop(1000000); // Scroll hacia abajo
  }

  /**
   * 🚀 MODIFICADO: Llama a nuestro proxy para crear o recuperar un contacto
   */
  async function setUpContact() {
    let contactIdentifier = getCookie('contactIdentifier');
    let contactPubsubToken = getCookie('contactPubsubToken');

    if (contactIdentifier && contactPubsubToken) {
      chatwoot.contactIdentifier = contactIdentifier;
      chatwoot.contactPubsubToken = contactPubsubToken;
      return;
    }

    try {
      const response = await fetch('/api/chatwoot', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'create_contact',
          payload: { inboxIdentifier: chatwoot.inboxIdentifier }
        })
      });

      if (!response.ok) throw new Error(`El proxy devolvió un error: ${response.status}`);
      
      const data = await response.json();
      chatwoot.contactIdentifier = data.source_id;
      chatwoot.contactPubsubToken = data.pubsub_token;

      setCookie('contactIdentifier', data.source_id, 30);
      setCookie('contactPubsubToken', data.pubsub_token, 30);

    } catch (error) {
      console.error("Error al configurar el contacto vía proxy:", error);
      throw error; // Lanzamos el error para detener la ejecución si falla
    }
  }

  /**
   * 🚀 MODIFICADO: Llama a nuestro proxy para crear una conversación
   */
  async function setUpConversation() {
    let contactConverstion = getCookie('contactConverstion');
    if (contactConverstion) {
      chatwoot.contactConverstion = contactConverstion;
      return;
    }

    try {
      const response = await fetch('/api/chatwoot', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'create_conversation',
          payload: { 
            inboxIdentifier: chatwoot.inboxIdentifier,
            contactIdentifier: chatwoot.contactIdentifier
          }
        })
      });

      if (!response.ok) throw new Error(`El proxy devolvió un error: ${response.status}`);

      const data = await response.json();
      chatwoot.contactConverstion = data.id;
      setCookie('contactConverstion', data.id, 30);

    } catch (error) {
      console.error("Error al configurar la conversación vía proxy:", error);
      throw error; // Lanzamos el error
    }
  }

  /**
   * 🚀 MODIFICADO: Llama a nuestro proxy para enviar un mensaje
   */
  async function sendMessage(msg) {
    if (!chatwoot.contactConverstion) {
      console.error("No se puede enviar el mensaje. La conversación no está definida.");
      return;
    }

    try {
      await fetch('/api/chatwoot', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'send_message',
          payload: {
            inboxIdentifier: chatwoot.inboxIdentifier,
            contactIdentifier: chatwoot.contactIdentifier,
            conversationId: chatwoot.contactConverstion,
            content: msg
          }
        })
      });

    } catch (error) {
      console.error("Error al enviar el mensaje vía proxy:", error);
    }
  }

  /**
   * 🍪 Funciones de cookies (sin cambios)
   */
  function setCookie(name, value, days) {
    let expires = "";
    if (days) {
      let date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
  }

  function getCookie(name) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }
});
