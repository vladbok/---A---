chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  } catch {
    // content script not yet injected — inject it first
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['panel.css'] });
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  }
});
