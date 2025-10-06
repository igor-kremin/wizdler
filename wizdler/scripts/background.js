// scripts/background.js  (MV3 service worker)

chrome.runtime.onInstalled.addListener(() => {
  // Можна додати ініціалізацію правил/стану тут за потреби
});

// УВАГА: у MV3 слухаємо chrome.runtime.onMessage, а не chrome.extension.onRequest
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const command = request && request.command;

  switch (command) {
    case 'showAction': {
      // pageAction більше немає; керуємо звичайною action-кнопкою
      if (sender.tab && sender.tab.id != null) {
        chrome.action.enable(sender.tab.id);
        chrome.action.setTitle({ tabId: sender.tab.id, title: 'Browse WSDL…' });
      }
      sendResponse && sendResponse();
      break;
    }

    case 'openEditor': {
      // chrome.extension.getURL -> chrome.runtime.getURL
      const url =
        chrome.runtime.getURL('editor.html') +
        '#wsdl=' + encodeURIComponent(request.url) +
        '&addr=' + encodeURIComponent(request.address) +
        '&title=' + encodeURIComponent(request.title);

      chrome.tabs.create({ url }, () => sendResponse && sendResponse());
      break;
    }

    case 'ajax': {
      // У service worker MV3 краще використовувати fetch замість XHR
      fetch(request.url, {
        method: request.type || 'GET',
        headers: request.headers || {},
        body: request.data || undefined
      })
        .then(async (r) => {
          const text = await r.text();
          if (r.ok) {
            sendResponse && sendResponse({ type: 'success', args: [text] });
          } else {
            sendResponse && sendResponse({ type: 'error', status: r.status, body: text });
          }
        })
        .catch((e) => {
          sendResponse && sendResponse({ type: 'error', error: String(e) });
        });
      // ВАЖЛИВО: повертаємо true, щоб залишити порт відкритим для async sendResponse
      return true;
    }

    default:
      sendResponse && sendResponse();
  }
});
