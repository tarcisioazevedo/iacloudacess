import axios from 'axios';

async function test() {
  try {
    const ts = Date.now();
    const res = await axios.post('http://127.0.0.1:8080/instance/create', {
      instanceName: `test-${ts}`,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    }, {
      headers: {
        'apikey': 'global-secret-token'
      }
    });
    console.log("Create Response:");
    console.log(JSON.stringify(res.data.qrcode, null, 2));

    await new Promise(r => setTimeout(r, 4000));
    const res2 = await axios.get(`http://127.0.0.1:8080/instance/connect/test-${ts}`, {
      headers: { 'apikey': 'global-secret-token' }
    });
    console.log("Connect Response:");
    console.log(JSON.stringify(res2.data, null, 2));
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

test();
