const http = require('http');

async function testApi() {
  try {
    const res = await fetch('http://localhost:3000/api/public/ip/public');
    const data = await res.json();
    console.log("Public IP:", data);
  } catch (e) {
    console.log("Public IP error:", e.message);
  }
}
testApi();
