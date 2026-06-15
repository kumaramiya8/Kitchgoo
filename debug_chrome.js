import { spawn } from 'child_process';
import http from 'http';
import WebSocket from 'ws';

async function run() {
  console.log('1. Starting Chrome headless...');
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/chrome_dev_profile_' + Date.now()
  ]);

  chrome.on('exit', (code) => {
    console.log(`Chrome exited with code ${code}`);
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('2. Fetching debug targets...');
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  if (targets.length === 0) {
    console.error('No tabs found!');
    chrome.kill();
    return;
  }

  const target = targets.find(t => t.type === 'page') || targets[0];
  console.log(`Connecting to tab: ${target.title} (${target.url})`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let messageId = 1;
  const pendingRequests = new Map();

  ws.on('open', () => {
    console.log('WebSocket connected!');
    
    const send = (method, params = {}) => {
      const id = messageId++;
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    (async () => {
      try {
        console.log('Enabling Page, Runtime, and Network domains...');
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Network.enable');

        console.log('Navigating to QRMenu...');
        await send('Page.navigate', { url: 'http://localhost:5174/qrmenu/Kiko%20Cafe' });

        console.log('Waiting 6 seconds for page load & React render...');
        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log('Evaluating innerHTML of #root...');
        const rootDOM = await send('Runtime.evaluate', {
          expression: "document.getElementById('root').innerHTML",
          returnByValue: true
        });
        console.log('--- Rendered #root HTML ---');
        console.log(rootDOM.result.result.value || '[Empty]');
        console.log('---------------------------');

        console.log('Checking for any global JS errors...');
        const errors = await send('Runtime.evaluate', {
          expression: "window.__vite_plugin_react_preamble_installed__",
          returnByValue: true
        });
        console.log('Vite preamble check:', errors.result.result);

        const bodyClass = await send('Runtime.evaluate', {
          expression: "document.body.className",
          returnByValue: true
        });
        console.log('Body className:', bodyClass.result.result.value);

      } catch (err) {
        console.error('Error in interaction:', err);
      } finally {
        ws.close();
        chrome.kill();
      }
    })();
  });

  ws.on('message', (data) => {
    const response = JSON.parse(data);
    
    // Listen for console API calls
    if (response.method === 'Runtime.consoleAPICalled') {
      const args = response.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      console.log(`[Browser Console] [${response.params.type}] ${args}`);
    }
    
    // Listen for uncaught exceptions
    if (response.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', response.params.exceptionDetails);
    }

    // Listen for request failures
    if (response.method === 'Network.loadingFailed') {
      console.error(`[Network Failed] URL: ${response.params.requestId} Error: ${response.params.errorText}`);
    }

    if (response.method === 'Network.responseReceived') {
      const resp = response.params.response;
      if (resp.status >= 400) {
        console.error(`[HTTP Error] ${resp.status} ${resp.statusText} on URL: ${resp.url}`);
      }
    }

    if (response.id && pendingRequests.has(response.id)) {
      const { resolve } = pendingRequests.get(response.id);
      pendingRequests.delete(response.id);
      resolve(response);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    chrome.kill();
  });
}

run().catch(console.error);
