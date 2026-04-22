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
    console.log("Created. Initial QR:", JSON.stringify(res.data.qrcode));

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const res2 = await axios.get(`http://127.0.0.1:8080/instance/connect/test-${ts}`, {
        headers: { 'apikey': 'global-secret-token' }
      });
      console.log(`Poll ${i}:`, JSON.stringify(res2.data));
      if (res2.data.base64) {
        console.log("GOT QR!");
        break;
      }
    }
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

test();
