// frontend.js (CORREGIDO)

$(function () {
  "use strict";

  window.chatwoot = {
    inboxIdentifier: "7ACPGX9a461tb9fuKWWh5ij2",
    chatwootAPIHost: "https://app.chatwoot.com/api/v1",
  };

  var content = $('#content');
  var input = $('#input');
  var status = $('#status');

  var connection = new WebSocket('wss://app.chatwoot.com/cable');

  connection.onopen = async function () {
    try {
      await setUpContact();
      await setUpConversation();
      
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
      status.text('Error de configuración. Revisa la consola.');
    }
  };

  connection.onerror = function (error) {
    console.error("Error de WebSocket:", error);
    content.html($('<p>', { text: 'Lo sentimos, hay un problema con la conexión o el servidor está caído.' }));
  };

  connection.onmessage = function (message) {
    try {
      var json = JSON.parse(message.data);
      if (json.type === 'welcome' || json.type === 'ping' || json.type === 'confirm_subscription') return;

      if (json.message.event === 'message.created') {
        if (json.message.data.message_type === 1) {
          addMessage(json.message.data.sender.name, json.message.data.content);
        }
      }
    } catch (e) {
      console.log('JSON inválido recibido:', message.data);
    }
  };

  input.keydown(function (e) {
    if (e.keyCode === 13) {
      var msg = $(this).val();
      if (!msg) return;
      sendMessage(msg);
      addMessage("Tú", msg);
      $(this).val('');
    }
  });

  setInterval(function () {
    if (connection.readyState !== 1) {
      status.text('Error de conexión');
      input.attr('disabled', 'disabled').val('No se puede comunicar con el servidor WebSocket.');
    }
  }, 3000);

  function addMessage(author, message) {
    content.append(`<p><span>${author}</span>: ${message}</p>`);
    content.scrollTop(1000000);
  }

  async function callProxy(targetUrl, body = null) {
    const response = await fetch('/api/proxy', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, body: body }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("El proxy devolvió un error:", responseData);
      throw new Error(`El proxy devolvió un error: ${response.status}`);
    }
    return responseData;
  }

  async function setUpContact() {
    let contactIdentifier = getCookie('contactIdentifier');
    let contactPubsubToken = getCookie('contactPubsubToken');

    if (contactIdentifier && contactPubsubToken) {
      chatwoot.contactIdentifier = contactIdentifier;
      chatwoot.contactPubsubToken = contactPubsubToken;
      return;
    }

    try {
      const targetUrl = `${chatwoot.chatwootAPIHost}/inboxes/${chatwoot.inboxIdentifier}/contacts`;
      const data = await callProxy(targetUrl);
      
      chatwoot.contactIdentifier = data.source_id;
      chatwoot.contactPubsubToken = data.pubsub_token;

      setCookie('contactIdentifier', data.source_id, 30);
      setCookie('contactPubsubToken', data.pubsub_token, 30);
    } catch (error) {
      console.error("Error al configurar el contacto vía proxy:", error);
      throw error;
    }
  }

  async function setUpConversation() {
    let contactConverstion = getCookie('contactConverstion');
    if (contactConverstion) {
      chatwoot.contactConverstion = contactConverstion;
      return;
    }

    try {
      const targetUrl = `${chatwoot.chatwootAPIHost}/inboxes/${chatwoot.inboxIdentifier}/contacts/${chatwoot.contactIdentifier}/conversations`;
      const data = await callProxy(targetUrl);

      chatwoot.contactConverstion = data.id;
      setCookie('contactConverstion', data.id, 30);
    } catch (error) {
      console.error("Error al configurar la conversación vía proxy:", error);
      throw error;
    }
  }

  async function sendMessage(msg) {
    if (!chatwoot.contactConverstion) return;

    try {
      const targetUrl = `${chatwoot.chatwootAPIHost}/inboxes/${chatwoot.inboxIdentifier}/contacts/${chatwoot.contactIdentifier}/conversations/${chatwoot.contactConverstion}/messages`;
      await callProxy(targetUrl, { content: msg });
    } catch (error) {
      console.error("Error al enviar el mensaje vía proxy:", error);
    }
  }

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
