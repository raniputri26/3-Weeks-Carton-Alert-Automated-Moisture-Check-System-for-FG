const fetch = require('node-fetch');
const config = require('./config');

async function sendMessage(target, message) {
  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': config.FONNTE_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target: target,
        message: message,
        countryCode: '62'
      })
    });
    
    const data = await response.json();
    console.log('Fonnte Response:', data);
    return data.status === true;
  } catch (error) {
    console.error('Error sending WA message via Fonnte:', error);
    return false;
  }
}

async function sendToGroup(message) {
  if (!config.WA_GROUP_ID || config.WA_GROUP_ID === 'YOUR_GROUP_ID_HERE') {
    console.log('WA Group ID not set. Skipping Fonnte message:\n', message);
    return true; // Simulate success for dev
  }
  return await sendMessage(config.WA_GROUP_ID, message);
}

module.exports = {
  sendMessage,
  sendToGroup
};
