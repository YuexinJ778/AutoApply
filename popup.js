document.getElementById('readTitle').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    document.getElementById('result').textContent = 'No active tab found.';
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.title
    });

    const title = results && results[0] ? results[0].result : 'No title found';
    document.getElementById('result').textContent = `Page title: ${title}`;
  } catch (error) {
    document.getElementById('result').textContent = `Error: ${error.message}`;
  }
});