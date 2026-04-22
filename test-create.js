import axios from 'axios';

async function test() {
  try {
    const res = await axios.post('http://127.0.0.1:8080/instance/create', {
      instanceName: 'test-creation2',
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      // removing token: '' to see if it fixes it
      webhook: {
        enabled: true,
        url: 'http://host.docker.internal:4000/api/webhooks/evolution',
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT'
        ]
      }
    }, {
      headers: {
        'apikey': 'global-secret-token'
      }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

test();
