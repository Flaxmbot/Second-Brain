const MEDIATOR_URL = 'http://localhost:11435';

// Check connection on load
document.addEventListener('DOMContentLoaded', async () => {
    const connectionEl = document.getElementById('connectionStatus');

    try {
        const res = await fetch(`${MEDIATOR_URL}/api/status`);
        if (res.ok) {
            connectionEl.textContent = '✅ Connected to Internet Memory';
            connectionEl.style.color = '#10b981';
        } else {
            connectionEl.textContent = '❌ Cannot reach Internet Memory app';
            connectionEl.style.color = '#ef4444';
        }
    } catch {
        connectionEl.textContent = '❌ Internet Memory app not running';
        connectionEl.style.color = '#ef4444';
    }
});

// Capture button
document.getElementById('captureBtn').addEventListener('click', async () => {
    const btn = document.getElementById('captureBtn');
    const result = document.getElementById('result');
    const status = document.getElementById('status');

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Capturing...';
    status.textContent = 'Extracting page content...';
    status.style.display = 'block';

    try {
        // Get content from active tab via content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' });

        status.textContent = 'Sending to Internet Memory...';

        // Forward to background script → mediator
        chrome.runtime.sendMessage(
            { action: 'sendToMemory', data: response },
            (res) => {
                if (res && res.success) {
                    result.style.display = 'block';
                    result.innerHTML = `
            <div class="success">
              ✅ Saved to memory!<br>
              <span class="meta">${res.result.word_count || 0} words captured</span>
            </div>
          `;
                    status.style.display = 'none';
                } else {
                    result.style.display = 'block';
                    result.innerHTML = `
            <div class="error">
              ❌ Failed: ${res?.error || 'Unknown error'}<br>
              <span class="meta">Make sure the Internet Memory app is running</span>
            </div>
          `;
                    status.style.display = 'none';
                }
                btn.disabled = false;
                btn.innerHTML = '<span class="btn-icon">📥</span> Save to Memory';
            }
        );
    } catch (err) {
        result.style.display = 'block';
        result.innerHTML = `<div class="error">❌ Error: ${err.message}</div>`;
        status.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">📥</span> Save to Memory';
    }
});
