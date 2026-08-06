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
    // 1. Groq Request with explicit state matching
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
            content: 'You are a smart home switch controller. Interpret user intent. Respond strictly with JSON: {"state": "ON"} or {"state": "OFF"}. Words like "on", "start", "enable", "light up" mean ON. Words like "off", "stop", "disable", "shut down", "turn off" mean OFF. Default to OFF if unsure.'
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
    const command = content.state.toUpperCase() === 'ON' ? 'ON' : 'OFF';

    // 2. MQTT Publishing with guaranteed packet flush
    const mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      connectTimeout: 5000,
      reconnectPeriod: 0
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        mqttClient.end(true);
        reject(new Error('MQTT Timeout'));
      }, 5000);

      mqttClient.on('connect', () => {
        mqttClient.publish('myuniqueuser123/esp32/led', command, { qos: 0 }, (err) => {
          clearTimeout(timeout);
          if (err) {
            mqttClient.end(true);
            return reject(err);
          }
          // Safely close connection AFTER message is sent
          mqttClient.end(false, () => {
            resolve();
          });
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