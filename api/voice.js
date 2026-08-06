import mqtt from 'mqtt';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { speech } = req.body;
  if (!speech) {
    return res.status(400).json({ error: 'Missing speech input' });
  }

  try {
    // 1. Fast Groq AI Request (~50ms response time)
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are a home automation controller. Interpret user speech. Respond strictly with JSON formatted as {"state": "ON"} or {"state": "OFF"}. If ambiguous, default to {"state": "OFF"}.'
          },
          {
            role: 'user',
            content: speech
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0
      })
    });

    const groqData = await groqResponse.json();
    const content = JSON.parse(groqData.choices[0].message.content);
    const command = content.state.toUpperCase();

    // 2. Optimized MQTT over WebSockets for Serverless
    const mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      connectTimeout: 4000,
      reconnectPeriod: 0 // Prevents hanging on failure
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        mqttClient.end(true);
        reject(new Error('MQTT connection timed out'));
      }, 4000);

      mqttClient.on('connect', () => {
        mqttClient.publish('myuniqueuser123/esp32/led', command, { qos: 0 }, (err) => {
          clearTimeout(timeout);
          mqttClient.end(true);
          if (err) reject(err);
          else resolve();
        });
      });

      mqttClient.on('error', (err) => {
        clearTimeout(timeout);
        mqttClient.end(true);
        reject(err);
      });
    });

    return res.status(200).json({ success: true, command, speech });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}