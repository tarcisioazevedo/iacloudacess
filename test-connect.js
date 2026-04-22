import axios from 'axios';

async function test() {
  try {
    console.log('Fetching connect state...');
    const res = await axios.get('http://127.0.0.1:8080/instance/connect/test-creation', {
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
